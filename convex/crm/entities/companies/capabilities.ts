/**
 * Companies capabilities — the AI-callable surface for the companies domain.
 * Wraps the existing `*ForAI` internal twins in `mutations.ts` + `queries.ts`;
 * never re-implements business logic.
 *
 * Surface (5 caps in the `companies` group):
 *
 *   create_company                new company in the org
 *   add_person_to_company         attach a P-NNN to a company (idempotent)
 *   remove_person_from_company    detach a P-NNN (idempotent)
 *   soft_delete_company           trash a company (reversible)
 *   get_company_detail            fetch one company by C-NNN code
 *
 * Group invariants (also baked into the playbook below — keep both in sync):
 *
 *   1. PERSON LINKS go through `add_person_to_company` / `remove_person_from_company`,
 *      NEVER `update_entity` patching `personCodes`. The dedicated mutations
 *      keep the indexed `companyMembers` join table in sync; a raw column
 *      patch leaves it stale and breaks O(1) lookups.
 *   2. `update_entity` (registered in the leads file) handles column +
 *      custom-field patches for companies (name, industry, website, size,
 *      assignedTo, custom fields). The playbook tells the model to use it
 *      for those patches.
 *   3. Hard-delete is NOT in this layer. `soft_delete_company` sets
 *      `deletedAt` and the trash drawer restores it; a follow-up stage
 *      ships the destructive 2FA path.
 */
import { z } from "zod";
import { internal } from "../../../_generated/api";
import type { Id } from "../../../_generated/dataModel";
import { defineCapability } from "../../../ai/registry/define";
import { defineGroup } from "../../../ai/registry/groups";
import { failed, ok } from "../../../ai/registry/result";
import { dispatchSingleRecordFields } from "../../shared/dynamicFieldDispatch";

// ─── Group playbook ─────────────────────────────────────────────────────────

defineGroup({
	name: "companies",
	playbook: `Read first → \`search_crm\` (entityType:"company") to resolve the companyCode (C-NNN); \`get_company_detail\` confirms a single company before any link / delete action. \`describe_entity\` (entityType:"company") returns the live custom-field set — call it BEFORE writing values you're not 100% sure of.

Create → \`create_company\`. Required: \`name\`. Optional: \`industry\`, \`website\`, \`size\`, \`assignedTo\`, \`personCodes\` (initial members), \`assignees\` (multi-assignee team). Resolve any P-NNN via \`search_crm\` first — never invent a code.

Update → \`update_entity\` (entityType:"company", code:"C-NNN") for column / custom-field patches (name, industry, website, size, assignedTo, custom fields). NEVER patch \`personCodes\` here — that's a JOIN, not a column. Use \`add_person_to_company\` / \`remove_person_from_company\` instead.

Person links → \`add_person_to_company\` (idempotent; O(1) via \`companyMembers\` join table). \`remove_person_from_company\` (idempotent). The mutation keeps both \`companies.personCodes[]\` AND the \`companyMembers\` join in sync.

Delete → \`soft_delete_company\` is reversible (trash). Hard-delete is not in this layer — surface "deletion is permanent — use the trash drawer to restore" if the user pushes for it.`,
});

// ─── create_company ─────────────────────────────────────────────────────────

