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
import { propose, requirePermission, runTool, type ToolContext, toolMutation } from "../_shared";

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

registerTool({
	name: "bulk_update_entities",
	layer: "bulk",
	permission: null, // checked per-entityType
	// DEFERRED: see Future-Enhancements.md §A — bulk premium model-tier gate
	//          removed 2026-05-29 so every tier can bulk-onboard/seed data.
	//          (`bulk` is still hard-locked twoStep per aiApprovals.ts.)
	confirmation: "twoStep",
	approvalCategory: "bulk",
	description: "Update multiple entities at once. Provide entityIds (max 200) and patch.",
	runbook: {
		onSuccess: "Confirm with the count of records updated.",
		onPartialSuccess:
			"List how many succeeded vs failed. Offer to retry the failed rows when the user is ready.",
		onValidationError:
			"If patch is empty or entityIds is empty, ask the user what to update and on which records.",
		onPermissionDenied:
			"Tell the user they need <entity>.update permission. Suggest contacting an admin.",
	},
	schema: z.object({
		entityType: entityTypeEnum(),
		entityIds: z.array(z.string()).min(1).max(200),
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
		entityIds: z.array(z.string()),
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
					await toolMutation(getCtx(), mutation, {
						orgId,
						[`${args.entityType}Id`]: id,
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
		dealIds: z.array(z.string()).min(1).max(100),
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
	layer: "bulk",
	permission: "deals.close",
	confirmation: "none",
	description: "Internal: commit bulk close.",
	schema: z.object({
		dealIds: z.array(z.string()),
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
		"Create MANY records at once (leads/contacts/deals/companies) in a SINGLE approval. Use for 'add N leads', 'seed/import sample data', any multi-record create. NOT apply_template (that only seeds the one-time industry sample bundle and no-ops afterwards).",
	instruction: {
		whenToCall:
			"The user wants to create MORE THAN ONE record in one go — 'add 10 leads', 'import these contacts', 'create dummy/sample data'. One approval card covers the whole batch.",
		whenNotToCall:
			"only a single record is needed (use create_lead / create_contact / create_deal / create_company so the full entity preview card shows) OR the user wants the one-time industry sample bundle (apply_template).",
		requiredClarifications: ["entityType", "rows"],
		synonyms: [
			"bulk add",
			"mass create",
			"seed data",
			"dummy data",
			"sample records",
			"import",
		],
		goodExample: {
			description: "User: 'Create 3 dummy leads.'",
			args: {
				entityType: "lead",
				rows: [
					{ displayName: "Sarah Khan", email: "sarah@example.com" },
					{ displayName: "Omar Ali", phone: "+971500000000" },
					{ displayName: "Mei Lin", source: "referral" },
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
			"After approval the whole batch is created in one round. Write ONE sentence with the count (e.g. 'Created 10 leads.'); the result card lists every new record.",
		onPartialSuccess:
			"Report how many succeeded vs failed and the failure reason. Offer to retry the failed rows.",
		onValidationError:
			"If rows is empty or a row is missing its required field (lead: displayName · contact: firstName+lastName+email · deal: title · company: name), call ask_user_input ONCE for all missing data — never retry the same args.",
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
					const colArgs: Record<string, unknown> = {};
					for (const k of cfg.allow) {
						const v = rest[k];
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
