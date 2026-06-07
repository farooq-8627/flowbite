/**
 * Leads capabilities. Each `run` calls the existing `*ForAI` internal
 * twins via the action ctx so the AI tool layer never re-implements
 * business logic; column + custom-field validation against live
 * `fieldDefinitions` is delegated to `_shared/aiEntityPatch.ts`.
 *
 * Surface registered here:
 *   - create_lead          new lead + optional custom fields
 *   - update_entity        column + custom-field patch over any entity
 *                          (lead / contact / deal / company), resolved by code
 *   - convert_lead         lead → contact (preserves personCode + aiContext)
 *   - get_entity_detail    full record by code (lead or contact in S3)
 *
 * `update_entity` is registered in this file (rather than per-entity)
 * because the underlying `applyEntityPatchByCode` is multi-entity by
 * design — it routes by `entityType` over the same column-vs-custom
 * splitter. It takes its `entityType` arg from the user, not from the
 * file's group.
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
import { failed, ok } from "../../../ai/registry/result";
import { dispatchSingleRecordFields } from "../../shared/dynamicFieldDispatch";

// ─── Group playbook ─────────────────────────────────────────────────────────

defineGroup({
	name: "leads",
	playbook: `Read first → search_crm by name/email/phone before any create. The lead's personCode (P-NNN) is the stable handle — return it in every reply touching a lead.

Create → call \`create_lead\` with at least \`displayName\`. Required clarifications: a name, plus phone OR email (the §2.3 auto-act minimum). \`customFields\` accepts org-defined fields keyed by name; values that don't match a live \`fieldDefinitions\` row come back as \`unknownFields\` — surface them so the user can fix the slug.

Update → resolve the target by code with \`update_entity\` (\`entityType:"lead"\` or \`"contact"\`, \`code:"P-007"\`). The patch can mix column fields (displayName/email/phone/status/source/assignedTo) and custom-field names in one call. Status moves to "converted" should go through \`convert_lead\` instead.

Convert → \`convert_lead\` only. Never patch \`status\` to "converted" via \`update_entity\` — \`convert_lead\` writes the contact row, propagates tags, rebalances counters.

Detail → \`get_entity_detail\` returns full column data + custom-field values for one record. Prefer it over \`search_crm\` when the user already gave a code.`,
});

// ─── create_lead ────────────────────────────────────────────────────────────

const createLead = defineCapability<{
	fields: Record<string, unknown>;
}>({
	name: "create_lead",
	module: "leads",
	group: "leads",
	permission: "leads.create",
	risk: "reversible", // soft-delete reverses the row; counters rebalance.
	channels: ["chat", "whatsapp", "mcp", "rest"],
	spec: {
		whenToCall:
			"Create a new lead (prospective customer). ALWAYS run search_crm first to dedupe; the underlying mutation rejects exact-email duplicates with a DUPLICATE error.",
		whenNotToCall:
			"the person already exists — call update_entity to edit them, or convert_lead to turn a P-NNN lead into a contact.",
		requiredClarifications: ["fields"],
		synonyms: ["add a lead", "new prospect", "capture this person"],
		goodExample: {
			fields: {
				displayName: "Sarah Khan",
				email: "sarah@example.com",
				phone: "+971 50 123 4567",
				source: "referral",
				industry_vertical: "SaaS",
				company_size: "51-200",
			},
		},
		badExample: {
			args: { fields: {} },
			why: "fields must include at least the required field(s) for a lead — call describe_entity first to see the live required-field list.",
		},
	},
	drive: {
		onSuccess:
			"Reply with one short sentence naming the personCode + displayName. Surface unknownFields if any — they're slug typos the user can fix.",
		onValidationError:
			"Read repair.field + repair.example, then re-call once with corrected args. The required-field list comes from describe_entity.",
		suggestNext: "Schedule a follow-up via create_task next.",
	},
	input: z.object({
		fields: z
			.record(z.string(), z.unknown())
			.refine((r) => Object.keys(r).length > 0, {
				message: "fields must contain at least one key/value pair.",
			})
			.describe(
				"FLAT field map — pass EVERY field at the top level keyed by canonical name OR user-facing label. The runner reads live `fieldDefinitions` for `lead` and dispatches each entry: column-backed → row args, fieldValues-backed → custom-field slot. No separate `customFields` wrapper needed. Call `describe_entity` first to see what fields the org accepts.",
			),
	}),
	run: async (cap, args) => {
		const { ctx, principal } = cap;

		// Locked 2026-06-06 evening — fully `fieldDefinitions`-driven.
		// The dispatcher reads the org's live field defs and routes
		// the flat `fields:` map: storage:"column" → columnArgs (row
		// args), storage:"fieldValues" → customFields, storage:"join"
		// → dropped (handled via dedicated tools). NO hardcoded field
		// knowledge in this capability — admin adds a new field via
		// the field manager and the AI can write to it on the next
		// turn with zero code change here.
		const dispatched = await dispatchSingleRecordFields(cap, "lead", {
			fields: args.fields,
		});

		// `lead.createForAI` requires `displayName` + `source` per its
		// validator. Surface a clear repair envelope when missing —
		// preferred over Convex's `ArgumentValidationError`.
		const displayName = dispatched.columnArgs.displayName;
		if (typeof displayName !== "string" || displayName.trim().length === 0) {
			return failed(
				"needs_repair",
				"`displayName` is required to create a lead. Call describe_entity to confirm the field name.",
			);
		}
		// Default source → "manual" if not supplied.
		if (!dispatched.columnArgs.source) {
			dispatched.columnArgs.source = "manual";
		}

		const created = (await ctx.runMutation(internal.crm.entities.leads.mutations.createForAI, {
			orgId: principal.orgId,
			userId: principal.userId,
			...dispatched.columnArgs,
			...(dispatched.customFields ? { customFields: dispatched.customFields } : {}),
		} as never)) as {
			leadId: Id<"leads">;
			personCode: string;
			appliedCustomFields: string[];
			unknownFields: string[];
		};

		const appliedCustomFields = created.appliedCustomFields;
		const unknownFields = [...created.unknownFields, ...dispatched.dropped];

		// Render every applied column + customField as a "changed" row.
		// No hardcoded field labels — the dispatcher's column keys are
		// the canonical names from fieldDefinitions, and the model
		// receives them verbatim.
		const changes = [
			{ label: "Code", value: created.personCode, emphasis: "added" as const },
			...Object.entries(dispatched.columnArgs).map(([key, value]) => ({
				label: key,
				value: String(value ?? ""),
				emphasis: "added" as const,
			})),
			...appliedCustomFields.map((name) => ({
				label: name,
				value: String(dispatched.customFields?.[name] ?? ""),
				emphasis: "added" as const,
			})),
		];
		const facts: string[] = [];
		if (unknownFields.length > 0) {
			facts.push(
				`Skipped (no field definition): ${unknownFields.join(", ")}. Create them via the workspace fields UI first.`,
			);
		}
		return ok({
			headline: `Created lead ${created.personCode}: ${displayName}`,
			changes,
			facts: facts.length > 0 ? facts : undefined,
			data: {
				leadId: created.leadId,
				personCode: created.personCode,
				appliedCustomFields,
				unknownFields,
			},
			display: {
				kind: "entity",
				entityType: "lead",
				entityId: created.leadId as unknown as string,
			},
			suggestedNext: [
				{
					label: "Schedule follow-up",
					intent: `Schedule a follow-up with ${created.personCode} for next week`,
				},
				{
					label: "Add note",
					intent: `Add a note to ${created.personCode}`,
				},
			],
		});
	},
});

// ─── update_entity ──────────────────────────────────────────────────────────

const updateEntity = defineCapability<{
	entityType: string;
	code: string;
	fields: Record<string, unknown>;
}>({
	name: "update_entity",
	module: "leads",
	group: "leads",
	permission: null, // permission is applied per-entity inside the *ForAI mutation.
	risk: "reversible",
	channels: ["chat", "whatsapp", "mcp", "rest"],
	spec: {
		whenToCall:
			"Patch a record by its code. Mixes column fields (displayName/email/phone/status/source/assignedTo for leads & contacts; per-entity columns for deals/companies) and org-defined custom fields in one call. Validates against live fieldDefinitions — unknown keys are returned, never silently dropped.",
		whenNotToCall:
			"the user wants to convert a lead — call convert_lead instead. Never patch status to 'converted' here.",
		requiredClarifications: ["entityType", "code", "fields"],
		synonyms: ["edit", "set", "change", "update"],
		goodExample: {
			entityType: "lead",
			code: "P-007",
			fields: { phone: "+971 50 999 0000", industry_vertical: "FinTech" },
		},
		badExample: {
			args: { entityType: "lead", code: "P-007", fields: { status: "converted" } },
			why: "Use convert_lead — it writes the contact row, propagates tags, rebalances counters.",
		},
	},
	drive: {
		onSuccess:
			"Narrate the changes table verbatim. If unknownFields is non-empty, name them so the user can fix the slug or create the field definition.",
		onValidationError:
			"Read repair.field — typically a missing entityType or empty fields. Re-call with the example shape.",
	},
	input: z.object({
		entityType: entityTypeSchema().describe(
			"Which entity to patch. Accepts canonical type or org-relabelled alias.",
		),
		code: z.string().min(1).describe("Entity code (P-NNN / D-NNN / C-NNN). Resolves to row."),
		fields: z
			.record(z.string(), z.unknown())
			.refine((r) => Object.keys(r).length > 0, {
				message: "fields must contain at least one key/value pair.",
			})
			.describe("Patch — mixes column + custom fields. Unknown keys are surfaced."),
	}),
	run: async (cap, args) => {
		const { ctx, principal } = cap;
		const validated = await validateEntityType(cap, args.entityType, {
			restrictTo: CORE_ENTITY_TYPES,
		});
		if (isEntityTypeError(validated)) return validated;
		const entityType = validated.entityType;
		// Locked 2026-06-06 — `applyEntityPatchByCode` routes through
		// `splitPatchForEntity` → `dispatchRowKeys`, which is fully
		// `fieldDefinitions`-driven. The dispatcher's lookup is keyed
		// case-insensitively by BOTH `name` and `label`, so a model
		// emitting `{"Property Type": "Apartment"}` lands at
		// `property_type` automatically — no pre-resolution needed
		// here. The `fields` slot mixes column + custom-field keys;
		// each is routed by `def.storage` + `def.columnKey`.
		// `applyEntityPatchByCode`'s validator is closed to the 4 cores;
		// we already validated against `CORE_ENTITY_TYPES` above so the
		// cast is type-only.
		const result = (await ctx.runMutation(internal.ai.aiEntityPatch.applyEntityPatchByCode, {
			orgId: principal.orgId,
			userId: principal.userId,
			entityType: entityType as "lead" | "contact" | "deal" | "company",
			code: args.code,
			patch: args.fields,
		})) as {
			entityType: string;
			entityId: string;
			canonicalCode: string;
			columnsApplied: string[];
			customFieldsApplied: Array<{ name: string; value: unknown }>;
			unknownFields: string[];
			before: Record<string, unknown>;
			after: Record<string, unknown>;
		};

		const changes = [
			...result.columnsApplied.map((key) => ({
				label: key,
				value: String(result.after[key] ?? ""),
				emphasis: "changed" as const,
			})),
			...result.customFieldsApplied.map((cf) => ({
				label: cf.name,
				value: String(cf.value ?? ""),
				emphasis: "changed" as const,
			})),
		];
		const facts: string[] = [];
		if (result.unknownFields.length > 0) {
			facts.push(
				`Skipped (no field definition): ${result.unknownFields.join(", ")}. Create them in the workspace fields UI first.`,
			);
		}
		if (changes.length === 0) {
			return failed("business_error", `No changes applied to ${result.canonicalCode}.`);
		}
		return ok({
			headline: `Updated ${entityType} ${result.canonicalCode}.`,
			changes,
			facts: facts.length > 0 ? facts : undefined,
			data: result,
			// Audit §2 fix — render the live entity card with the
			// updated fields instead of JSON. The entityType comes
			// straight from the user's argument; entityId is the
			// resolver's output (the canonical row id).
			display: {
				kind: "entity",
				entityType: entityType as "lead" | "contact" | "deal" | "company",
				entityId: result.entityId,
			},
		});
	},
});

// ─── convert_lead ───────────────────────────────────────────────────────────

const convertLead = defineCapability<{
	personCode: string;
	companyId?: string;
}>({
	name: "convert_lead",
	module: "leads",
	group: "leads",
	permission: "leads.convert",
	risk: "reversible",
	channels: ["chat", "mcp", "rest"], // not whatsapp — admin-ish stage transition.
	spec: {
		whenToCall:
			"Convert a lead (P-NNN) into a contact. Preserves personCode + aiContext + tags; counters rebalance (leads.open -1 / contacts.active +1).",
		whenNotToCall:
			"the lead is already converted (status === 'converted') — re-running throws ALREADY_CONVERTED.",
		requiredClarifications: ["personCode"],
		synonyms: ["promote", "make a contact", "qualify"],
		goodExample: { personCode: "P-007" },
		badExample: {
			args: { personCode: "Sarah Khan" },
			why: "personCode is the P-NNN code, not a name. Run search_crm first.",
		},
	},
	drive: {
		onSuccess:
			"Confirm the contact's personCode (same as the lead's) in one short sentence. Suggest the next step (link to a company / start a deal).",
	},
	input: z.object({
		personCode: z.string().min(1).describe("Lead's P-NNN code."),
		companyId: z.string().optional().describe("Optional company to link the new contact to."),
	}),
	run: async (cap, args) => {
		const { ctx, principal } = cap;
		// resolveRef has already injected `leadId` (via the generic 'code' or
		// the typed 'personCode' field — this capability declares both shapes).
		// biome-ignore lint/suspicious/noExplicitAny: resolver-augmented args carry the resolved id.
		const leadId = ((args as any).leadId ?? (args as any).entityId) as Id<"leads"> | undefined;
		if (!leadId) {
			return failed("not_found", `Could not resolve lead ${args.personCode}.`);
		}
		const result = (await ctx.runMutation(
			internal.crm.entities.leads.mutations.convertToContactForAI,
			{
				orgId: principal.orgId,
				userId: principal.userId,
				leadId,
				companyId: args.companyId as Id<"companies"> | undefined,
			},
		)) as { contactId: Id<"contacts">; personCode: string };
		return ok({
			headline: `Converted ${result.personCode} to a contact.`,
			changes: [
				{ label: "Code", value: result.personCode, emphasis: "unchanged" },
				{ label: "Status", value: "converted", emphasis: "changed" },
			],
			data: result,
			// Audit §2 fix — surface the new contact row's card. The
			// personCode is preserved across conversion (locked decision
			// #12), but the row id is the freshly-inserted contact
			// — point the card at it.
			display: {
				kind: "entity",
				entityType: "contact",
				entityId: result.contactId as unknown as string,
			},
			suggestedNext: [
				{ label: "Add note", intent: `Add a note to ${result.personCode}` },
				{ label: "Open a deal", intent: `Create a deal for ${result.personCode}` },
			],
		});
	},
});

// ─── get_entity_detail ──────────────────────────────────────────────────────

const getEntityDetail = defineCapability<{
	entityType: "lead" | "contact";
	personCode: string;
}>({
	name: "get_entity_detail",
	module: "leads",
	group: "leads",
	permission: null, // RBAC enforced inside the *ForAI query.
	risk: "safe",
	channels: ["chat", "whatsapp", "mcp", "rest"],
	spec: {
		whenToCall:
			"Fetch a single record's full column data + custom-field values when the user gave a code. Prefer over search_crm when the code is already in hand.",
		whenNotToCall: "the user only mentioned a name — search_crm first.",
		requiredClarifications: ["entityType", "personCode"],
		synonyms: ["show", "look up", "open", "view P-NNN"],
		goodExample: { entityType: "lead", personCode: "P-007" },
	},
	drive: {
		onSuccess:
			"Reply with the displayName + a few key facts (status, assigned, last touch). Don't dump every field — the UI card carries the table.",
		onEmpty: "No record under that code. Offer a search_crm fallback if the user used a name.",
	},
	input: z.object({
		entityType: z.enum(["lead", "contact"]),
		personCode: z.string().min(1).describe("Lead/contact P-NNN code."),
	}),
	run: async (cap, args) => {
		const { ctx, principal } = cap;
		const path =
			args.entityType === "lead"
				? internal.crm.entities.leads.queries.getByPersonCodeForAI
				: internal.crm.entities.contacts.queries.getByPersonCodeForAI;
		const row = (await ctx.runQuery(path, {
			orgId: principal.orgId,
			userId: principal.userId,
			personCode: args.personCode,
		})) as Record<string, unknown> | null;
		if (!row) {
			return failed("not_found", `No ${args.entityType} with code ${args.personCode}.`);
		}
		const displayName = String(row.displayName ?? "");
		const facts: string[] = [];
		if (row.email) facts.push(`Email: ${row.email}`);
		if (row.phone) facts.push(`Phone: ${row.phone}`);
		if (row.status) facts.push(`Status: ${row.status}`);
		if (row.source) facts.push(`Source: ${row.source}`);
		return ok({
			headline: `${displayName} (${args.personCode}).`,
			facts: facts.length > 0 ? facts : undefined,
			data: row,
			display: {
				kind: "entity",
				entityType: args.entityType,
				entityId: String(row._id),
			},
		});
	},
});

export const LEADS_CAPABILITIES = [createLead, updateEntity, convertLead, getEntityDetail];
