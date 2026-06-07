/**
 * Field-definition capabilities — the AI-callable surface for the dynamic
 * schema (per-org per-entity custom fields). Wraps the existing `*ForAI`
 * internal twins in `mutations.ts` + `queries.ts`; never re-implements
 * business logic. Reads happen via the always-on `describe_entity` core
 * tool — this group is write-only.
 *
 * Surface (4 caps in the `fields` group):
 *
 *   create_field    add a new field to lead/contact/deal/company (irreversible)
 *   update_field    relabel / require / re-option / hide / restrict-to-stages
 *   reorder_fields  re-sequence the field display order
 *   remove_field    hard-delete a field + its values (irreversible cascade)
 *
 * Group invariants (also baked into the playbook below — keep in sync):
 *
 *   1. Read live BEFORE every write — `describe_entity(entityType)` returns
 *      the current field set + types + options. Never guess field names.
 *   2. The mutation enforces a uniqueness guard on `(orgId, entityType, name)`.
 *      If the model creates a duplicate, the mutation throws `DUPLICATE` and
 *      the wrapper surfaces it as a `business_error` with the existing field's
 *      id — the model should switch to `update_field` instead.
 *   3. Protected system fields (e.g. personCode, displayName) cannot be
 *      hidden OR deleted. Assignee-kind fields cannot be deleted (only hidden)
 *      so the field-selector menu always has something to point at.
 *   4. `update_field.showInStages` is validated against the LIVE deal pipeline
 *      — passing unknown stage ids throws `INVALID_STAGE`. The model should
 *      call `list_pipelines` first to get current stage ids.
 *   5. Risk classification: `create_field` + `remove_field` = irreversible
 *      (schema edits). `update_field` + `reorder_fields` = reversible (no data
 *      loss, easily undone). S10 will fence the irreversible ops with 2FA.
 */
import { z } from "zod";
import { internal } from "../../../_generated/api";
import type { Id } from "../../../_generated/dataModel";
import {
	CORE_ENTITY_TYPES,
	entityTypeSchema,
	isEntityTypeError,
	validateEntityType,
} from "../../../_shared/entityTypes";
import { defineCapability } from "../../../ai/registry/define";
import { defineGroup } from "../../../ai/registry/groups";
import { ok } from "../../../ai/registry/result";

const FIELD_TYPE = z.enum([
	"text",
	"number",
	"select",
	"multiselect",
	"date",
	"boolean",
	"url",
	"email",
	"relation",
	"file",
	"files",
]);

// ─── Group playbook ─────────────────────────────────────────────────────────

defineGroup({
	name: "fields",
	playbook: `Read first → \`describe_entity(entityType)\` returns the current field set + types + options + sensitive/required flags. ALWAYS call it before \`create_field\` (to detect duplicates by name) and before \`update_field\` (to know the live state you're editing).

Create → \`create_field\` for a new custom field. The mutation enforces uniqueness on \`(orgId, entityType, name)\` — duplicates throw \`DUPLICATE\` with the existing field's id. \`select\` / \`multiselect\` types REQUIRE a non-empty \`options[]\` array — without it, surface a clarification ask. \`file\` / \`files\` types accept \`allowedFileTypes[]\` to whitelist categories (pdf / image / spreadsheet / etc.); empty = any file allowed.

Update → \`update_field\` for relabel / require / option-list / hide / restrict-to-stages / file-type whitelist edits. Protected fields (personCode, displayName, ...) reject \`hidden:true\` (\`PROTECTED\`). For deal fields, \`showInStages[]\` must reference live stage ids — call \`list_pipelines\` first.

Reorder → \`reorder_fields\` takes EVERY field id of an entity in the desired order. Partial lists silently leave other fields where they were.

Delete → \`remove_field\` is HARD-delete: the field row + every \`fieldValues\` record cascade. Protected fields throw \`PROTECTED\`; assignee-kind fields throw \`UNDELETABLE\` (hide them instead). Risk irreversible — S10 will require a confirm.

Permission: every write needs \`fieldDefinitions.manage\` (Owner / Admin). Reads happen via \`describe_entity\` (org-member gated).`,
});

