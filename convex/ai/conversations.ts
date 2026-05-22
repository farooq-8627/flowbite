/**
 * convex/ai/conversations.ts
 *
 * Thread management — CRUD + history for AI conversations.
 * Every conversation is scoped to (orgId, userId) — no cross-user visibility.
 */
import { ConvexError, v } from "convex/values";
import { orgMutation, orgQuery, requireOrgMember } from "../_functions/authenticated";
import { ERRORS } from "../_shared/errors";
import { requireRole } from "../_shared/permissions/helpers";
import { enforceRateLimit } from "../_shared/rateLimit";

// ─── Queries ──────────────────────────────────────────────────────────────────

/** List threads for the calling user, sorted by most recent activity. */
export const list = orgQuery({
	args: {
		orgId: v.id("orgs"),
		limit: v.optional(v.number()),
	},
	handler: async (ctx, args) => {
		const { userId } = await requireOrgMember(ctx, args.orgId);
		const limit = Math.min(args.limit ?? 50, 100);
		return await ctx.db
			.query("aiConversations")
			.withIndex("by_org_and_user_and_lastMessage", (q) =>
				q.eq("orgId", args.orgId).eq("userId", userId),
			)
			.order("desc")
			.filter((q) => q.neq(q.field("status"), "deleted"))
			.take(limit);
	},
});

/** Get a single conversation. Must belong to the calling user. */
export const get = orgQuery({
	args: { orgId: v.id("orgs"), conversationId: v.id("aiConversations") },
	handler: async (ctx, args) => {
		const { userId } = await requireOrgMember(ctx, args.orgId);
		const conv = await ctx.db.get(args.conversationId);
		if (
			!conv ||
			conv.orgId !== args.orgId ||
			conv.userId !== userId ||
			conv.status === "deleted"
		) {
			return null;
		}
		return conv;
	},
});

// ─── Mutations ────────────────────────────────────────────────────────────────

/** Create a new conversation thread. */
export const create = orgMutation({
	args: {
		orgId: v.id("orgs"),
		title: v.optional(v.string()),
		defaultModel: v.optional(v.string()),
		defaultProvider: v.optional(v.string()),
		routeContextPath: v.optional(v.string()),
		routeEntityType: v.optional(v.string()),
		routeEntityId: v.optional(v.string()),
		pinnedEntityCode: v.optional(v.string()),
	},
	handler: async (ctx, args) => {
		const { member, userId } = await requireOrgMember(ctx, args.orgId);
		requireRole(member.permissions, "ai.use");
		await enforceRateLimit(ctx, {
			scope: "ai.conversation.create",
			key: `${userId}:${args.orgId}`,
			max: 30,
			periodMs: 60_000,
		});

		const now = Date.now();
		return await ctx.db.insert("aiConversations", {
			orgId: args.orgId,
			userId,
			title: args.title,
			status: "active",
			defaultModel: args.defaultModel,
			defaultProvider: args.defaultProvider,
			lastMessageAt: now,
			routeContextPath: args.routeContextPath,
			routeEntityType: args.routeEntityType,
			routeEntityId: args.routeEntityId,
			pinnedEntityCode: args.pinnedEntityCode,
			createdAt: now,
			updatedAt: now,
		});
	},
});

/** Rename a conversation. */
export const rename = orgMutation({
	args: {
		orgId: v.id("orgs"),
		conversationId: v.id("aiConversations"),
		title: v.string(),
	},
	handler: async (ctx, args) => {
		const { userId } = await requireOrgMember(ctx, args.orgId);
		const conv = await ctx.db.get(args.conversationId);
		if (!conv || conv.orgId !== args.orgId || conv.userId !== userId) {
			throw new ConvexError(ERRORS.NOT_FOUND);
		}
		await ctx.db.patch(args.conversationId, {
			title: args.title.trim().slice(0, 100),
			updatedAt: Date.now(),
		});
	},
});

/** Archive (hide) a conversation. */
export const archive = orgMutation({
	args: { orgId: v.id("orgs"), conversationId: v.id("aiConversations") },
	handler: async (ctx, args) => {
		const { userId } = await requireOrgMember(ctx, args.orgId);
		const conv = await ctx.db.get(args.conversationId);
		if (!conv || conv.orgId !== args.orgId || conv.userId !== userId) {
			throw new ConvexError(ERRORS.NOT_FOUND);
		}
		await ctx.db.patch(args.conversationId, { status: "archived", updatedAt: Date.now() });
	},
});

/** Soft-delete a conversation (sets status: "deleted", keeps data). */
export const softDelete = orgMutation({
	args: { orgId: v.id("orgs"), conversationId: v.id("aiConversations") },
	handler: async (ctx, args) => {
		const { userId } = await requireOrgMember(ctx, args.orgId);
		const conv = await ctx.db.get(args.conversationId);
		if (!conv || conv.orgId !== args.orgId || conv.userId !== userId) {
			throw new ConvexError(ERRORS.NOT_FOUND);
		}
		await ctx.db.patch(args.conversationId, { status: "deleted", updatedAt: Date.now() });
	},
});

/** Set sticky model for a thread. */
export const setDefaultModel = orgMutation({
	args: {
		orgId: v.id("orgs"),
		conversationId: v.id("aiConversations"),
		model: v.string(),
		provider: v.string(),
	},
	handler: async (ctx, args) => {
		const { userId } = await requireOrgMember(ctx, args.orgId);
		const conv = await ctx.db.get(args.conversationId);
		if (!conv || conv.orgId !== args.orgId || conv.userId !== userId) {
			throw new ConvexError(ERRORS.NOT_FOUND);
		}
		await ctx.db.patch(args.conversationId, {
			defaultModel: args.model,
			defaultProvider: args.provider,
			updatedAt: Date.now(),
		});
	},
});
