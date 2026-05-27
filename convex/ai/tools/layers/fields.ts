/**
 * convex/ai/tools/layers/fields.ts — Custom field definition tools.
 *
 * Coverage (2026-05-24):
 *   - create_field        + commit_create_field   (twoStep)
 *   - update_field        + commit_update_field   (twoStep — diff-style preview)
 *   - remove_field        + commit_remove_field   (twoStep — destructive)
 *
 * Read companion lives in `tools/introspect.ts::list_entity_fields` (always-on
 * layer) so the AI never has to expand this layer just to look at the schema.
 */
import { z } from "zod";
import {
	entityTypeEnum,
	FIELD_TYPE_CLARIFICATION_OPTIONS,
	fieldTypeEnum,
	NEEDS_CLARIFICATION,
} from "../../../_shared/synonyms";
import { registerTool } from "../../toolRegistry";
import { propose, requirePermission, runTool, type ToolContext, toolMutation } from "../_shared";

let _ctx: ToolContext | null = null;
export function setFieldsContext(c: ToolContext): void {
	_ctx = c;
}
function getCtx(): ToolContext {
	if (!_ctx) throw new Error("fields ctx");
	return _ctx;
}

// ─── create_field ────────────────────────────────────────────────────────────

registerTool({
	name: "create_field",
	layer: "fields",
	permission: "fieldDefinitions.manage",
	requiredCapability: "premium",
	confirmation: "twoStep",
	approvalCategory: "settings",
	description: "Create a custom field on a CRM entity (lead / contact / deal / company).",
	runbook: {
		// Day 2 T1.5 (`PHASE-3-AI-AUDIT.md §6.5 E.T1.5`). Adding `preFlight`
		// at the top of the runbook fires when the model reads the prompt —
		// guidance that comes BEFORE error recovery so it's followed even
		// on a small model's first try.
		onSuccess:
			"PRE-FLIGHT FIRST: ALWAYS call `list_entity_fields(entityType)` before this tool to (a) confirm the entity exists, (b) detect duplicate labels. If a field with the same label already exists, do NOT create — call `update_field` or warn the user. After success: confirm with the field's label and type. Mention it appears in the entity's form on next render.",
		onValidationError:
			"If `options` is missing for select/multiselect, ask the user for the options list via `ask_user_input`. Don't retry without options. If `entityType` was rejected, the synonym map already handles plurals — re-read the user's intent and ask which entity (lead/contact/deal/company) if ambiguous.",
		onPermissionDenied:
			"Tell the user they need fieldDefinitions.manage permission. Suggest contacting an admin.",
	},
	schema: z.object({
		// Day 2 T1.4 — synonym coercion. `leads → lead`, `contacts → contact`,
		// etc. handled before the enum validator.
		entityType: entityTypeEnum(),
		label: z.string().describe("Human-readable label, e.g. 'Lead Source Detail'"),
		// Day 2 T1.4 — `picklist → select`, `checkbox → boolean`, and
		// `file/upload/attachment → __NEEDS_CLARIFICATION__` sentinel that
		// the execute branch maps to an `ask_user_choice` prompt.
		fieldType: fieldTypeEnum(),
		options: z
			.optional(z.array(z.string()))
			.describe("Required for select/multiselect; ignored otherwise"),
		required: z.optional(z.boolean()).default(false),
		groupName: z
			.optional(z.string())
			.describe("Optional group label, e.g. 'Qualification' or 'Property'"),
	}),
	example: {
		entityType: "lead",
		label: "Lead Source Detail",
		fieldType: "select",
		options: ["Cold call", "Web form", "Referral"],
		required: false,
	},
	execute: async (args) => {
		const { permissions } = getCtx();
		requirePermission(permissions, "fieldDefinitions.manage");
		// Day 2 T1.4 — handle the synonym sentinel by asking the user
		// which canonical fieldType they meant. Returning a propose-shape
		// for `ask_user_choice` keeps the orchestrator pause/resume flow
		// unchanged: streamLoop sees `requiresConfirmation: true`, the
		// model is told to wait, the user picks one option, resume kicks
		// the loop back in with the selected value.
		if (args.fieldType === NEEDS_CLARIFICATION) {
			return propose(
				"ask_user_choice",
				{
					prompt: `What kind of field is "${args.label}"? "File" / "upload" / "attachment" aren't custom field types — they need the file uploads layer (coming later). Pick the closest match:`,
					options: FIELD_TYPE_CLARIFICATION_OPTIONS,
				},
				{
					title: `Clarify field type for "${args.label}"`,
					fields: [
						{ label: "Entity", value: args.entityType },
						{ label: "Label", value: args.label },
						{
							label: "Note",
							value: "File/attachment fields aren't supported as custom field types yet — pick a text/url/select equivalent or wait for the files layer.",
						},
					],
				},
			);
		}
		return propose("create_field", args, {
			title: `Create ${args.fieldType} field: ${args.label}`,
			fields: [
				{ label: "Entity", value: args.entityType },
				{ label: "Label", value: args.label },
				{ label: "Type", value: args.fieldType },
				{ label: "Options", value: args.options ?? [] },
				{ label: "Required", value: args.required ? "Yes" : "No" },
			],
		});
	},
});

