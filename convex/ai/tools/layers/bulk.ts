/**
 * convex/ai/tools/layers/bulk.ts — Bulk operation tools (always two-step).
 *
 * Gating note (2026-05-29): bulk tools are no longer `requiredCapability:
 * "premium"` — every model tier can bulk-create/update/close so users can
 * onboard and seed data in one shot instead of one record at a time. The
 * `bulk` approval category stays HARD-LOCKED twoStep (aiApprovals.ts), so a
 * single approval card still gates the whole batch.
 *
 * Stage 10 of `/SPRINT-PLAN.md` — bulk-progress reporting. The
 * `commit_*` handlers now use `convex/_shared/bulkProgress.ts` to
 * accumulate per-row failures and surface a `ToolSummary` with a
 * row-level diff + retry chips, replacing the silent
 * `{ succeeded, failed }` counter shipped before Stage 10.
 */

import { z } from "zod";
import { internal } from "../../../_generated/api";
import {
	createBulkStats,
	recordBulkFailure,
	recordBulkSuccess,
	summariseBulkResults,
} from "../../../_shared/bulkProgress";
import { entityTypeEnum } from "../../../_shared/synonyms";
import { registerTool } from "../../toolRegistry";
import {
	coerceStringArray,
	propose,
	requirePermission,
	runTool,
	type ToolContext,
	toolMutation,
	toolQuery,
} from "../_shared";

let _ctx: ToolContext | null = null;
export function setBulkContext(c: ToolContext): void {
	_ctx = c;
}
function getCtx(): ToolContext {
	if (!_ctx) throw new Error("bulk ctx");
	return _ctx;
}

const ENTITY_UPDATE_PERM: Record<string, string> = {
	lead: "leads.update",
	contact: "contacts.update",
	deal: "deals.update",
	company: "companies.update",
};

const ENTITY_UPDATE_MUTATION: Record<string, string> = {
	lead: "crm/entities/leads/mutations:update",
	contact: "crm/entities/contacts/mutations:update",
	deal: "crm/entities/deals/mutations:update",
	company: "crm/entities/companies/mutations:update",
};

/**
 * Per-entity create config for `bulk_create_entities`. Each row is
 * stripped to `allow` (so propose-only keys like `notes`/`customFields`
 * never reach the create validator), forwarded to `mutation` (the
 * helper appends `ForAI`), and `customFields` are applied best-effort
 * after creation. `nameOf` powers the preview + failure labels.
 */
type CreateCfg = {
	perm: string;
	mutation: string;
	idKey: string;
	codeKey: string;
	allow: string[];
	nameOf: (row: Record<string, unknown>) => string;
};
const ENTITY_CREATE_CONFIG: Record<"lead" | "contact" | "deal" | "company", CreateCfg> = {
	lead: {
		perm: "leads.create",
		mutation: "crm/entities/leads/mutations:create",
		idKey: "leadId",
		codeKey: "personCode",
		allow: ["displayName", "email", "phone", "source", "assignedTo"],
		nameOf: (r) => String(r.displayName ?? "Untitled lead"),
	},
	contact: {
		perm: "contacts.create",
		mutation: "crm/entities/contacts/mutations:create",
		idKey: "contactId",
		codeKey: "personCode",
		allow: ["firstName", "lastName", "email", "phone", "jobTitle", "companyId"],
		nameOf: (r) => `${r.firstName ?? ""} ${r.lastName ?? ""}`.trim() || "Unnamed contact",
	},
	deal: {
		perm: "deals.create",
		mutation: "crm/entities/deals/mutations:create",
		idKey: "dealId",
		codeKey: "dealCode",
		allow: ["title", "value", "pipelineId", "personCode", "expectedCloseDate"],
		nameOf: (r) => String(r.title ?? "Untitled deal"),
	},
	company: {
		perm: "companies.create",
		mutation: "crm/entities/companies/mutations:create",
		idKey: "companyId",
		codeKey: "companyCode",
		allow: ["name", "website", "industry"],
		nameOf: (r) => String(r.name ?? "Unnamed company"),
	},
};

