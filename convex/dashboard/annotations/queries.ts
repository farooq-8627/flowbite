/**
 * convex/dashboard/annotations/queries.ts
 *
 * Stage 5 — read paths for `dashboardAnnotations`. Filters out rows
 * the calling user has dismissed (dismissedByUserIds[] membership).
 * Sorted by severity desc (critical first), then createdAt desc.
 *
 * Two query surfaces:
 *   - `listForOrg` (public + ForAI twin) — every annotation the user
 *     hasn't dismissed. Optional widgetKey filter for widget-anchored
 *     reads.
 *   - `listForWidget` — convenience wrapper for the AnnotationChip
 *     subscription on a single widget shell.
 */

import { v } from "convex/values";
import { orgQuery, requireOrgMemberByIds } from "../../_functions/authenticated";
import type { Doc, Id } from "../../_generated/dataModel";
import { internalQuery, type QueryCtx } from "../../_generated/server";

const SEVERITY_ORDER: Record<"info" | "warning" | "critical", number> = {
	critical: 0,
	warning: 1,
	info: 2,
};

async function listImpl(
	ctx: QueryCtx,
	args: {
		orgId: Id<"orgs">;
		userId: Id<"users">;
		widgetKey?: string;
		includeDismissed?: boolean;
		limit?: number;
	},
): Promise<Doc<"dashboardAnnotations">[]> {
	const limit = Math.min(Math.max(1, args.limit ?? 100), 100);
	const rows = args.widgetKey
		? await ctx.db
				.query("dashboardAnnotations")
				.withIndex("by_org_and_widget", (q) =>
					q.eq("orgId", args.orgId).eq("widgetKey", args.widgetKey ?? ""),
				)
				.collect()
		: await ctx.db
				.query("dashboardAnnotations")
				.withIndex("by_org", (q) => q.eq("orgId", args.orgId))
				.collect();

	const filtered = args.includeDismissed
		? rows
		: rows.filter((r) => !r.dismissedByUserIds.includes(args.userId));

	filtered.sort((a, b) => {
		const sev = SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity];
		if (sev !== 0) return sev;
		return b.createdAt - a.createdAt;
	});

	return filtered.slice(0, limit);
}

export const listForOrg = orgQuery({
	args: {
		orgId: v.id("orgs"),
		widgetKey: v.optional(v.string()),
		includeDismissed: v.optional(v.boolean()),
		limit: v.optional(v.number()),
	},
	handler: async (ctx, args) => {
		return listImpl(ctx, {
			orgId: args.orgId,
			userId: ctx.userId,
			widgetKey: args.widgetKey,
			includeDismissed: args.includeDismissed,
			limit: args.limit,
		});
	},
});

export const listForOrgForAI = internalQuery({
	args: {
		orgId: v.id("orgs"),
		userId: v.id("users"),
		widgetKey: v.optional(v.string()),
		includeDismissed: v.optional(v.boolean()),
		limit: v.optional(v.number()),
	},
	handler: async (ctx, args) => {
		await requireOrgMemberByIds(ctx, args.orgId, args.userId);
		return listImpl(ctx, args);
	},
});