registerTool({
	name: "commit_create_field",
	layer: "fields",
	permission: "fieldDefinitions.manage",
	confirmation: "none",
	description: "Internal: commit field creation.",
	schema: z.object({
		// Day 2 T1.4 — coerce here too in case the resume layer ever
		// hands us non-canonical input. Defence in depth.
		entityType: entityTypeEnum(),
		label: z.string(),
		fieldType: z.string(),
		options: z.optional(z.array(z.string())),
		required: z.optional(z.boolean()),
		groupName: z.optional(z.string()),
	}),
	execute: async (args) =>
		runTool(async () => {
			const { orgId, permissions } = getCtx();
			requirePermission(permissions, "fieldDefinitions.manage");
			// Defensive — Zod schema requires `label`, but if a caller
			// (e.g. resume.ts dispatch) hands us a stale or partial
			// payload we'd rather fail with a readable message than
			// crash the whole action with a TypeError.
			const label = typeof args.label === "string" ? args.label.trim() : "";
			if (!label) {
				return {
					ok: false as const,
					error: "Cannot create field: `label` is missing or empty.",
					code: "MISSING_LABEL",
				};
			}
			const entityType = typeof args.entityType === "string" ? args.entityType : null;
			const fieldType = typeof args.fieldType === "string" ? args.fieldType : null;
			if (!entityType || !fieldType) {
				return {
					ok: false as const,
					error: "Cannot create field: `entityType` and `fieldType` are required.",
					code: "MISSING_ARGS",
				};
			}
			// The DB layer expects `name` (machine-safe) and `type`. We synthesise
			// `name` from the label so the model doesn't have to think about it.
			const name = label
				.toLowerCase()
				.replace(/[^a-z0-9]+/g, "_")
				.replace(/^_+|_+$/g, "")
				.slice(0, 60);
			const result = await toolMutation(
				getCtx(),
				"crm/fields/fieldDefinitions/mutations:create",
				{
					orgId,
					entityType,
					name,
					label,
					type: fieldType,
					options: args.options,
					required: args.required ?? false,
					groupName: args.groupName,
				},
			);
			return {
				ok: true as const,
				data: result,
				display: `✅ Field "${label}" created on ${entityType}.`,
			};
		}),
});

// ─── update_field ────────────────────────────────────────────────────────────

registerTool({
	name: "update_field",
	layer: "fields",
	permission: "fieldDefinitions.manage",
	requiredCapability: "premium",
	confirmation: "twoStep",
	approvalCategory: "settings",
	description:
		"Update a custom field's label, options, required flag, group, or visibility (hidden).",
	runbook: {
		onSuccess: "Confirm what changed in one short sentence.",
		onValidationError:
			"If fieldId doesn't resolve, call list_entity_fields to find the right id first.",
	},
	schema: z.object({
		fieldId: z.string().describe("Pass the row's _id (e.g. 'jh78…')"),
		label: z.optional(z.string()),
		options: z.optional(z.array(z.string())),
		required: z.optional(z.boolean()),
		groupName: z.optional(z.string()),
		hidden: z.optional(z.boolean()).describe("True to hide from forms but keep data"),
	}),
	execute: async (args) => {
		const { permissions } = getCtx();
		requirePermission(permissions, "fieldDefinitions.manage");
		const previewFields: Array<{ label: string; value: unknown }> = [];
		if (args.label !== undefined) previewFields.push({ label: "New label", value: args.label });
		if (args.options !== undefined)
			previewFields.push({ label: "Options", value: args.options });
		if (args.required !== undefined)
			previewFields.push({ label: "Required", value: args.required ? "Yes" : "No" });
		if (args.groupName !== undefined)
			previewFields.push({ label: "Group", value: args.groupName });
		if (args.hidden !== undefined)
			previewFields.push({ label: "Hidden", value: args.hidden ? "Yes" : "No" });
		return propose("update_field", args, {
			title: `Update field`,
			fields:
				previewFields.length > 0
					? previewFields
					: [{ label: "Field", value: args.fieldId }],
		});
	},
});

registerTool({
	name: "commit_update_field",
	layer: "fields",
	permission: "fieldDefinitions.manage",
	confirmation: "none",
	description: "Internal: commit field update.",
	schema: z.object({
		fieldId: z.string(),
		label: z.optional(z.string()),
		options: z.optional(z.array(z.string())),
		required: z.optional(z.boolean()),
		groupName: z.optional(z.string()),
		hidden: z.optional(z.boolean()),
	}),
	execute: async (args) =>
		runTool(async () => {
			const { orgId, permissions } = getCtx();
			requirePermission(permissions, "fieldDefinitions.manage");
			await toolMutation(getCtx(), "crm/fields/fieldDefinitions/mutations:update", {
				orgId,
				...args,
			});
			return {
				ok: true as const,
				data: args,
				display: `✅ Field updated.`,
			};
		}),
});

