/**
 * convex/dashboard/ephemeralCells/queries.ts
 *
 * Stage 5 — read paths for `ephemeralDashboardCells`. Always
 * scoped to (userId, orgId) — these rows are per-user.
 */

import { v } from "convex/values";
import { orgQuery, requireOrgMemberByIds } from "../../_functions/authenticated";
import type { Doc, Id } from "../../_generated/dataModel";
import { internalQuery, type QueryCtx } from "../../_generated/server";

async function listImpl(
	ctx: QueryCtx,
	args: { orgId: Id<"orgs">; userId: Id<"users"> },
): Promise<Doc<"ephemeralDashboardCells">[]> {
	const now = Date.now();
	const rows = await ctx.db
		.query("ephemeralDashboardCells")
		.withIndex("by_user_and_org", (q) => q.eq("userId", args.userId).eq("orgId", args.orgId))
		.collect();
	return rows.filter((r) => r.expiresAt > now).sort((a, b) => b.createdAt - a.createdAt);
}

export const listForUser = orgQuery({
	args: { orgId: v.id("orgs") },
	handler: async (ctx, args) => {
		return listImpl(ctx, { orgId: args.orgId, userId: ctx.userId });
	},
});

export const listForUserForAI = internalQuery({
	args: { orgId: v.id("orgs"), userId: v.id("users") },
	handler: async (ctx, args) => {
		await requireOrgMemberByIds(ctx, args.orgId, args.userId);
		return listImpl(ctx, args);
	},
});
