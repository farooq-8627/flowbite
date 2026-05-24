/**
 * Saved Views Queries — convex/crm/shared/savedViews/queries.ts
 *
 * Filter presets pinnable to sidebar.
 * User-scoped views visible only to creator.
 * Org-scoped views visible to all org members.
 */
import { v } from "convex/values";
import {
	orgQuery,
	requireOrgMember,
	requireOrgMemberByIds,
} from "../../../_functions/authenticated";
import type { Id } from "../../../_generated/dataModel";
import { internalQuery, type QueryCtx } from "../../../_generated/server";

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
		return views.filter((v) => v.scope === "org" || v.createdBy === userId);
	},
});

export const listPinned = orgQuery({
	args: { orgId: v.id("orgs") },
	handler: async (ctx, args) => {
		const { userId } = await requireOrgMember(ctx, args.orgId);
		const views = await ctx.db
			.query("savedViews")
			.withIndex("by_org_and_pinned", (q) => q.eq("orgId", args.orgId).eq("isPinned", true))
			.collect();
		return views.filter((v) => v.scope === "org" || v.createdBy === userId);
	},
});

// ─── Cross-entity listing for AI / settings overview ────────────────────────

async function listForUserImpl(
	ctx: QueryCtx,
	args: { orgId: Id<"orgs">; userId: Id<"users">; entityType?: string },
) {
	const allViews = args.entityType
		? await ctx.db
				.query("savedViews")
				.withIndex("by_org_and_entity", (q) =>
					q.eq("orgId", args.orgId).eq("entityType", args.entityType ?? ""),
				)
				.collect()
		: await ctx.db
				.query("savedViews")
				.withIndex("by_org_and_entity", (q) => q.eq("orgId", args.orgId))
				.collect();
	return allViews.filter((v) => v.scope === "org" || v.createdBy === args.userId);
}

export const listForUser = orgQuery({
	args: {
		orgId: v.id("orgs"),
		entityType: v.optional(v.string()),
	},
	handler: async (ctx, args) => {
		const { userId } = await requireOrgMember(ctx, args.orgId);
		return listForUserImpl(ctx, { orgId: args.orgId, userId, entityType: args.entityType });
	},
});

/** AI-callable internal twin. */
export const listForUserForAI = internalQuery({
	args: {
		orgId: v.id("orgs"),
		userId: v.id("users"),
		entityType: v.optional(v.string()),
	},
	handler: async (ctx, args) => {
		await requireOrgMemberByIds(ctx, args.orgId, args.userId);
		return listForUserImpl(ctx, args);
	},
});