// ─── remove_field ────────────────────────────────────────────────────────────

registerTool({
	name: "remove_field",
	layer: "fields",
	permission: "fieldDefinitions.manage",
	requiredCapability: "premium",
	confirmation: "twoStep",
	approvalCategory: "settings",
	description:
		"Permanently delete a custom field. Existing values for that field are also deleted (cascade). Use update_field with hidden=true if you only want to hide it.",
	runbook: {
		onSuccess: "Confirm in one sentence; remind that the data is gone.",
		onValidationError:
			"If fieldId is wrong, call list_entity_fields to find the right id first.",
	},
	schema: z.object({
		fieldId: z.string(),
		label: z.string().describe("For preview — pass the field's current label"),
	}),
	execute: async (args) => {
		const { permissions } = getCtx();
		requirePermission(permissions, "fieldDefinitions.manage");
		return propose("remove_field", args, {
			title: `Delete field: ${args.label}`,
			fields: [
				{ label: "Field", value: args.label },
				{
					label: "Warning",
					value: "All existing values for this field will be permanently deleted (cannot be undone).",
				},
			],
		});
	},
});

registerTool({
	name: "commit_remove_field",
	layer: "fields",
	permission: "fieldDefinitions.manage",
	confirmation: "none",
	description: "Internal: commit field removal.",
	schema: z.object({ fieldId: z.string(), label: z.optional(z.string()) }),
	execute: async (args) =>
		runTool(async () => {
			const { orgId, permissions } = getCtx();
			requirePermission(permissions, "fieldDefinitions.manage");
			await toolMutation(getCtx(), "crm/fields/fieldDefinitions/mutations:remove", {
				orgId,
				fieldId: args.fieldId,
			});
			return {
				ok: true as const,
				data: args,
				display: `✅ Field "${args.label ?? "deleted"}" removed.`,
			};
		}),
});

// ─── reorder_field_definitions (P1.3 G-2) ──────────────────────────────────
//
// Setup-time gesture: re-rank the existing custom-field rows by id. The
// position in the array becomes the field's `order`. Atomic — admins
// drag fields around in Settings; one-shot patch is the natural shape.

registerTool({
	name: "reorder_field_definitions",
	layer: "fields",
	permission: "fieldDefinitions.manage",
	confirmation: "none",
	description:
		"Reorder custom field definitions for the workspace. Provide every fieldId in the desired order; the array index becomes the field's `order`.",
	instruction: {
		whenToCall:
			"Admin says 'reorder fields', 'put X above Y on the form', 'move <field> to the top of the form', or supplies a complete ordered list of fieldIds for one entityType.",
		whenNotToCall:
			"the user wants to reorder PIPELINE STAGES (use reorder_stages) OR change a single field's properties (use update_field).",
		preflight: ["list_entity_fields"],
		requiredClarifications: ["fieldIds"],
		synonyms: [
			"reorder fields",
			"sort fields",
			"rearrange fields",
			"order fields",
			"move field",
		],
		goodExample: {
			description:
				"User: 'Put the Budget field above the Address field in the deal form.' (model resolved both ids from list_entity_fields)",
			args: {
				fieldIds: ["k_budget_id", "k_address_id", "k_otherFieldId"],
			},
		},
		badExample: {
			description: "User: 'Move budget to the top.'",
			args: { fieldIds: ["k_budget_id"] },
			whyBad: "fieldIds must be the COMPLETE ordered list. A single id replaces the whole order — every other field would slip to position N.",
		},
	},
	runbook: {
		onSuccess: "Confirm in one short sentence with how many fields were reordered.",
		onPermissionDenied:
			"Tell the user they need fieldDefinitions.manage. Suggest contacting an admin.",
	},
	schema: z.object({
		fieldIds: z
			.array(z.string().min(1))
			.min(1)
			.describe(
				"Complete ordered list of fieldDefinition _ids. The first id becomes order=0.",
			),
	}),
	execute: async (args) =>
		runTool(async () => {
			const { orgId, permissions } = getCtx();
			requirePermission(permissions, "fieldDefinitions.manage");
			await toolMutation(getCtx(), "crm/fields/fieldDefinitions/mutations:reorder", {
				orgId,
				fieldIds: args.fieldIds,
			});
			return {
				ok: true as const,
				data: { count: args.fieldIds.length },
				display: {
					kind: "text" as const,
					text: `✅ Reordered ${args.fieldIds.length} fields.`,
				},
			};
		}),
});
