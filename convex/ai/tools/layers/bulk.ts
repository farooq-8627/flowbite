/**
 * convex/ai/tools/layers/bulk.ts — Bulk operation tools (always two-step + premium).
 *
 * Stage 10 of `/SPRINT-PLAN.md` — bulk-progress reporting. The
 * `commit_*` handlers now use `convex/_shared/bulkProgress.ts` to
 * accumulate per-row failures and surface a `ToolSummary` with a
 * row-level diff + retry chips, replacing the silent
 * `{ succeeded, failed }` counter shipped before Stage 10.
 */

import { z } from "zod";
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

registerTool({
	name: "bulk_update_entities",
	layer: "bulk",
	permission: null, // checked per-entityType
	requiredCapability: "premium",
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
	requiredCapability: "premium",
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