/**
 * Per-entity defaults applied to each row BEFORE the colArgs filter.
 *
 * The single-record `create_lead` propose schema has
 * `source: z.string().default("manual")` (see crud/createLead.ts), so
 * the default fires on the propose side. The bulk path's row schema is
 * `z.record(z.string(), z.unknown())` — no per-row defaults — so a
 * model that omits `source` reaches the leads `create` validator
 * (`source: v.string()` — required) and fails with
 * `ArgumentValidationError: Object is missing the required field "source"`.
 *
 * 2026-05-30 regression: reproduced when "create 10 leads so I can
 * explore" routed to bulk_create_entities and the model produced rows
 * without a `source` key — every row hit the same validator error and
 * the user saw a wall of identical "ArgumentValidationError" rows.
 *
 * Defaults stay narrow: only the column fields whose underlying
 * mutation validator is non-optional. Contacts / deals / companies
 * have no required-with-default columns today, so they get an empty
 * map and the loop is a no-op for them.
 */
const ENTITY_CREATE_DEFAULTS: Record<keyof typeof ENTITY_CREATE_CONFIG, Record<string, unknown>> = {
	lead: { source: "manual" },
	contact: {},
	deal: {},
	company: {},
};

/**
 * Soft-delete mutation paths per entity. Mirrors `delete_entity` but
 * the bulk_delete_entities tool dispatches by entityType from one
 * loop instead of per-call. The codes ("lead" / "contact" / "deal" /
 * "company") line up with the public CRUD entities; notes + tasks are
 * deliberately excluded — they have their own bulk paths and a
 * different cascade-impact UX.
 */
const ENTITY_DELETE_MUTATION: Record<keyof typeof ENTITY_CREATE_CONFIG, string> = {
	lead: "crm/entities/leads/mutations:softDelete",
	contact: "crm/entities/contacts/mutations:softDelete",
	deal: "crm/entities/deals/mutations:softDelete",
	company: "crm/entities/companies/mutations:softDelete",
};

const ENTITY_DELETE_PERM: Record<keyof typeof ENTITY_CREATE_CONFIG, string> = {
	lead: "leads.delete",
	contact: "contacts.delete",
	deal: "deals.delete",
	company: "companies.delete",
};

/**
 * Resolve a code OR raw `_id` to the entity's Convex `_id`.
 *
 * Heuristic: codes always contain a hyphen (`P-001`, `D-007`, `CO-014`,
 * `T-003`); raw Convex `_id`s are 32-char base32 strings without
 * hyphens. If the input doesn't contain a hyphen, we trust it as an
 * `_id` and forward unchanged — the underlying mutation's `v.id("…")`
 * validator will catch any garbage.
 *
 * If the input is a code, we route to the entity-specific
 * `getByPersonCode` / `getByDealCode` / `getByCompanyCode` query —
 * each is an indexed lookup against `by_org_and_personCode` (or
 * `_dealCode` / `_companyCode`), so this stays O(1) per row.
 *
 * Returns `null` when the code didn't match any record. The bulk-loop
 * caller surfaces the failure as a per-row `recordBulkFailure` so the
 * user sees exactly which codes were unresolvable.
 *
 * Added 2026-05-30 after the user reported "delete all leads with
 * empty fields" failed with `ArgumentValidationError: Value does not
 * match validator. Path: .leadId Value: "P-001" Validator: v.id("leads")` —
 * the model passed personCodes, the underlying validator wanted raw
 * `_id`s, every row failed identically. The bulk tools now accept
 * EITHER format, mixed within the same array.
 */
