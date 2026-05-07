/**
 * Saved Views Queries — convex/crm/shared/savedViews/queries.ts
 *
 * Filter presets pinnable to sidebar.
 * User-scoped views visible only to creator.
 * Org-scoped views visible to all org members.
 */
import { v } from "convex/values";
import { orgQuery, requireOrgMember } from "../../../_functions/authenticated";

export const listByEntity = orgQuery({
	args: { orgId: v.id("orgs"), entityType: v.string() },
	handler: async (ctx, args) => {
		const { userId } = await requireOrgMember(ctx, args.orgId);
		const views = await ctx.db
			.query("savedViews")
			.withIndex("by_org_and_entity", (q) =>
				q.eq("orgId", args.orgId).eq("entityType", args.entityType),
			)
			.collect();
		// Return org-scoped views + user's own personal views
		return views.filter(
			(v) => v.scope === "org" || v.createdBy === userId,
		);
	},
});

export const listPinned = orgQuery({
	args: { orgId: v.id("orgs") },
	handler: async (ctx, args) => {
		const { userId } = await requireOrgMember(ctx, args.orgId);
		const views = await ctx.db
			.query("savedViews")
			.withIndex("by_org_and_pinned", (q) =>
				q.eq("orgId", args.orgId).eq("isPinned", true),
			)
			.collect();
		return views.filter(
			(v) => v.scope === "org" || v.createdBy === userId,
		);
	},
});
