import { v } from "convex/values";
import { authenticatedMutation } from "../_functions/authenticated";

/** Mark a single notification as read. */
export const markRead = authenticatedMutation({
	args: { notificationId: v.id("notifications") },
	handler: async (ctx, args) => {
		const n = await ctx.db.get(args.notificationId);
		if (!n || n.userId !== ctx.userId) return;
		if (n.read) return;
		await ctx.db.patch(args.notificationId, {
			read: true,
			readAt: Date.now(),
			updatedAt: Date.now(),
		});
	},
});

/** Mark all of the current user's notifications as read. */
export const markAllRead = authenticatedMutation({
	args: {},
	handler: async (ctx) => {
		const now = Date.now();
		const unread = await ctx.db
			.query("notifications")
			.withIndex("by_userId_and_read", (q) => q.eq("userId", ctx.userId).eq("read", false))
			.take(200);

		await Promise.all(
			unread.map((n) => ctx.db.patch(n._id, { read: true, readAt: now, updatedAt: now })),
		);
	},
});
