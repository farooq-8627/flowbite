import { v } from "convex/values";
import { authenticatedMutation } from "../_functions/authenticated";
import { internalMutation, type MutationCtx } from "../_generated/server";
import { getOrgMember } from "../orgs/helpers";

async function markReadImpl(
	ctx: MutationCtx,
	args: {
		userId: import("../_generated/dataModel").Id<"users">;
		notificationId: import("../_generated/dataModel").Id<"notifications">;
	},
) {
	const n = await ctx.db.get(args.notificationId);
	if (!n || n.userId !== args.userId) return;
	if (n.read) return;
	await ctx.db.patch(args.notificationId, {
		read: true,
		readAt: Date.now(),
		updatedAt: Date.now(),
	});
}

/** Mark a single notification as read. */
export const markRead = authenticatedMutation({
	args: { notificationId: v.id("notifications") },
	handler: async (ctx, args) => {
		return markReadImpl(ctx, { ...args, userId: ctx.userId });
	},
});

/**
 * AI-callable internal twin. Idempotent — if the notification is already
 * read, or doesn't belong to the caller, the call is a silent no-op.
 *
 * Auth: caller `userId` must be a non-deleted member of the supplied org
 * AND must own the target notification (cross-tenant + cross-user safety).
 */
export const markReadForAI = internalMutation({
	args: {
		orgId: v.id("orgs"),
		userId: v.id("users"),
		notificationId: v.id("notifications"),
	},
	handler: async (ctx, args) => {
		const member = await getOrgMember(ctx, args.orgId, args.userId);
		if (!member || member.deletedAt !== undefined) return;
		const n = await ctx.db.get(args.notificationId);
		// Belt-and-braces: notification must belong to the same org as the membership check.
		if (!n || n.orgId !== args.orgId) return;
		return markReadImpl(ctx, { userId: args.userId, notificationId: args.notificationId });
	},
});

async function markAllReadImpl(
	ctx: MutationCtx,
	args: {
		userId: import("../_generated/dataModel").Id<"users">;
		/**
		 * Optional org scope. When provided, only that org's
		 * notifications are touched (used by the AI tool — tenant-safe).
		 * When omitted (the user-facing path), every notification across
		 * orgs the user is in flips to read.
		 */
		orgId?: import("../_generated/dataModel").Id<"orgs">;
	},
): Promise<{ updated: number }> {
	const now = Date.now();
	const unread = await ctx.db
		.query("notifications")
		.withIndex("by_userId_and_read", (q) => q.eq("userId", args.userId).eq("read", false))
		.take(200);

	const filtered = args.orgId ? unread.filter((n) => n.orgId === args.orgId) : unread;

	await Promise.all(
		filtered.map((n) => ctx.db.patch(n._id, { read: true, readAt: now, updatedAt: now })),
	);

	return { updated: filtered.length };
}

/** Mark all of the current user's notifications as read. */
export const markAllRead = authenticatedMutation({
	args: {},
	handler: async (ctx) => {
		await markAllReadImpl(ctx, { userId: ctx.userId });
	},
});

/**
 * AI-callable internal twin. Tenant-scoped — only marks notifications
 * belonging to `args.orgId` as read. Returns the number flipped so the
 * tool can surface a meaningful headline.
 */
export const markAllReadForAI = internalMutation({
	args: {
		orgId: v.id("orgs"),
		userId: v.id("users"),
	},
	handler: async (ctx, args) => {
		const member = await getOrgMember(ctx, args.orgId, args.userId);
		if (!member || member.deletedAt !== undefined) return { updated: 0 };
		return markAllReadImpl(ctx, { userId: args.userId, orgId: args.orgId });
	},
});