// ─── create_field ───────────────────────────────────────────────────────────

const createField = defineCapability<{
	entityType: string;
	name: string;
	label: string;
	type:
		| "text"
		| "number"
		| "select"
		| "multiselect"
		| "date"
		| "boolean"
		| "url"
		| "email"
		| "relation"
		| "file"
		| "files";
	labelAr?: string;
	groupName?: string;
	required?: boolean;
	options?: string[];
	sensitive?: boolean;
	allowedFileTypes?: string[];
}>({
	name: "create_field",
	module: "fields",
	group: "fields",
	permission: "fieldDefinitions.manage",
	// HARD schema edit — adds a column the model + every consumer must respect.
	// No undo path other than `remove_field`. S10 will fence via 2FA.
	risk: "irreversible",
	channels: ["chat", "mcp", "rest"],
	spec: {
		whenToCall:
			"Add a new custom field to lead / contact / deal / company. Call `describe_entity` FIRST to detect duplicates by name (the mutation also enforces uniqueness server-side). For `select` / `multiselect` types `options[]` is required — without it the call returns a needs_repair envelope.",
		whenNotToCall:
			"a field with the same name already exists — call `update_field` to rebuild the option list / relabel / mark required. The user wants to add a stage to a deal pipeline — that's `add_stage`.",
		requiredClarifications: ["entityType", "name", "label", "type"],
		synonyms: ["add field", "create field", "new field", "new column", "add property"],
		goodExample: {
			entityType: "lead",
			name: "leadSource",
			label: "Lead Source",
			type: "select",
			options: ["Website", "Referral", "Cold call", "Event"],
			required: false,
		},
		badExample: {
			args: {
				entityType: "lead",
				name: "leadSource",
				label: "Lead Source",
				type: "select",
			},
			why: "select / multiselect REQUIRE a non-empty `options[]` array. Without it the field is unusable.",
		},
	},
	drive: {
		onSuccess:
			"Confirm with the field's label + type. Mention if it's required and (for select/multiselect) the option count.",
		onValidationError:
			"`DUPLICATE` → the field already exists; switch to `update_field` against the surfaced fieldId. Missing `options[]` for a select → ask the user for the option list, then retry.",
		onDenied: "Tell the user they need fieldDefinitions.manage permission.",
	},
	input: z
		.object({
			entityType: entityTypeSchema().describe(
				"Which entity owns this field. Accepts canonical type or org-relabelled alias.",
			),
			name: z
				.string()
				.min(1)
				.regex(
					/^[a-zA-Z][a-zA-Z0-9_]*$/,
					"name must start with a letter and contain only letters, digits, and underscores",
				)
				.describe("Stable internal name (camelCase). Used as the storage key."),
			label: z.string().min(1).describe("Human-readable label. Shown in UI."),
			type: FIELD_TYPE.describe("Storage + UI type. select/multiselect REQUIRE `options[]`."),
			labelAr: z.string().optional().describe("Optional Arabic label for RTL UIs."),
			groupName: z
				.string()
				.optional()
				.describe("Optional grouping (e.g. 'Contact info') for the field-editor sections."),
			required: z
				.boolean()
				.optional()
				.describe("If true, every form requires the field non-empty before save."),
			options: z
				.array(z.string().min(1))
				.optional()
				.describe(
					"Required when type is select / multiselect. Each entry is a literal option value.",
				),
			sensitive: z
				.boolean()
				.optional()
				.describe(
					"If true, hide the field from non-admin reads of the entity. The field is still writable by admins.",
				),
			allowedFileTypes: z
				.array(z.string().min(1))
				.optional()
				.describe(
					"For type:file/files only. Whitelist of category ids (e.g. pdf, image, spreadsheet). Empty array = any file allowed.",
				),
		})
		.refine(
			(v) =>
				v.type !== "select" && v.type !== "multiselect"
					? true
					: Array.isArray(v.options) && v.options.length > 0,
			{
				path: ["options"],
				message: "select / multiselect fields require a non-empty `options[]` array.",
			},
		),
	run: async (cap, args) => {
		const { ctx, principal } = cap;
		const validated = await validateEntityType(cap, args.entityType, {
			restrictTo: CORE_ENTITY_TYPES,
		});
		if (isEntityTypeError(validated)) return validated;
		const entityType = validated.entityType;
		const fieldId = (await ctx.runMutation(
			internal.crm.fields.fieldDefinitions.mutations.createForAI,
			{
				orgId: principal.orgId,
				userId: principal.userId,
				entityType,
				name: args.name,
				label: args.label,
				labelAr: args.labelAr,
				type: args.type,
				groupName: args.groupName,
				required: args.required,
				options: args.options,
				sensitive: args.sensitive,
				allowedFileTypes: args.allowedFileTypes,
			},
		)) as Id<"fieldDefinitions">;
		return ok({
			headline: `Created ${entityType} field "${args.label}".`,
			changes: [
				{ label: "Entity", value: entityType, emphasis: "unchanged" },
				{ label: "Field", value: args.label, emphasis: "added" },
				{ label: "Type", value: args.type, emphasis: "added" },
				...(args.required
					? [{ label: "Required", value: "yes", emphasis: "added" as const }]
					: []),
				...(args.options && args.options.length > 0
					? [
							{
								label: "Options",
								value: `${args.options.length} option${args.options.length === 1 ? "" : "s"}`,
								emphasis: "added" as const,
							},
						]
					: []),
				...(args.sensitive
					? [{ label: "Sensitive", value: "yes", emphasis: "added" as const }]
					: []),
			],
			data: { fieldId, entityType: args.entityType, name: args.name },
		});
	},
});

