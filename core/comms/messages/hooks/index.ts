/**
 * Messages hooks — wrap Convex queries + mutations for the messages module.
 *
 * Status: IMPLEMENTED (Phase 2 backend wiring).
 *
 * Convention: each hook either returns data (queries) or a callable (mutations).
 * Pass `"skip"` automatically when args are not yet available.
 */
"use client";

import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";

// ─── Read hooks ──────────────────────────────────────────────────────────────

/** All messages on an entity thread (newest first). Used by `MessagesPanel`. */
export function useMessagesForEntity(args: {
	orgId?: Id<"orgs">;
	entityType: string;
	entityId: string;
	limit?: number;
}) {
	return useQuery(
		api.crm.shared.messages.queries.listForEntity,
		args.orgId
			? {
					orgId: args.orgId,
					entityType: args.entityType,
					entityId: args.entityId,
					limit: args.limit,
				}
			: "skip",
	);
}

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

/** Org-wide inbox — one row per active conversation. Used by `MessagesInboxView`. */
export function useMessagesInbox(args: {
	orgId?: Id<"orgs">;
	filter?: "all" | "unread" | "ai" | "mine";
	limit?: number;
	scanLimit?: number;
}) {
	return useQuery(
		api.crm.shared.messages.queries.listInbox,
		args.orgId
			? {
					orgId: args.orgId,
					filter: args.filter ?? "all",
					limit: args.limit,
					scanLimit: args.scanLimit,
				}
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

// ─── Write hooks ─────────────────────────────────────────────────────────────

/** Send a message. Returns `(args) => Promise<messageId>`. */
export function useSendMessage() {
	return useMutation(api.crm.shared.messages.mutations.send);
}

/** Mark one message as read (per-user, idempotent). */
export function useMarkMessageRead() {
	return useMutation(api.crm.shared.messages.mutations.markRead);
}

/** Mark every message in a thread as read. */
export function useMarkAllMessagesRead() {
	return useMutation(api.crm.shared.messages.mutations.markAllRead);
}

/** Delete a message — own-message + `messages.delete`, OR `messages.deleteAny`. */
export function useDeleteMessage() {
	return useMutation(api.crm.shared.messages.mutations.remove);
}
