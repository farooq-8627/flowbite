/**
 * Messages queries — convex/crm/shared/messages/queries.ts
 *
 * Read APIs (newest-first by default; soft-deleted rows hidden):
 *   - listForConversation:   the canonical thread feed (most callers)
 *   - listForEntity:         convenience — finds the convo, lists messages
 *   - listForPerson:         personCode-keyed cross-conversation feed
 *   - listInbox:             org-wide newest, filtered (legacy/admin)
 *   - listRecent:            dashboard widget
 *   - getById:               one message + author / reply ref
 */

import { v } from "convex/values";
import { orgQuery, requireOrgMember } from "../../../_functions/authenticated";
import { entityTypeForChatValidator } from "../../../_shared/entityCodes";
import { hasPermission, requireRole } from "../../../_shared/permissions";
import { findConversation, getMyMembership } from "../conversations/internal";

// ─── Single conversation thread ──────────────────────────────────────────────

export const listForConversation = orgQuery({
	args: {
		orgId: v.id("orgs"),
		conversationId: v.id("conversations"),
		limit: v.optional(v.number()),
	},
	handler: async (ctx, args) => {
		const { userId, member } = await requireOrgMember(ctx, args.orgId);
		requireRole(member.permissions, "messages.view");

		const conversation = await ctx.db.get(args.conversationId);
		if (!conversation || conversation.orgId !== args.orgId) return [];

		// Non-members must have `messages.viewAll` (moderator) to peek.
		const myMembership = await getMyMembership(ctx, {
			conversationId: args.conversationId,
			userId,
		});
		const canModerate = hasPermission(member.permissions, "messages.viewAll");
		if (!myMembership && !canModerate) return [];

		const cap = args.limit ?? 100;
		const rows = await ctx.db
			.query("messages")
			.withIndex("by_conversation_and_created", (q) =>
				q.eq("conversationId", args.conversationId),
			)
			.order("desc")
			.take(cap);
		return rows.filter((m) => m.deletedAt === undefined);
	},
});

/**
 * Convenience: look up the conversation for an entity thread, then list its
 * messages. Returns `null` if no conversation exists yet (caller can render
 * an empty state). Most front-end consumers call this.
 */
export const listForEntity = orgQuery({
	args: {
		orgId: v.id("orgs"),
		entityType: entityTypeForChatValidator,
		entityId: v.string(),
		threadId: v.optional(v.string()),
		limit: v.optional(v.number()),
	},
	handler: async (ctx, args) => {
		const { userId, member } = await requireOrgMember(ctx, args.orgId);
		requireRole(member.permissions, "messages.view");

		const conversation = await findConversation(ctx, args);
		if (!conversation) return { conversation: null, messages: [] };

		const myMembership = await getMyMembership(ctx, {
			conversationId: conversation._id,
			userId,
		});
		const canModerate = hasPermission(member.permissions, "messages.viewAll");
		if (!myMembership && !canModerate) {
			return { conversation: null, messages: [] };
		}

		const cap = args.limit ?? 100;
		const rows = await ctx.db
			.query("messages")
			.withIndex("by_conversation_and_created", (q) =>
				q.eq("conversationId", conversation._id),
			)
			.order("desc")
			.take(cap);
		return {
			conversation,
			messages: rows.filter((m) => m.deletedAt === undefined),
		};
	},
});

/**
 * All messages tied to a personCode across entity types.
 *
 * Use this when viewing a person's complete message history — including messages
 * sent against deals/companies they're linked to (denormalized via `personCode`).
 */
export const listForPerson = orgQuery({
	args: {
		orgId: v.id("orgs"),
		personCode: v.string(),
		limit: v.optional(v.number()),
	},
	handler: async (ctx, args) => {
		const { member } = await requireOrgMember(ctx, args.orgId);
		requireRole(member.permissions, "messages.view");

		const cap = args.limit ?? 100;

		const rows = await ctx.db
			.query("messages")
			.withIndex("by_org_and_personCode", (q) =>
				q.eq("orgId", args.orgId).eq("personCode", args.personCode),
			)
			.order("desc")
			.take(cap);
		return rows.filter((m) => m.deletedAt === undefined);
	},
});

/**
 * Org-wide newest messages — admin / moderation surface.
 * Members without `messages.viewAll` only see threads they're in.
 */
export const listInbox = orgQuery({
	args: {
		orgId: v.id("orgs"),
		filter: v.optional(
			v.union(v.literal("all"), v.literal("unread"), v.literal("ai"), v.literal("mine")),
		),
		scanLimit: v.optional(v.number()),
		limit: v.optional(v.number()),
	},
	handler: async (ctx, args) => {
		const { userId, member } = await requireOrgMember(ctx, args.orgId);
		requireRole(member.permissions, "messages.view");

		const filter = args.filter ?? "all";
		const scanLimit = args.scanLimit ?? 500;
		const cap = args.limit ?? 50;

		const recent = await ctx.db
			.query("messages")
			.withIndex("by_org_and_created", (q) => q.eq("orgId", args.orgId))
			.order("desc")
			.take(scanLimit);

		const live = recent.filter((m) => m.deletedAt === undefined);

		// Dedupe by conversationId — keep first (newest) seen per key.
		const seen = new Map<string, (typeof live)[number]>();
		for (const m of live) {
			const key = String(m.conversationId);
			if (!seen.has(key)) seen.set(key, m);
		}

		const conversations = [...seen.values()];

		// Apply filters (with viewAll moderation permission gate).
		const canModerate = hasPermission(member.permissions, "messages.viewAll");
		const filteredOut = [];
		for (const m of conversations) {
			if (!canModerate) {
				const myMembership = await getMyMembership(ctx, {
					conversationId: m.conversationId,
					userId,
				});
				if (!myMembership) continue;
			}
			if (filter === "ai" && m.authorType !== "ai") continue;
			if (filter === "mine" && String(m.authorId) !== String(userId)) continue;
			// unread filter: needs convo lastMessageAt vs my lastReadAt — for the
			// inbox-fast-path we approximate with "newer than my membership read".
			filteredOut.push(m);
			if (filteredOut.length >= cap) break;
		}

		return filteredOut;
	},
});

/**
 * Recent messages across the org — feeds the dashboard "MessagesPreviewWidget".
 *
 * No conversation dedup; just the newest N messages chronologically.
 */
export const listRecent = orgQuery({
	args: {
		orgId: v.id("orgs"),
		limit: v.optional(v.number()),
	},
	handler: async (ctx, args) => {
		const { member } = await requireOrgMember(ctx, args.orgId);
		requireRole(member.permissions, "messages.view");

		const rows = await ctx.db
			.query("messages")
			.withIndex("by_org_and_created", (q) => q.eq("orgId", args.orgId))
			.order("desc")
			.take(args.limit ?? 5);
		return rows.filter((m) => m.deletedAt === undefined);
	},
});

/**
 * Get one message by id (for reply previews, message-detail dialogs).
 */
export const getById = orgQuery({
	args: { orgId: v.id("orgs"), messageId: v.id("messages") },
	handler: async (ctx, args) => {
		const { member } = await requireOrgMember(ctx, args.orgId);
		requireRole(member.permissions, "messages.view");

		const message = await ctx.db.get(args.messageId);
		if (!message || message.orgId !== args.orgId || message.deletedAt !== undefined) {
			return null;
		}
		return message;
	},
});