// ─── update_field ───────────────────────────────────────────────────────────

const updateField = defineCapability<{
	fieldId: string;
	label?: string;
	labelAr?: string;
	groupName?: string;
	required?: boolean;
	options?: string[];
	hidden?: boolean;
	showInStages?: string[];
	allowedFileTypes?: string[];
}>({
	name: "update_field",
	module: "fields",
	group: "fields",
	permission: "fieldDefinitions.manage",
	// Reversible — relabel / require / re-option / hide / show-in-stages don't
	// drop data; flipping back restores the prior state.
	risk: "reversible",
	channels: ["chat", "mcp", "rest"],
	spec: {
		whenToCall:
			"Patch one field's metadata: relabel, mark required, replace the option list, hide, restrict to specific deal stages, or set the allowed file-type whitelist.",
		whenNotToCall:
			"the user wants to delete the field (use `remove_field`) OR change its `type` (NOT supported — types are immutable; create a new field and migrate values).",
		requiredClarifications: ["fieldId"],
		synonyms: ["edit field", "rename field", "make required", "hide field", "update options"],
		goodExample: {
			fieldId: "k123abc",
			label: "Lead Source (revised)",
			required: true,
			options: ["Website", "Referral", "Cold call", "Event", "Webinar"],
		},
		badExample: {
			args: { fieldId: "k123abc" },
			why: "At least one editable field (label/required/options/...) must be supplied.",
		},
	},
	drive: {
		onSuccess: "Confirm with only the fields that actually changed.",
		onValidationError:
			"`PROTECTED` → the field is system-required; non-protected attributes (label, options) can still be changed but `hidden:true` is rejected. `INVALID_STAGE` → call `list_pipelines` to refresh the live stage ids.",
	},
	input: z
		.object({
			fieldId: z.string().min(1).describe("The field's Convex _id (from describe_entity)."),
			label: z.string().min(1).optional().describe("New display label."),
			labelAr: z.string().optional().describe("New Arabic label."),
			groupName: z.string().optional().describe("New grouping section name."),
			required: z.boolean().optional().describe("Toggle the required flag."),
			options: z
				.array(z.string().min(1))
				.optional()
				.describe(
					"REPLACE the option list (for select/multiselect). Pass [] to clear; the field becomes unselectable until refilled.",
				),
			hidden: z
				.boolean()
				.optional()
				.describe(
					"Hide the field from form/table UI. Protected fields reject this and throw PROTECTED.",
				),
			showInStages: z
				.array(z.string().min(1))
				.optional()
				.describe(
					"For deal fields only — restrict the field to specific pipeline stage ids. [] = show on every stage.",
				),
			allowedFileTypes: z
				.array(z.string().min(1))
				.optional()
				.describe(
					"For file/files fields only — whitelist of category ids. [] = any file allowed.",
				),
		})
		.refine(
			(v) =>
				v.label !== undefined ||
				v.labelAr !== undefined ||
				v.groupName !== undefined ||
				v.required !== undefined ||
				v.options !== undefined ||
				v.hidden !== undefined ||
				v.showInStages !== undefined ||
				v.allowedFileTypes !== undefined,
			{ message: "At least one editable field must be supplied." },
		),
	run: async (cap, args) => {
		const { ctx, principal } = cap;
		await ctx.runMutation(internal.crm.fields.fieldDefinitions.mutations.updateForAI, {
			orgId: principal.orgId,
			userId: principal.userId,
			fieldId: args.fieldId as Id<"fieldDefinitions">,
			...(args.label !== undefined ? { label: args.label } : {}),
			...(args.labelAr !== undefined ? { labelAr: args.labelAr } : {}),
			...(args.groupName !== undefined ? { groupName: args.groupName } : {}),
			...(args.required !== undefined ? { required: args.required } : {}),
			...(args.options !== undefined ? { options: args.options } : {}),
			...(args.hidden !== undefined ? { hidden: args.hidden } : {}),
			...(args.showInStages !== undefined ? { showInStages: args.showInStages } : {}),
			...(args.allowedFileTypes !== undefined
				? { allowedFileTypes: args.allowedFileTypes }
				: {}),
		});
		const changes: { label: string; value: string; emphasis: "changed" }[] = [];
		if (args.label !== undefined)
			changes.push({ label: "Label", value: args.label, emphasis: "changed" });
		if (args.labelAr !== undefined)
			changes.push({ label: "Arabic label", value: args.labelAr, emphasis: "changed" });
		if (args.groupName !== undefined)
			changes.push({ label: "Group", value: args.groupName, emphasis: "changed" });
		if (args.required !== undefined)
			changes.push({ label: "Required", value: String(args.required), emphasis: "changed" });
		if (args.options !== undefined)
			changes.push({
				label: "Options",
				value: `${args.options.length} option${args.options.length === 1 ? "" : "s"}`,
				emphasis: "changed",
			});
		if (args.hidden !== undefined)
			changes.push({ label: "Hidden", value: String(args.hidden), emphasis: "changed" });
		if (args.showInStages !== undefined)
			changes.push({
				label: "Show in stages",
				value:
					args.showInStages.length === 0
						? "every stage"
						: `${args.showInStages.length} stage${args.showInStages.length === 1 ? "" : "s"}`,
				emphasis: "changed",
			});
		if (args.allowedFileTypes !== undefined)
			changes.push({
				label: "Allowed file types",
				value:
					args.allowedFileTypes.length === 0 ? "any" : args.allowedFileTypes.join(", "),
				emphasis: "changed",
			});
		return ok({
			headline: "Field updated.",
			changes,
			data: { fieldId: args.fieldId },
		});
	},
});

