/**
 * convex/ai/analyzeMetricHelpers.ts
 *
 * Stage 7 of /SPRINT-PLAN.md — non-Node helpers for the `analyzeMetric`
 * action. Same split rationale as `convex/ai/dealClose.ts`: "use node"
 * files cannot define `internalQuery` / `internalMutation`, so anything
 * that touches the DB on the action's behalf lives in a V8 sibling
 * referenced via the string-path forward-ref pattern.
 */

import { v } from "convex/values";
import { internalQuery } from "../_generated/server";

/**
 * Read every `orgStats` counter row for the org. The action picks the
 * one matching the metric being analysed; we return the full set so a
 * future "compare metrics" subagent can reuse the same query.
 */
export const readOrgStats = internalQuery({
	args: { orgId: v.id("orgs") },
	handler: async (ctx, args) => {
		const rows = await ctx.db
			.query("orgStats")
			.withIndex("by_org_and_key", (q) => q.eq("orgId", args.orgId))
			.collect();
		return rows.map((r) => ({ key: r.key, value: r.value }));
	},
});

/**
 * Count successful events for `toolName` in the last 24h. The
 * `analyze_metric` tool calls this before scheduling the action so it
 * can enforce the 10/day soft cap (Constraint I — expensive cost
 * class).
 */
export const countRecentRunsForOrg = internalQuery({
	args: { orgId: v.id("orgs"), toolName: v.string() },
	handler: async (ctx, args) => {
		const since = Date.now() - 24 * 60 * 60 * 1000;
		const rows = await ctx.db
			.query("aiToolEvents")
			.withIndex("by_org_and_tool_and_started", (q) =>
				q.eq("orgId", args.orgId).eq("toolName", args.toolName).gte("startedAt", since),
			)
			.collect();
		return rows.filter((r) => r.ok).length;
	},
});