const createCompany = defineCapability<{
	fields: Record<string, unknown>;
}>({
	name: "create_company",
	module: "companies",
	group: "companies",
	permission: "companies.create",
	risk: "reversible",
	channels: ["chat", "whatsapp", "mcp", "rest"],
	spec: {
		whenToCall:
			"Create a new company / account / organisation. ALWAYS run search_crm first by name AND website domain — companies frequently get duplicated under slight name variations ('Acme Corp' vs 'Acme Corporation'). Call describe_entity to see the live required-field list.",
		whenNotToCall:
			"the company already exists — call update_entity to edit it. To attach a person to an existing company, call add_person_to_company.",
		requiredClarifications: ["fields"],
		synonyms: ["account", "organisation", "business", "vendor", "customer org"],
		goodExample: {
			fields: {
				name: "Acme Corporation",
				industry: "Healthcare",
				website: "https://acme.io",
				size: "51-200",
				personCodes: ["P-001", "P-002"],
			},
		},
		badExample: {
			args: { fields: {} },
			why: "fields must include at least the required field(s) for a company — call describe_entity first.",
		},
	},
	drive: {
		onSuccess:
			"Reply with one short sentence naming the companyCode (C-NNN) + name. Surface unknownFields if any.",
		onValidationError:
			"Read repair.field + repair.example, then re-call once with corrected args.",
		suggestNext: "Add the primary contact + open a deal.",
	},
	input: z.object({
		fields: z
			.record(z.string(), z.unknown())
			.refine((r) => Object.keys(r).length > 0, {
				message: "fields must contain at least one key/value pair.",
			})
			.describe(
				"FLAT field map — pass EVERY field at the top level keyed by canonical name OR user-facing label. The runner reads live `fieldDefinitions` for `company` and dispatches each entry: column-backed → row args, fieldValues-backed → custom-field slot. Call `describe_entity` first to see what fields the org accepts.",
			),
	}),
	run: async (cap, args) => {
		const { ctx, principal } = cap;

		// Locked 2026-06-06 evening — fully `fieldDefinitions`-driven.
		// NO hardcoded field knowledge in this capability.
		const dispatched = await dispatchSingleRecordFields(cap, "company", {
			fields: args.fields,
		});

		const name = dispatched.columnArgs.name;
		if (typeof name !== "string" || name.trim().length === 0) {
			return failed(
				"needs_repair",
				"`name` is required to create a company. Call describe_entity to confirm the field name.",
			);
		}

		const created = (await ctx.runMutation(
			internal.crm.entities.companies.mutations.createForAI,
			{
				orgId: principal.orgId,
				userId: principal.userId,
				...dispatched.columnArgs,
			} as never,
		)) as { companyId: Id<"companies">; companyCode: string };

		// Apply custom fields.
		let appliedCustomFields: string[] = [];
		let unknownFields: string[] = [...dispatched.dropped];
		if (dispatched.customFields) {
			const result = (await ctx.runMutation(
				internal.ai.aiEntityPatch.applyCustomFieldsForRecord,
				{
					orgId: principal.orgId,
					userId: principal.userId,
					entityType: "company",
					entityId: created.companyId as unknown as string,
					customFields: dispatched.customFields,
				},
			)) as { applied: Array<{ name: string; value: unknown }>; unknown: string[] };
			appliedCustomFields = result.applied.map((f) => f.name);
			unknownFields = [...unknownFields, ...result.unknown];
		}

		// `personCodes` on the column is set by createForAI (the array
		// column), but the indexed `companyMembers` join needs separate
		// inserts. Pull from dispatched columnArgs (not hardcoded).
		const personCodes = dispatched.columnArgs.personCodes;
		if (Array.isArray(personCodes) && personCodes.length > 0) {
			for (const personCode of personCodes) {
				if (typeof personCode !== "string") continue;
				await ctx.runMutation(internal.crm.entities.companies.mutations.addPersonForAI, {
					orgId: principal.orgId,
					userId: principal.userId,
					companyId: created.companyId,
					personCode,
				});
			}
		}

		const changes = [
			{ label: "Code", value: created.companyCode, emphasis: "added" as const },
			...Object.entries(dispatched.columnArgs).map(([key, value]) => ({
				label: key,
				value: Array.isArray(value) ? value.join(", ") : String(value ?? ""),
				emphasis: "added" as const,
			})),
			...appliedCustomFields.map((cfName) => ({
				label: cfName,
				value: String(dispatched.customFields?.[cfName] ?? ""),
				emphasis: "added" as const,
			})),
		];
		const facts: string[] = [];
		if (unknownFields.length > 0) {
			facts.push(
				`Skipped (no field definition): ${unknownFields.join(", ")}. Create them in the workspace fields UI first.`,
			);
		}
		return ok({
			headline: `Created company ${created.companyCode}: ${name}`,
			changes,
			facts: facts.length > 0 ? facts : undefined,
			data: {
				companyId: created.companyId,
				companyCode: created.companyCode,
				appliedCustomFields,
				unknownFields,
			},
			display: {
				kind: "entity",
				entityType: "company",
				entityId: created.companyId as unknown as string,
			},
			suggestedNext: [
				{
					label: "Add primary contact",
					intent: `Create a contact at ${created.companyCode}`,
				},
				{
					label: "Open a deal",
					intent: `Create a deal for ${created.companyCode}`,
				},
				{
					label: "Add note",
					intent: `Add a note to ${created.companyCode}`,
				},
			],
		});
	},
});

// ─── add_person_to_company ──────────────────────────────────────────────────