async function resolveBulkEntityId(
	tc: ToolContext,
	entityType: keyof typeof ENTITY_CREATE_CONFIG,
	codeOrId: string,
): Promise<string | null> {
	if (!codeOrId.includes("-")) return codeOrId;

	if (entityType === "lead") {
		const lead = (await toolQuery(tc, "crm/entities/leads/queries:getByPersonCode", {
			orgId: tc.orgId,
			personCode: codeOrId,
		})) as { _id: string } | null;
		return lead?._id ?? null;
	}
	if (entityType === "contact") {
		const contact = (await toolQuery(tc, "crm/entities/contacts/queries:getByPersonCode", {
			orgId: tc.orgId,
			personCode: codeOrId,
		})) as { _id: string } | null;
		return contact?._id ?? null;
	}
	if (entityType === "deal") {
		const deal = (await toolQuery(tc, "crm/entities/deals/queries:getByDealCode", {
			orgId: tc.orgId,
			dealCode: codeOrId,
		})) as { _id: string } | null;
		return deal?._id ?? null;
	}
	if (entityType === "company") {
		const company = (await toolQuery(tc, "crm/entities/companies/queries:getByCompanyCode", {
			orgId: tc.orgId,
			companyCode: codeOrId,
		})) as { _id: string } | null;
		return company?._id ?? null;
	}
	return null;
}

registerTool({
	name: "bulk_update_entities",
	layer: "bulk",
	permission: null, // checked per-entityType
	// DEFERRED: see Future-Enhancements.md §A — bulk premium model-tier gate
	//          removed 2026-05-29 so every tier can bulk-onboard/seed data.
	//          (`bulk` is still hard-locked twoStep per aiApprovals.ts.)
	confirmation: "twoStep",
	approvalCategory: "bulk",
	description:
		"Update multiple entities at once. Provide entityIds (max 200) and patch. `entityIds` accepts EITHER raw Convex _ids OR public codes (P-XXX for leads/contacts, D-XXX for deals, CO-XXX for companies) — mix and match. Codes are resolved automatically via the entity's index. Use this for column patches (status, source, assignedTo, customFields) — NEVER to fake a delete by clearing fields (use bulk_delete_entities for that).",
	runbook: {
		onSuccess: "Confirm with the count of records updated.",
		onPartialSuccess:
			"List how many succeeded vs failed. Offer to retry the failed rows when the user is ready.",
		onValidationError:
			"If patch is empty or entityIds is empty, ask the user what to update and on which records. If a row's code didn't resolve, the failure message will say so verbatim — surface it.",
		onPermissionDenied:
			"Tell the user they need <entity>.update permission. Suggest contacting an admin.",
	},
	schema: z.object({
		entityType: entityTypeEnum(),
		entityIds: coerceStringArray(
			z
				.array(z.string())
				.min(1)
				.max(200)
				.describe(
					"Convex _id OR public code (P-XXX / D-XXX / CO-XXX). Mix of formats accepted.",
				),
		),
		patch: z.record(z.string(), z.unknown()),
	}),
	execute: async (args) => {
		const { permissions } = getCtx();
		requirePermission(permissions, ENTITY_UPDATE_PERM[args.entityType] ?? "leads.update");
		return propose("bulk_update_entities", args, {
			title: `Bulk update ${args.entityIds.length} ${args.entityType}s`,
			fields: [
				{ label: "Count", value: args.entityIds.length },
				{
					label: "Sample",
					value:
						args.entityIds.slice(0, 3).join(", ") +
						(args.entityIds.length > 3 ? `, +${args.entityIds.length - 3} more` : ""),
				},
				{ label: "Patch keys", value: Object.keys(args.patch).join(", ") },
			],
		});
	},
});

registerTool({
	name: "commit_bulk_update_entities",
	layer: "bulk",
	permission: null,
	confirmation: "none",
	description: "Internal: commit bulk update. Runs serially to respect rate limits.",
	schema: z.object({
		entityType: entityTypeEnum(),
		entityIds: coerceStringArray(z.array(z.string())),
		patch: z.record(z.string(), z.unknown()),
	}),
	execute: async (args) =>
		runTool(async () => {
			const { orgId, permissions } = getCtx();
			requirePermission(permissions, ENTITY_UPDATE_PERM[args.entityType] ?? "leads.update");
			const mutation = ENTITY_UPDATE_MUTATION[args.entityType];
			const stats = createBulkStats();
			for (const id of args.entityIds) {
				try {
					const resolvedId = await resolveBulkEntityId(
						getCtx(),
						args.entityType as keyof typeof ENTITY_CREATE_CONFIG,
						id,
					);
					if (!resolvedId) {
						recordBulkFailure(
							stats,
							id,
							new Error(`No ${args.entityType} with code "${id}".`),
						);
						continue;
					}
					await toolMutation(getCtx(), mutation, {
						orgId,
						[`${args.entityType}Id`]: resolvedId,
						...args.patch,
					});
					recordBulkSuccess(stats);
				} catch (err) {
					recordBulkFailure(stats, id, err);
				}
			}
			const { display, summary } = summariseBulkResults({
				verb: "update",
				entityNounPlural: `${args.entityType}s`,
				stats,
			});
			return {
				ok: true as const,
				data: { ...stats },
				display,
				summary,
			};
		}),
});

