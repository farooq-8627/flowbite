/**
 * Messages queries — convex/crm/shared/messages/queries.ts
 *
 * Read APIs (newest-first by default; soft-deleted rows hidden):
 *   - listForConversation:           the canonical thread feed (legacy, capped take)
 *   - listForConversationPaginated:  cursor-based feed used by the live chat UI
 *   - listForEntity:                 convenience — finds the convo, lists messages
 *   - listForPerson:                 personCode-keyed cross-conversation feed
 *   - listInbox:                     org-wide newest, filtered (legacy/admin)
 *   - listRecent:                    dashboard widget
 *   - getById:                       one message + author / reply ref
 */

import { paginationOptsValidator } from "convex/server";
import { v } from "convex/values";
import {
	orgQuery,
	requireOrgMember,
	requireOrgMemberByIds,
} from "../../../_functions/authenticated";
import type { Doc, Id } from "../../../_generated/dataModel";
import { internalQuery } from "../../../_generated/server";
import { entityTypeForChatValidator } from "../../../_shared/entityCodes";
import { hasPermission, requireRole } from "../../../_shared/permissions";
import { findConversation, getMyMembership } from "../conversations/internal";

/**
 * Visibility filter for messages.
 *
 * Drops two classes of rows:
 *   1. Tombstones — `deletedAt !== undefined`. Reserved for legacy soft
 *      deletes; new code uses hard delete (see `mutations.remove`).
 *   2. Per-user "delete for me" — when `deletedFor[]` contains the caller.
 *
 * The closure is created once per query call so the filter is a tight
 * loop (no re-evaluation of `userId` per row).
 */
function makeMessageVisibilityFilter(userId: Id<"users">) {
	const me = String(userId);
	return (m: Doc<"messages">) => {
		if (m.deletedAt !== undefined) return false;
		if (m.deletedFor?.some((u) => String(u) === me)) return false;
		return true;
	};
}

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
		return rows.filter(makeMessageVisibilityFilter(userId));
	},
});

/**
 * Cursor-paginated thread feed for the chat surface.
 *
 * 2026-05-17 (batch 5): the live chat UI uses this instead of `listForConversation`
 * so long threads load in pages of 30 (initial), with `loadMore` fetching older
 * messages on demand. New messages still appear reactively in the first page —
 * Convex's reactive paginate keeps the latest page warm.
 *
 * Soft-deleted rows are filtered AFTER `.paginate()` returns. The cursor is
 * computed from the index, not from the filtered result, so pagination
 * advancement stays correct even when some rows are hidden — the visible page
 * just contains slightly fewer rows than `numItems` requested. Acceptable in
 * exchange for not having to re-design the index.
 */
export const listForConversationPaginated = orgQuery({
	args: {
		orgId: v.id("orgs"),
		conversationId: v.id("conversations"),
		paginationOpts: paginationOptsValidator,
	},
	handler: async (ctx, args) => {
		const { userId, member } = await requireOrgMember(ctx, args.orgId);
		requireRole(member.permissions, "messages.view");

		const conversation = await ctx.db.get(args.conversationId);
		if (!conversation || conversation.orgId !== args.orgId) {
			return { page: [], isDone: true, continueCursor: "" };
		}

		const myMembership = await getMyMembership(ctx, {
			conversationId: args.conversationId,
			userId,
		});
		const canModerate = hasPermission(member.permissions, "messages.viewAll");
		if (!myMembership && !canModerate) {
			return { page: [], isDone: true, continueCursor: "" };
		}

		const result = await ctx.db
			.query("messages")
			.withIndex("by_conversation_and_created", (q) =>
				q.eq("conversationId", args.conversationId),
			)
			.order("desc")
			.paginate(args.paginationOpts);

		return {
			...result,
			page: result.page.filter(makeMessageVisibilityFilter(userId)),
		};
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
			messages: rows.filter(makeMessageVisibilityFilter(userId)),
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
		const { userId, member } = await requireOrgMember(ctx, args.orgId);
		requireRole(member.permissions, "messages.view");

		const cap = args.limit ?? 100;

		const rows = await ctx.db
			.query("messages")
			.withIndex("by_org_and_personCode", (q) =>
				q.eq("orgId", args.orgId).eq("personCode", args.personCode),
			)
			.order("desc")
			.take(cap);
		return rows.filter(makeMessageVisibilityFilter(userId));
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

		const live = recent.filter(makeMessageVisibilityFilter(userId));

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
		const { userId, member } = await requireOrgMember(ctx, args.orgId);
		requireRole(member.permissions, "messages.view");

		const rows = await ctx.db
			.query("messages")
			.withIndex("by_org_and_created", (q) => q.eq("orgId", args.orgId))
			.order("desc")
			.take(args.limit ?? 5);
		return rows.filter(makeMessageVisibilityFilter(userId));
	},
});

/**
 * Get one message by id (for reply previews, message-detail dialogs).
 */