// ─── reorder_fields ─────────────────────────────────────────────────────────

const reorderFields = defineCapability<{ fieldIds: string[] }>({
	name: "reorder_fields",
	module: "fields",
	group: "fields",
	permission: "fieldDefinitions.manage",
	risk: "reversible",
	channels: ["chat", "mcp", "rest"],
	spec: {
		whenToCall:
			"Reorder fields by passing every field id (for ONE entity type) in the desired display order. The mutation patches each field's `order` to its index in the array.",
		whenNotToCall:
			"the user wants to move ONE field (still call this with the full ordered list — there is no single-move verb). The user wants to add or remove a field (use `create_field` / `remove_field`).",
		requiredClarifications: ["fieldIds"],
		synonyms: ["reorder fields", "rearrange fields", "sort fields", "field order"],
		goodExample: {
			fieldIds: ["k_displayName", "k_email", "k_phone", "k_leadSource"],
		},
	},
	drive: {
		onSuccess:
			"Confirm with the count of fields reordered. The result card carries the new order.",
	},
	input: z.object({
		fieldIds: z
			.array(z.string().min(1))
			.min(1)
			.describe(
				"Field _ids in the desired order. ALL fields of the entity should be present.",
			),
	}),
	run: async (cap, args) => {
		const { ctx, principal } = cap;
		await ctx.runMutation(internal.crm.fields.fieldDefinitions.mutations.reorderForAI, {
			orgId: principal.orgId,
			userId: principal.userId,
			fieldIds: args.fieldIds as Id<"fieldDefinitions">[],
		});
		return ok({
			headline: `Reordered ${args.fieldIds.length} field${args.fieldIds.length === 1 ? "" : "s"}.`,
			changes: args.fieldIds.map((id, i) => ({
				label: `Position ${i + 1}`,
				value: id,
				emphasis: "changed" as const,
			})),
			data: { fieldIds: args.fieldIds },
		});
	},
});