registerTool({
	name: "bulk_delete_entities",
	layer: "bulk",
	permission: null, // checked per-entityType in execute
	confirmation: "twoStep",
	approvalCategory: "bulk",
	description:
		"Soft-delete MANY records of the same type at once (leads/contacts/deals/companies). One approval card covers the whole batch. Soft-delete only — every row goes to trash and can be restored via restore_entity. `entityIds` accepts EITHER raw Convex _ids OR public codes (P-XXX / D-XXX / CO-XXX) — mix and match. NEVER fake a delete by clearing fields via bulk_update_entities; that leaves zombie rows in the table.",
	instruction: {
		whenToCall:
			"User wants to delete / remove / trash MULTIPLE records of the SAME entity type at once — 'delete all empty leads', 'remove these 5 deals', 'trash leads P-001 through P-005', 'clean up the duplicates'. ONE approval card covers the whole batch.",
		whenNotToCall:
			"single record (use delete_entity — its propose card surfaces cascade impact per record) OR mixed entity types (call this once per type) OR the user wants HARD delete (not supported — soft-delete only). When the user names a FILTER ('delete all leads with empty fields') pre-flight `search_crm` first to enumerate the matching codes, surface the count, then call this tool with their codes — never delete the whole table.",
		requiredClarifications: ["entityType", "entityIds"],
		synonyms: [
			"bulk delete",
			"mass delete",
			"remove all",
			"trash all",
			"delete in bulk",
			"clean up",
			"clear out",
		],
		goodExample: {
			description: "User: 'Delete leads P-001 through P-005.'",
			args: {
				entityType: "lead",
				entityIds: ["P-001", "P-002", "P-003", "P-004", "P-005"],
			},
		},
		badExample: {
			description: "User: 'Delete a lead.'",
			args: { entityType: "lead", entityIds: [] },
			whyBad: "Single record + ambiguous target. Use delete_entity with a specific code so the cascade-impact preview shows.",
		},
	},
	runbook: {
		onSuccess:
			"Write ONE concise sentence with the count + recoverability ('Trashed 5 leads (P-001..P-005). Restorable via restore_entity if needed.'). The result card lists every record. Don't restate the propose card.",
		onPartialSuccess:
			"Report how many succeeded vs failed and the failure reason per row (e.g. 'P-006 — no lead with that code'). Offer to retry the failed rows.",
		onValidationError:
			"If entityIds is empty, ask the user which records via ask_user_input. If a code didn't resolve, the per-row failure message says so verbatim — surface it.",
		onPermissionDenied:
			"Tell the user they need the <entity>.delete permission. Suggest contacting an admin.",
		suggestNext: "view_trash",
	},
	schema: z.object({
		entityType: entityTypeEnum(),
		entityIds: coerceStringArray(
			z
				.array(z.string())
				.min(1)
				.max(200)
				.describe(
					"Convex _id OR public code (P-XXX / D-XXX / CO-XXX). Mix of formats accepted.",
				),
		),
	}),
	execute: async (args) => {
		const { permissions } = getCtx();
		const entityType = args.entityType as keyof typeof ENTITY_CREATE_CONFIG;
		requirePermission(permissions, ENTITY_DELETE_PERM[entityType]);
		return propose("bulk_delete_entities", args, {
			title: `Bulk trash ${args.entityIds.length} ${entityType}${args.entityIds.length === 1 ? "" : "s"}`,
			fields: [
				{ label: "Type", value: entityType },
				{ label: "Count", value: args.entityIds.length },
				{
					label: "Targets",
					value:
						args.entityIds.slice(0, 10).join(", ") +
						(args.entityIds.length > 10 ? `, +${args.entityIds.length - 10} more` : ""),
				},
				{
					label: "Recoverable",
					value: "Yes — soft-deleted to trash; restore via restore_entity.",
				},
			],
		});
	},
});