export const getById = orgQuery({
	args: { orgId: v.id("orgs"), messageId: v.id("messages") },
	handler: async (ctx, args) => {
		const { userId, member } = await requireOrgMember(ctx, args.orgId);
		requireRole(member.permissions, "messages.view");

		const message = await ctx.db.get(args.messageId);
		if (!message || message.orgId !== args.orgId || message.deletedAt !== undefined) {
			return null;
		}
		// Hidden for the caller via "delete for me" — treat as not found.
		if (message.deletedFor?.some((u) => String(u) === String(userId))) return null;
		return message;
	},
});

// ─── ForAI internal twins ────────────────────────────────────────────────────
//
// Stage 2 of SPRINT-PLAN.md (2026-05-26). Same auth model as the public
// `orgQuery` versions but driven by a trusted `userId` arg instead of
// `getAuthUserId`. AI tools call these via the `toolQuery` helper which
// auto-rewrites `module:export` → `module:exportForAI` and injects userId.
//
// Per AGENTS.md non-negotiable rule: any public mutation/query an AI tool
// calls MUST have a same-file twin. We share the same body (inline because
// queries are short and read-only) so behaviour cannot diverge.

export const listForConversationForAI = internalQuery({
	args: {
		orgId: v.id("orgs"),
		userId: v.id("users"),
		conversationId: v.id("conversations"),
		limit: v.optional(v.number()),
	},
	handler: async (ctx, args) => {
		const { member } = await requireOrgMemberByIds(ctx, args.orgId, args.userId);
		requireRole(member.permissions, "messages.view");

		const conversation = await ctx.db.get(args.conversationId);
		if (!conversation || conversation.orgId !== args.orgId) return [];

		const myMembership = await getMyMembership(ctx, {
			conversationId: args.conversationId,
			userId: args.userId,
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
		return rows.filter(makeMessageVisibilityFilter(args.userId));
	},
});

export const listForEntityForAI = internalQuery({
	args: {
		orgId: v.id("orgs"),
		userId: v.id("users"),
		entityType: entityTypeForChatValidator,
		entityId: v.string(),
		threadId: v.optional(v.string()),
		limit: v.optional(v.number()),
	},
	handler: async (ctx, args) => {
		const { member } = await requireOrgMemberByIds(ctx, args.orgId, args.userId);
		requireRole(member.permissions, "messages.view");

		const conversation = await findConversation(ctx, args);
		if (!conversation) return { conversation: null, messages: [] };

		const myMembership = await getMyMembership(ctx, {
			conversationId: conversation._id,
			userId: args.userId,
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
			messages: rows.filter(makeMessageVisibilityFilter(args.userId)),
		};
	},
});

export const listForPersonForAI = internalQuery({
	args: {
		orgId: v.id("orgs"),
		userId: v.id("users"),
		personCode: v.string(),
		limit: v.optional(v.number()),
	},
	handler: async (ctx, args) => {
		const { member } = await requireOrgMemberByIds(ctx, args.orgId, args.userId);
		requireRole(member.permissions, "messages.view");

		const cap = args.limit ?? 100;
		const rows = await ctx.db
			.query("messages")
			.withIndex("by_org_and_personCode", (q) =>
				q.eq("orgId", args.orgId).eq("personCode", args.personCode),
			)
			.order("desc")
			.take(cap);
		return rows.filter(makeMessageVisibilityFilter(args.userId));
	},
});

export const listInboxForAI = internalQuery({
	args: {
		orgId: v.id("orgs"),
		userId: v.id("users"),
		filter: v.optional(
			v.union(v.literal("all"), v.literal("unread"), v.literal("ai"), v.literal("mine")),
		),
		scanLimit: v.optional(v.number()),
		limit: v.optional(v.number()),
	},
	handler: async (ctx, args) => {
		const { member } = await requireOrgMemberByIds(ctx, args.orgId, args.userId);
		requireRole(member.permissions, "messages.view");

		const filter = args.filter ?? "all";
		const scanLimit = args.scanLimit ?? 500;
		const cap = args.limit ?? 50;

		const recent = await ctx.db
			.query("messages")
			.withIndex("by_org_and_created", (q) => q.eq("orgId", args.orgId))
			.order("desc")
			.take(scanLimit);

		const live = recent.filter(makeMessageVisibilityFilter(args.userId));

		const seen = new Map<string, (typeof live)[number]>();
		for (const m of live) {
			const key = String(m.conversationId);
			if (!seen.has(key)) seen.set(key, m);
		}

		const conversations = [...seen.values()];

		const canModerate = hasPermission(member.permissions, "messages.viewAll");
		const filteredOut = [];
		for (const m of conversations) {
			if (!canModerate) {
				const myMembership = await getMyMembership(ctx, {
					conversationId: m.conversationId,
					userId: args.userId,
				});
				if (!myMembership) continue;
			}
			if (filter === "ai" && m.authorType !== "ai") continue;
			if (filter === "mine" && String(m.authorId) !== String(args.userId)) continue;
			filteredOut.push(m);
			if (filteredOut.length >= cap) break;
		}

		return filteredOut;
	},
});
