/**
 * Messages + conversations hooks — wrap Convex queries + mutations.
 *
 * Status: Production-grade — conversation-aware, multi-participant,
 * per-user read state via `conversationMembers.lastReadAt`.
 *
 * Convention: each hook either returns data (queries) or a callable (mutations).
 * Pass `"skip"` automatically when args are not yet available.
 *
 * Sidebar/Main split (locked):
 *   - `useInbox()`         — for the sidebar (conversation list + unread badges)
 *   - `useConversation()`  — for the main pane (one thread + its messages)
 *   These are intentionally separate so the profile/deal/company embedded
 *   panel can use only `useConversation` (no sidebar).
 */
"use client";

import { useMutation, usePaginatedQuery, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";

/** Closed union mirroring the backend `entityTypeForChatValidator`. */
export type ChatEntityType =
	| "lead"
	| "contact"
	| "deal"
	| "company"
	| "person"
	| "user"
	| "project"
	| "task";

// ─── Inbox (sidebar) ────────────────────────────────────────────────────────

/** Per-user inbox: every conversation the caller is in. Used by `MessagesSidebar`. */
export function useInbox(args: {
	orgId?: Id<"orgs">;
	filter?: "all" | "unread" | "archived";
	limit?: number;
}) {
	return useQuery(
		api.crm.shared.conversations.queries.listForUser,
		args.orgId
			? {
					orgId: args.orgId,
					filter: args.filter ?? "all",
					limit: args.limit,
				}
			: "skip",
	);
}

/** Total unread badge count across all my conversations. Used by sidebar nav. */
export function useTotalUnread(args: { orgId?: Id<"orgs"> }) {
	return useQuery(
		api.crm.shared.conversations.queries.getMyTotalUnread,
		args.orgId ? { orgId: args.orgId } : "skip",
	);
}

// ─── Single conversation (main pane) ────────────────────────────────────────

/**
 * Fetch a conversation and its messages by entity. Auto-resolves the conversation
 * id from (entityType, entityId, threadId?). Returns `{ conversation, messages }`.
 *
 * Used by **both** the org-wide inbox (after sidebar selection) and the
 * profile/deal/company embedded panel.
 */
export function useConversationForEntity(args: {
	orgId?: Id<"orgs">;
	entityType: ChatEntityType;
	entityId: string;
	threadId?: string;
	limit?: number;
}) {
	return useQuery(
		api.crm.shared.messages.queries.listForEntity,
		args.orgId
			? {
					orgId: args.orgId,
					entityType: args.entityType,
					entityId: args.entityId,
					threadId: args.threadId,
					limit: args.limit,
				}
			: "skip",
	);
}

/** Messages of an existing conversation (when you have the conversationId already). */
export function useMessagesForConversation(args: {
	orgId?: Id<"orgs">;
	conversationId?: Id<"conversations">;
	limit?: number;
}) {
	return useQuery(
		api.crm.shared.messages.queries.listForConversation,
		args.orgId && args.conversationId
			? {
					orgId: args.orgId,
					conversationId: args.conversationId,
					limit: args.limit,
				}
			: "skip",
	);
}

/**
 * Cursor-paginated thread feed used by the live chat UI.
 *
 * Returns `{ results, status, loadMore, isLoading }`:
 *   - `results` — accumulated newest-first messages across all loaded pages.
 *     `MessageList` reverses these once on the client for chronological DOM
 *     order.
 *   - `status` — "LoadingFirstPage" | "CanLoadMore" | "LoadingMore" | "Exhausted".
 *   - `loadMore(n)` — fetch the next older page; called by the list when the
 *     user scrolls near the top.
 *
 * 2026-05-17 (batch 5): replaces the legacy `useMessagesForConversation` for
 * the chat surface so threads with hundreds of messages don't fetch everything
 * up-front. The non-paginated hook is kept for callers that just need a
 * one-shot small slice (e.g. previews, inbox-bound widgets).
 */
export function useMessagesForConversationPaginated(args: {
	orgId?: Id<"orgs">;
	conversationId?: Id<"conversations">;
	initialNumItems?: number;
}) {
	return usePaginatedQuery(
		api.crm.shared.messages.queries.listForConversationPaginated,
		args.orgId && args.conversationId
			? { orgId: args.orgId, conversationId: args.conversationId }
			: "skip",
		{ initialNumItems: args.initialNumItems ?? 30 },
	);
}

/** Active members of a conversation (for the avatar row). */
export function useConversationParticipants(args: {
	orgId?: Id<"orgs">;
	conversationId?: Id<"conversations">;
}) {
	return useQuery(
		api.crm.shared.conversations.queries.listParticipants,
		args.orgId && args.conversationId
			? { orgId: args.orgId, conversationId: args.conversationId }
			: "skip",
	);
}

/** Recent messages across the org — feeds the dashboard `MessagesPreviewWidget`. */
export function useRecentMessages(args: { orgId?: Id<"orgs">; limit?: number }) {
	return useQuery(
		api.crm.shared.messages.queries.listRecent,
		args.orgId ? { orgId: args.orgId, limit: args.limit ?? 5 } : "skip",
	);
}

// ─── Person scope (profile page) ────────────────────────────────────────────

/** All messages tied to a personCode across entity types. Used in the profile Messages tab. */
export function useMessagesForPerson(args: {
	orgId?: Id<"orgs">;
	personCode: string;
	limit?: number;
}) {
	return useQuery(
		api.crm.shared.messages.queries.listForPerson,
		args.orgId ? { orgId: args.orgId, personCode: args.personCode, limit: args.limit } : "skip",
	);
}

// ─── Mutations ──────────────────────────────────────────────────────────────

/** Send a message. Pass `idempotencyKey` for retry safety on flaky networks. */
export function useSendMessage() {
	return useMutation(api.crm.shared.messages.mutations.send);
}

/**
 * Get-or-create a conversation for an entity. Returns the conversation id.
 * Used by `NewConversationDialog` so the sidebar selection state can flip
 * to the new thread immediately (before the first message exists). Repeat
 * calls for the same (entityType, entityId, threadId?) return the same id.
 */
export function useEnsureConversation() {
	return useMutation(api.crm.shared.conversations.mutations.ensureForEntity);
}

/** Edit own message (within 15-min edit window). */
export function useEditMessage() {
	return useMutation(api.crm.shared.messages.mutations.update);
}

/** Soft-delete a message — own + `messages.deleteOwn`, OR `messages.deleteAny`. */
export function useDeleteMessage() {
	return useMutation(api.crm.shared.messages.mutations.remove);
}

/** Toggle a 👍/👎/etc. reaction on a message. */
export function useToggleReaction() {
	return useMutation(api.crm.shared.messages.mutations.toggleReaction);
}

/** Mark a conversation as read up to `now` (per-user). */
export function useMarkConversationRead() {
	return useMutation(api.crm.shared.conversations.mutations.markRead);
}

/** Add participants to a conversation (owner-only or `messages.subscribe`). */
export function useAddParticipants() {
	return useMutation(api.crm.shared.conversations.mutations.addParticipants);
}

/** Remove a participant. Self-removal allowed for any member. */
export function useRemoveParticipant() {
	return useMutation(api.crm.shared.conversations.mutations.removeParticipant);
}

/** Self-leave a conversation. Idempotent. */
export function useLeaveConversation() {
	return useMutation(api.crm.shared.conversations.mutations.leave);
}

/** Update my notification level on a conversation: all / mentions / none. */
export function useUpdateNotificationLevel() {
	return useMutation(api.crm.shared.conversations.mutations.updateNotificationLevel);
}

/** Archive / unarchive a conversation (org-level — affects inbox visibility). */
export function useArchiveConversation() {
	return useMutation(api.crm.shared.conversations.mutations.archive);
}

export function useUnarchiveConversation() {
	return useMutation(api.crm.shared.conversations.mutations.unarchive);
}

/** Rename a conversation title. */
export function useRenameConversation() {
	return useMutation(api.crm.shared.conversations.mutations.rename);
}