registerTool({
	name: "commit_bulk_delete_entities",
	layer: "bulk",
	permission: null,
	confirmation: "none",
	description: "Internal: commit bulk soft-delete. Runs serially to respect rate limits.",
	schema: z.object({
		entityType: entityTypeEnum(),
		entityIds: coerceStringArray(z.array(z.string())),
	}),
	execute: async (args) =>
		runTool(async () => {
			const { orgId, permissions } = getCtx();
			const entityType = args.entityType as keyof typeof ENTITY_CREATE_CONFIG;
			requirePermission(permissions, ENTITY_DELETE_PERM[entityType]);
			const mutation = ENTITY_DELETE_MUTATION[entityType];
			const stats = createBulkStats();
			for (const id of args.entityIds) {
				try {
					const resolvedId = await resolveBulkEntityId(getCtx(), entityType, id);
					if (!resolvedId) {
						recordBulkFailure(
							stats,
							id,
							new Error(`No ${entityType} with code "${id}".`),
						);
						continue;
					}
					await toolMutation(getCtx(), mutation, {
						orgId,
						[`${entityType}Id`]: resolvedId,
					});
					recordBulkSuccess(stats);
				} catch (err) {
					recordBulkFailure(stats, id, err);
				}
			}
			const { display, summary } = summariseBulkResults({
				verb: "trash",
				entityNounPlural: `${entityType}s`,
				stats,
			});
			return {
				ok: true as const,
				data: { ...stats },
				display,
				summary,
			};
		}),
});

registerTool({
	name: "bulk_close_deals",
	layer: "bulk",
	permission: "deals.close",
	// DEFERRED: see Future-Enhancements.md §A — bulk premium gate removed 2026-05-29.
	confirmation: "twoStep",
	approvalCategory: "bulk",
	description: "Close multiple deals as won or lost.",
	runbook: {
		onSuccess: "Confirm with the count and outcome.",
		onPartialSuccess:
			"List how many closed vs failed. Offer to retry the failed deals when the user is ready.",
		onPermissionDenied:
			"Tell the user they need deals.close permission. Suggest contacting an admin.",
	},
	schema: z.object({
		dealIds: coerceStringArray(z.array(z.string()).min(1).max(100)),
		outcome: z.enum(["won", "lost"]),
	}),
	execute: async (args) => {
		const { permissions } = getCtx();
		requirePermission(permissions, "deals.close");
		return propose("bulk_close_deals", args, {
			title: `Bulk close ${args.dealIds.length} deals as ${args.outcome.toUpperCase()}`,
			fields: [
				{ label: "Count", value: args.dealIds.length },
				{ label: "Outcome", value: args.outcome },
			],
		});
	},
});

registerTool({
	name: "commit_bulk_close_deals",
	permission: "deals.close",
	confirmation: "none",
	description: "Internal: commit bulk close.",
	layer: "bulk",
	schema: z.object({
		dealIds: coerceStringArray(z.array(z.string())),
		outcome: z.enum(["won", "lost"]),
	}),
	execute: async (args) =>
		runTool(async () => {
			const { orgId, permissions } = getCtx();
			requirePermission(permissions, "deals.close");
			const mutation =
				args.outcome === "won"
					? "crm/entities/deals/mutations:closeAsDone"
					: "crm/entities/deals/mutations:markAsLost";
			const stats = createBulkStats();
			for (const dealId of args.dealIds) {
				try {
					await toolMutation(getCtx(), mutation, { orgId, dealId });
					recordBulkSuccess(stats);
				} catch (err) {
					recordBulkFailure(stats, dealId, err);
				}
			}
			const { display, summary } = summariseBulkResults({
				verb: args.outcome === "won" ? "close as won" : "close as lost",
				entityNounPlural: "deals",
				stats,
			});
			return {
				ok: true as const,
				data: { ...stats, outcome: args.outcome },
				display,
				summary,
			};
		}),
});