// ─── remove_field ───────────────────────────────────────────────────────────

const removeField = defineCapability<{ fieldId: string }>({
	name: "remove_field",
	module: "fields",
	group: "fields",
	permission: "fieldDefinitions.manage",
	// HARD-delete on the field row PLUS cascade-purge of every fieldValues
	// record (batched 500 at a time, continued via internal scheduler). Schema
	// removal — irreversible. S10 will fence via 2FA.
	risk: "irreversible",
	channels: ["chat", "mcp", "rest"],
	spec: {
		whenToCall:
			"Delete a custom field permanently. Cascades to every `fieldValues` record (batched server-side). Protected fields (personCode, ...) throw PROTECTED — those can only be hidden. Assignee-kind fields throw UNDELETABLE — hide them instead.",
		whenNotToCall:
			"the user wants to disable the field temporarily (use `update_field` with `hidden:true`) OR change its option list (use `update_field` with new `options[]`).",
		requiredClarifications: ["fieldId"],
		synonyms: ["delete field", "drop field", "remove field"],
		goodExample: { fieldId: "k123abc" },
	},
	drive: {
		onSuccess:
			"Confirm in one short sentence. Mention deletion is permanent and cascades to every existing value.",
		onValidationError:
			"`PROTECTED` → tell the user the field is system-required; offer `update_field` with `hidden:true` instead. `UNDELETABLE` → tell the user assignee fields can't be deleted, only hidden.",
	},
	input: z.object({
		fieldId: z.string().min(1).describe("The field's Convex _id."),
	}),
	run: async (cap, args) => {
		const { ctx, principal } = cap;
		await ctx.runMutation(internal.crm.fields.fieldDefinitions.mutations.removeForAI, {
			orgId: principal.orgId,
			userId: principal.userId,
			fieldId: args.fieldId as Id<"fieldDefinitions">,
		});
		return ok({
			headline: "Field deleted (permanent).",
			changes: [
				{ label: "Field", value: args.fieldId, emphasis: "unchanged" },
				{ label: "State", value: "deleted", emphasis: "changed" },
			],
			facts: [
				"Hard-deleted; every fieldValues record was cascaded.",
				"The activity log preserves the audit trail.",
			],
			data: { fieldId: args.fieldId },
		});
	},
});

// ─── Public surface ─────────────────────────────────────────────────────────

export const FIELDS_CAPABILITIES = [createField, updateField, reorderFields, removeField];
