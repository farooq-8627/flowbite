import { v } from "convex/values";
import { authenticatedQuery } from "../_functions/authenticated";
import type { Id } from "../_generated/dataModel";
import { internalQuery, type QueryCtx } from "../_generated/server";
import { getOrgMember } from "../orgs/helpers";

/** List the current user's notifications, newest first. Max 50. */
export const listMine = authenticatedQuery({
	args: {
		onlyUnread: v.optional(v.boolean()),
	},
	handler: async (ctx, args) => {
		const q = ctx.db
			.query("notifications")
			.withIndex("by_userId_and_createdAt", (q) => q.eq("userId", ctx.userId));

		const all = await q.order("desc").take(50);
		if (args.onlyUnread) return all.filter((n) => !n.read && !n.archivedAt);
		return all.filter((n) => !n.archivedAt);
	},
});

/** Unread count + first 3 notifications for the bell dropdown. */
export const getSummary = authenticatedQuery({
	args: {},
	handler: async (ctx) => {
		const unread = await ctx.db
			.query("notifications")
			.withIndex("by_userId_and_read_and_archivedAt", (q) =>
				q.eq("userId", ctx.userId).eq("read", false).eq("archivedAt", undefined),
			)
			.take(100);

		const preview = await ctx.db
			.query("notifications")
			.withIndex("by_userId_and_createdAt", (q) => q.eq("userId", ctx.userId))
			.order("desc")
			.filter((q) => q.eq(q.field("archivedAt"), undefined))
			.take(3);

		return {
			unreadCount: unread.length,
			preview,
		};
	},
});

/**
 * AI-callable read tool. Returns the user's notifications scoped to a given
 * org (filters out cross-org notifications). Bridges from `(orgId, userId)`
 * to the per-user index. Notifications are user-scoped at the schema layer
 * via `userId`; the org filter prevents the AI from leaking notifications
 * triggered by other orgs the user belongs to.
 *
 * Permission: `notifications.viewOwn` — the user is reading their own row.
 */
async function listMineImpl(
	ctx: QueryCtx,
	args: {
		orgId: Id<"orgs">;
		userId: Id<"users">;
		onlyUnread?: boolean;
		limit?: number;
	},
) {
	const cap = Math.min(args.limit ?? 50, 100);
	const rows = await ctx.db
		.query("notifications")
		.withIndex("by_userId_and_createdAt", (q) => q.eq("userId", args.userId))
		.order("desc")
		.take(cap * 3); // over-fetch for filtering

	return rows
		.filter((n) => n.orgId === args.orgId && !n.archivedAt)
		.filter((n) => !args.onlyUnread || !n.read)
		.slice(0, cap);
}

export const listMineForAI = internalQuery({
	args: {
		orgId: v.id("orgs"),
		userId: v.id("users"),
		onlyUnread: v.optional(v.boolean()),
		limit: v.optional(v.number()),
	},
	handler: async (ctx, args) => {
		// Membership gate so a stale session can't read notifications.
		const member = await getOrgMember(ctx, args.orgId, args.userId);
		if (!member || member.deletedAt !== undefined) return [];
		return listMineImpl(ctx, args);
	},
});