// ─── Bulk create (leads / contacts / deals / companies) ──────────────────────
//
// Added 2026-05-29 (DASHBOARD-V2-PLAN.md §1.A — the lead-bulk-create bug).
// There was NO bulk-create tool, so "make 10 dummy leads" misrouted to
// `apply_template` (a one-time, idempotent seeder that no-ops once data
// exists). This tool creates up to 50 records in ONE approval card,
// reusing each entity's `create` `*ForAI` twin per row.

registerTool({
	name: "bulk_create_entities",
	layer: "always", // discoverable alongside create_lead — this is the fix for the misroute-to-apply_template bug
	permission: null, // checked per-entityType in execute
	confirmation: "twoStep",
	approvalCategory: "bulk",
	description:
		"Create MANY records at once (leads/contacts/deals/companies) in a SINGLE approval. Use for 'add N leads', 'seed/import sample data', 'create dummy/test data so I can explore', any multi-record create. NOT apply_template (that only seeds the one-time industry sample bundle and no-ops afterwards). When the intent is sample / exploration / seed / dummy / test data, populate optional column fields AND custom fields per row from `## Your organisation's schema` with REALISTIC + DIVERSE values — see the system prompt's `## Seed / sample / exploration data` block for the rules. When the user named specific records (e.g. 'add Sarah Khan, SaaS, 51-200'), only use the values they gave you — don't fabricate optional fields for surgical creates.",
	instruction: {
		whenToCall:
			"The user wants to create MORE THAN ONE record in one go — 'add 10 leads', 'import these contacts', 'create dummy/sample data so I can explore the kanban'. One approval card covers the whole batch.",
		whenNotToCall:
			"only a single record is needed (use create_lead / create_contact / create_deal / create_company so the full entity preview card shows) OR the user wants the one-time industry sample bundle (apply_template) OR the user is following up with 'fill in more details for the leads I just made' (use bulk_update_entities with the createdIds from your prior tool result — never bulk_create_entities again).",
		requiredClarifications: ["entityType", "rows"],
		synonyms: [
			"bulk add",
			"mass create",
			"seed data",
			"dummy data",
			"sample records",
			"explore data",
			"play around",
			"import",
		],
		goodExample: {
			description:
				"User: 'Create 3 sample leads so I can explore the board.' — populate optional + custom fields from the org schema with realistic + diverse data; vary each row.",
			args: {
				entityType: "lead",
				rows: [
					{
						displayName: "Sarah Khan",
						email: "sarah.khan@gmail.com",
						phone: "+971-50-123-4567",
						source: "manual",
						customFields: {
							industry_vertical: "SaaS",
							company_size: "51-200",
							lead_source_detail: "Inbound — Website",
						},
					},
					{
						displayName: "Priya Sharma",
						email: "priya.sharma@outlook.com",
						phone: "+91-98-7654-3210",
						source: "manual",
						customFields: {
							industry_vertical: "Healthcare",
							company_size: "1-10",
							lead_source_detail: "Referral — Partner",
						},
					},
					{
						displayName: "Wei Chen",
						email: "wei.chen@yahoo.com",
						source: "manual",
						customFields: {
							industry_vertical: "Media",
							company_size: "11-50",
						},
					},
				],
			},
		},
		badExample: {
			description: "User: 'Add a lead named Sarah.'",
			args: { entityType: "lead", rows: [{ displayName: "Sarah" }] },
			whyBad: "A single record should use create_lead, which renders the full lead preview card before approval.",
		},
	},
	runbook: {
		onSuccess:
			"After approval the whole batch is created in one round. Write ONE concise sentence with the count + a synthetic-data warning when relevant ('Created 10 sample leads (synthetic — don't email/call them).'); the result card lists every new record. If the user follows up with 'fill more details', 'enrich them', or 'add fields to those leads', call bulk_update_entities with `result.createdIds` from this batch — NEVER call bulk_create_entities a second time.",
		onPartialSuccess:
			"Report how many succeeded vs failed and the failure reason. Offer to retry the failed rows.",
		onValidationError:
			"If rows is empty or a row is missing its required field (lead: displayName · contact: firstName+lastName+email · deal: title · company: name), call ask_user_input ONCE for all missing data — never retry the same args. For sample/exploration prompts, fill the optional + custom fields yourself from the org schema rather than asking the user for each one.",
		onPermissionDenied:
			"Tell the user they need the <entity>.create permission. Suggest contacting an admin.",
	},
	schema: z.object({
		entityType: entityTypeEnum(),
		rows: z.array(z.record(z.string(), z.unknown())).min(1).max(50),
	}),
	execute: async (args) => {
		const { permissions } = getCtx();
		const entityType = args.entityType as keyof typeof ENTITY_CREATE_CONFIG;
		const rows = args.rows as Array<Record<string, unknown>>;
		const cfg = ENTITY_CREATE_CONFIG[entityType];
		requirePermission(permissions, cfg.perm);
		const names = rows.map((r) => cfg.nameOf(r));
		return propose("bulk_create_entities", args, {
			title: `Create ${rows.length} ${entityType}${rows.length === 1 ? "" : "s"}`,
			fields: [
				{ label: "Count", value: rows.length },
				{ label: "Type", value: entityType },
				{
					label: "Names",
					value:
						names.slice(0, 10).join(", ") +
						(names.length > 10 ? `, +${names.length - 10} more` : ""),
				},
			],
		});
	},
});

