import { v } from "convex/values";
import { authenticatedQuery } from "../_functions/authenticated";

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

/** Unread count + first 5 notifications for the bell dropdown. */
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
			.take(5);

		return {
			unreadCount: unread.length,
			preview,
		};
	},
});
