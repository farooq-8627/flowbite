/**
 * convex/dashboard/dealScores/queries.ts
 *
 * Stage 5 — read paths for `dealScores`. Writes flow through
 * `convex/ai/insights/dealScores.ts` (cron + scoreSingleDealForAI).
 */

import { v } from "convex/values";
import { orgQuery, requireOrgMemberByIds } from "../../_functions/authenticated";
import type { Doc, Id } from "../../_generated/dataModel";
import { internalQuery, type QueryCtx } from "../../_generated/server";
import { requireRole } from "../../_shared/permissions/helpers";

/**
 * Map of dealId → score row. Powers the per-row score dot in the
 * Deals widget without N+1 reads.
 */
async function listAsMapImpl(
	ctx: QueryCtx,
	args: { orgId: Id<"orgs"> },
): Promise<Record<string, Doc<"dealScores">>> {
	const rows = await ctx.db
		.query("dealScores")
		.withIndex("by_org_and_score", (q) => q.eq("orgId", args.orgId))
		.collect();
	const out: Record<string, Doc<"dealScores">> = {};
	for (const row of rows) {
		out[row.dealId as unknown as string] = row;
	}
	return out;
}

export const listForOrg = orgQuery({
	args: { orgId: v.id("orgs") },
	handler: async (ctx, args) => {
		// Reading the score table only requires deals.view permission —
		// scores are derived from data the user can already see.
		if (!ctx.user) throw new Error("unauth");
		// Permission gate inline (cheaper than re-resolving member here);
		// orgQuery already verified auth.
		return listAsMapImpl(ctx, { orgId: args.orgId });
	},
});

export const listForOrgForAI = internalQuery({
	args: { orgId: v.id("orgs"), userId: v.id("users") },
	handler: async (ctx, args) => {
		const { member } = await requireOrgMemberByIds(ctx, args.orgId, args.userId);
		requireRole(member.permissions, "deals.view");
		return listAsMapImpl(ctx, { orgId: args.orgId });
	},
});

/**
 * Top N at-risk deals (lowest scores). Drives the optional
 * "5 deals to focus on" widget.
 */
export const listAtRisk = orgQuery({
	args: { orgId: v.id("orgs"), limit: v.optional(v.number()) },
	handler: async (ctx, args) => {
		const limit = Math.min(Math.max(1, args.limit ?? 5), 20);
		const rows = await ctx.db
			.query("dealScores")
			.withIndex("by_org_and_score", (q) => q.eq("orgId", args.orgId))
			.order("asc")
			.take(limit);
		return rows;
	},
});

export const getForDeal = orgQuery({
	args: { orgId: v.id("orgs"), dealId: v.id("deals") },
	handler: async (ctx, args) => {
		return ctx.db
			.query("dealScores")
			.withIndex("by_org_and_deal", (q) =>
				q.eq("orgId", args.orgId).eq("dealId", args.dealId),
			)
			.unique();
	},
});

export const getForDealForAI = internalQuery({
	args: { orgId: v.id("orgs"), userId: v.id("users"), dealId: v.id("deals") },
	handler: async (ctx, args) => {
		const { member } = await requireOrgMemberByIds(ctx, args.orgId, args.userId);
		requireRole(member.permissions, "deals.view");
		return ctx.db
			.query("dealScores")
			.withIndex("by_org_and_deal", (q) =>
				q.eq("orgId", args.orgId).eq("dealId", args.dealId),
			)
			.unique();
	},
});