const addPersonToCompany = defineCapability<{
	companyCode: string;
	personCode: string;
}>({
	name: "add_person_to_company",
	module: "companies",
	group: "companies",
	permission: "companies.update",
	risk: "reversible",
	channels: ["chat", "whatsapp", "mcp", "rest"],
	spec: {
		whenToCall:
			"Attach a person (P-NNN) to a company's member list. Idempotent — calling it twice is a no-op. Updates BOTH `companies.personCodes[]` AND the indexed `companyMembers` join table.",
		whenNotToCall:
			"the user wants to set a primary owner / assignee — that's `update_entity` (entityType:'company', fields:{assignedTo:'<userId>'}), NOT this. The user wants to detach — call remove_person_from_company.",
		requiredClarifications: ["companyCode", "personCode"],
		synonyms: [
			"link person to company",
			"add to company",
			"attach contact to org",
			"associate",
		],
		goodExample: { companyCode: "C-001", personCode: "P-007" },
		badExample: {
			args: { companyCode: "Acme", personCode: "Sarah" },
			why: "Both must be the canonical CODES (C-NNN / P-NNN). Resolve via search_crm first.",
		},
	},
	drive: {
		onSuccess:
			"Reply with one short sentence. If `alreadyMember` came back true, say so plainly — don't claim a state change that didn't happen.",
		onValidationError:
			"If either code didn't resolve, surface the failure plainly. Run search_crm to find the right code; do NOT retry with a guessed value.",
	},
	input: z.object({
		companyCode: z.string().min(1).describe("Company code (C-NNN)."),
		personCode: z.string().min(1).describe("Person code (P-NNN)."),
	}),
	run: async (cap, rawArgs) => {
		const { ctx, principal } = cap;
		const companyId = (rawArgs as unknown as { companyId?: string }).companyId as
			| Id<"companies">
			| undefined;
		if (!companyId) {
			return failed("not_found", `Could not resolve company ${rawArgs.companyCode}.`);
		}
		const result = (await ctx.runMutation(
			internal.crm.entities.companies.mutations.addPersonForAI,
			{
				orgId: principal.orgId,
				userId: principal.userId,
				companyId,
				personCode: rawArgs.personCode,
			},
		)) as { alreadyMember: boolean; companyName: string; companyCode: string };
		return ok({
			headline: result.alreadyMember
				? `${rawArgs.personCode} is already linked to ${result.companyCode} (${result.companyName}).`
				: `Linked ${rawArgs.personCode} to ${result.companyCode} (${result.companyName}).`,
			changes: [
				{ label: "Company", value: result.companyCode, emphasis: "unchanged" },
				{
					label: "Person",
					value: rawArgs.personCode,
					emphasis: result.alreadyMember ? "unchanged" : "added",
				},
			],
			data: result,
			display: {
				kind: "entity",
				entityType: "company",
				entityId: companyId as unknown as string,
			},
		});
	},
});

// ─── remove_person_from_company ─────────────────────────────────────────────

const removePersonFromCompany = defineCapability<{
	companyCode: string;
	personCode: string;
}>({
	name: "remove_person_from_company",
	module: "companies",
	group: "companies",
	permission: "companies.update",
	risk: "reversible",
	channels: ["chat", "whatsapp", "mcp", "rest"],
	spec: {
		whenToCall:
			"Detach a person from a company. Idempotent — if the person wasn't a member the call is a silent success.",
		whenNotToCall:
			"the user wants to delete the person entirely — call soft_delete on the lead/contact instead. The user wants to delete the company — call soft_delete_company.",
		requiredClarifications: ["companyCode", "personCode"],
		synonyms: ["unlink person", "detach", "remove from company"],
		goodExample: { companyCode: "C-001", personCode: "P-007" },
	},
	drive: {
		onSuccess:
			"Reply with one short sentence. If `wasMember` came back false, say plainly that the person wasn't linked.",
	},
	input: z.object({
		companyCode: z.string().min(1).describe("Company code (C-NNN)."),
		personCode: z.string().min(1).describe("Person code (P-NNN)."),
	}),
	run: async (cap, rawArgs) => {
		const { ctx, principal } = cap;
		const companyId = (rawArgs as unknown as { companyId?: string }).companyId as
			| Id<"companies">
			| undefined;
		if (!companyId) {
			return failed("not_found", `Could not resolve company ${rawArgs.companyCode}.`);
		}
		const result = (await ctx.runMutation(
			internal.crm.entities.companies.mutations.removePersonForAI,
			{
				orgId: principal.orgId,
				userId: principal.userId,
				companyId,
				personCode: rawArgs.personCode,
			},
		)) as { wasMember: boolean; companyName: string; companyCode: string };
		return ok({
			headline: result.wasMember
				? `Unlinked ${rawArgs.personCode} from ${result.companyCode} (${result.companyName}).`
				: `${rawArgs.personCode} was not linked to ${result.companyCode}.`,
			changes: [
				{ label: "Company", value: result.companyCode, emphasis: "unchanged" },
				{
					label: "Person",
					value: rawArgs.personCode,
					emphasis: result.wasMember ? "changed" : "unchanged",
				},
			],
			data: result,
			display: {
				kind: "entity",
				entityType: "company",
				entityId: companyId as unknown as string,
			},
		});
	},
});