registerTool({
	name: "commit_bulk_create_entities",
	layer: "bulk",
	permission: null,
	confirmation: "none",
	description: "Internal: commit bulk create. Runs serially to respect rate limits.",
	schema: z.object({
		entityType: entityTypeEnum(),
		rows: z.array(z.record(z.string(), z.unknown())),
	}),
	execute: async (args) =>
		runTool(async () => {
			const { ctx, orgId, userId, permissions } = getCtx();
			const entityType = args.entityType as keyof typeof ENTITY_CREATE_CONFIG;
			const rows = args.rows as Array<Record<string, unknown>>;
			const cfg = ENTITY_CREATE_CONFIG[entityType];
			requirePermission(permissions, cfg.perm);
			const stats = createBulkStats();
			const createdIds: string[] = [];
			for (const row of rows) {
				try {
					const { customFields, notes: _notes, ...rest } = row;
					// Per-entity defaults (e.g. lead.source = "manual") fill
					// in required-with-default columns the model omitted.
					// Without this, the leads `create` validator rejects the
					// row with `ArgumentValidationError: Object is missing
					// the required field "source"` — see the
					// ENTITY_CREATE_DEFAULTS block above.
					const merged: Record<string, unknown> = {
						...ENTITY_CREATE_DEFAULTS[entityType],
						...rest,
					};
					const colArgs: Record<string, unknown> = {};
					for (const k of cfg.allow) {
						const v = merged[k];
						if (v !== undefined && v !== null && v !== "") colArgs[k] = v;
					}
					const result = (await toolMutation(getCtx(), cfg.mutation, {
						orgId,
						...colArgs,
					})) as Record<string, string>;
					const newId = result[cfg.idKey];
					if (newId) {
						createdIds.push(newId);
						if (
							customFields &&
							typeof customFields === "object" &&
							Object.keys(customFields).length > 0
						) {
							try {
								await ctx.runMutation(
									internal.ai.aiEntityPatch.applyCustomFieldsForRecord,
									{
										orgId,
										userId,
										entityType,
										entityId: newId,
										customFields: customFields as Record<string, unknown>,
									},
								);
							} catch (err) {
								console.warn(
									"[commit_bulk_create_entities] custom-field apply failed:",
									err,
								);
							}
						}
					}
					recordBulkSuccess(stats);
				} catch (err) {
					recordBulkFailure(stats, cfg.nameOf(row), err);
				}
			}
			const { display, summary } = summariseBulkResults({
				verb: "create",
				entityNounPlural: `${entityType}s`,
				stats,
			});
			return {
				ok: true as const,
				data: { ...stats, createdIds },
				// Render the live entity cards for every record just created
				// so the user sees the real data, not a count.
				display:
					createdIds.length > 0
						? {
								kind: "entityList" as const,
								entityType,
								entityIds: createdIds,
							}
						: display,
				summary,
			};
		}),
});