// ─── soft_delete_company ────────────────────────────────────────────────────

const softDeleteCompany = defineCapability<{ companyCode: string }>({
	name: "soft_delete_company",
	module: "companies",
	group: "companies",
	permission: "companies.delete",
	risk: "reversible",
	channels: ["chat", "mcp", "rest"],
	spec: {
		whenToCall:
			"Trash a company — sets `deletedAt`. The trash drawer restores it. Cleans up the indexed `companyMembers` join table so dangling references can't survive.",
		whenNotToCall:
			"the user wants to detach a single person — call remove_person_from_company. Hard-delete is not in this layer.",
		requiredClarifications: ["companyCode"],
		synonyms: ["delete company", "trash company", "remove org", "drop company"],
		goodExample: { companyCode: "C-001" },
	},
	drive: {
		onSuccess:
			"Confirm in one short sentence. Mention the company is recoverable from the trash drawer.",
	},
	input: z.object({
		companyCode: z.string().min(1).describe("Company code (C-NNN)."),
	}),
	run: async (cap, rawArgs) => {
		const { ctx, principal } = cap;
		const companyId = (rawArgs as unknown as { companyId?: string }).companyId as
			| Id<"companies">
			| undefined;
		if (!companyId) {
			return failed("not_found", `Could not resolve company ${rawArgs.companyCode}.`);
		}
		await ctx.runMutation(internal.crm.entities.companies.mutations.softDeleteForAI, {
			orgId: principal.orgId,
			userId: principal.userId,
			companyId,
		});
		return ok({
			headline: `Trashed ${rawArgs.companyCode}.`,
			changes: [
				{ label: "Code", value: rawArgs.companyCode, emphasis: "unchanged" },
				{ label: "Status", value: "trashed (recoverable)", emphasis: "changed" },
			],
			facts: ["Recoverable from the trash drawer — soft-delete only."],
			data: { companyId, companyCode: rawArgs.companyCode },
			// Audit §2 fix — soft-deleted row still exists with
			// `deletedAt` set; the entity card renders in trash state.
			display: {
				kind: "entity",
				entityType: "company",
				entityId: companyId as unknown as string,
			},
		});
	},
});

// ─── get_company_detail ─────────────────────────────────────────────────────

const getCompanyDetail = defineCapability<{ companyCode: string }>({
	name: "get_company_detail",
	module: "companies",
	group: "companies",
	permission: "companies.view",
	risk: "safe",
	channels: ["chat", "whatsapp", "mcp", "rest"],
	spec: {
		whenToCall:
			"Read one company's full column data when the user gave a C-NNN code. Use BEFORE add_person_to_company / soft_delete_company so you confirm what you're acting on.",
		whenNotToCall: "the user only mentioned a name — search_crm first.",
		requiredClarifications: ["companyCode"],
		synonyms: ["show company", "open C-", "look up org"],
		goodExample: { companyCode: "C-001" },
	},
	drive: {
		onSuccess:
			"Reply with one short sentence naming the company + key facts (industry / website / member count). The card carries the full table.",
		onEmpty: "Surface the not-found plainly.",
	},
	input: z.object({
		companyCode: z.string().min(1).describe("Company code (C-NNN)."),
	}),
	run: async (cap, args) => {
		const { ctx, principal } = cap;
		const row = (await ctx.runQuery(
			internal.crm.entities.companies.queries.getByCompanyCodeForAI,
			{
				orgId: principal.orgId,
				userId: principal.userId,
				companyCode: args.companyCode,
			},
		)) as null | Record<string, unknown>;
		if (!row) {
			return failed("not_found", `No company with code ${args.companyCode}.`);
		}
		const facts: string[] = [];
		if (row.industry) facts.push(`Industry: ${row.industry}`);
		if (row.website) facts.push(`Website: ${row.website}`);
		if (row.size) facts.push(`Size: ${row.size}`);
		if (Array.isArray(row.personCodes)) facts.push(`Members: ${row.personCodes.length}`);
		return ok({
			headline: `${row.companyCode}: ${row.name}.`,
			facts,
			data: row,
			display: {
				kind: "entity",
				entityType: "company",
				entityId: String(row._id),
			},
		});
	},
});

// ─── Public surface ─────────────────────────────────────────────────────────

export const COMPANIES_CAPABILITIES = [
	createCompany,
	addPersonToCompany,
	removePersonFromCompany,
	softDeleteCompany,
	getCompanyDetail,
];
