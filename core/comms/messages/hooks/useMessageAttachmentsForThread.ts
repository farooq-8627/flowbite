"use client";

/**
 * useMessageAttachmentsForThread — batched attachment lookup for a chat thread.
 *
 * Replaces the per-bubble `useQuery(api.files.queries.listByIds, …)` call with
 * ONE conversation-level subscription that fetches every visible message's
 * attachments in a single round-trip. The result is a `Record<fileId, FileWithUrl>`
 * keyed by id; `MessageList` slices it per bubble and hands each `MessageBubble`
 * its own slice via prop.
 *
 * Why this hook exists:
 *   The previous implementation fired one `listByIds` subscription per message
 *   that had attachments. A long thread with 30 visible bubbles, each with a
 *   single file, produced 30 separate Convex subscriptions for what is
 *   logically one read — the union of attachment ids across the page. This is
 *   the same pattern the notes board solved with `useAttachmentDisplaysForOrg`
 *   (see AGENTS.md "Per-row data on a list view comes from one batched query").
 *
 * Stability:
 *   Convex compares query args by structural equality. The hook builds a
 *   deterministic string cache key (sorted, de-duped) before deriving the
 *   array of ids — so the args object is referentially stable as long as the
 *   actual SET of ids hasn't changed. If a single new attachment lands in the
 *   thread, the key changes by exactly one entry; if no attachment changed,
 *   the cache key is identical and Convex re-uses the existing subscription.
 */

import { useQuery } from "convex/react";
import { useMemo } from "react";
import { api } from "@/convex/_generated/api";
import type { Doc, Id } from "@/convex/_generated/dataModel";

type FileWithUrl = Doc<"files"> & { url: string | null };

export type AttachmentFilesById = Record<string, FileWithUrl>;

/**
 * Tri-state return type used by `MessageList` → `MessageBubble`:
 *   - `Record<…>` — data ready (may be empty when there are no attachments
 *     on the page, in which case no subscription is opened).
 *   - `null` — batched mode is active but the subscription is still loading.
 *     `MessageBubble` honours this sentinel to render no attachments yet.
 *   - `undefined` — never returned from this hook; parents that omit the
 *     prop entirely signal standalone mode to `MessageBubble`.
 */
export type AttachmentFilesByIdOrLoading = AttachmentFilesById | null;

/**
 * Collect attachment ids from the given messages, de-dupe + sort, and
 * subscribe to the keyed batch query. Skips when `orgId` isn't ready or
 * when there are zero attachments on the visible page (avoids burning a
 * subscription for empty results).
 *
 * Returns:
 *   - `null` while the subscription is loading on first paint
 *     (only when there's at least one id to fetch).
 *   - `{}` when the page has no attachments (no subscription is opened —
 *     the empty record is computed locally).
 *   - `Record<fileId, FileWithUrl>` once data is available.
 */
export function useMessageAttachmentsForThread(args: {
	orgId?: Id<"orgs">;
	messages: ReadonlyArray<Doc<"messages">> | undefined;
}): AttachmentFilesByIdOrLoading {
	const { orgId, messages } = args;

	// Build a stable cache key: sorted + de-duped union of attachment ids.
	// Storing the key as a single string keeps biome's exhaustive-deps lint
	// happy with a primitive dep, and means the `useMemo` cache only
	// invalidates when the actual set of ids changes.
	const cacheKey = useMemo(() => {
		if (!messages) return "";
		const seen = new Set<string>();
		for (const m of messages) {
			const ids = m.attachments;
			if (!ids || ids.length === 0) continue;
			for (const id of ids) {
				seen.add(String(id));
			}
		}
		if (seen.size === 0) return "";
		return Array.from(seen).sort().join("|");
	}, [messages]);

	// Derive the typed array from the cache key. Same trick as
	// `useAttachmentDisplaysForOrg`: the array reference is stable as long
	// as the key is stable.
	const stableIds = useMemo<Id<"files">[]>(() => {
		if (cacheKey.length === 0) return [];
		// `as Id<"files">` is the canonical way to re-tag opaque ids in this
		// codebase — the strings came from `Doc<"messages">["attachments"]`
		// which is `Id<"files">[]`, so the round-trip is type-safe.
		return cacheKey.split("|").map((s) => s as Id<"files">);
	}, [cacheKey]);

	const data = useQuery(
		api.files.queries.listByIdsKeyed,
		orgId && stableIds.length > 0 ? { orgId, ids: stableIds } : "skip",
	);

	// When there are no attachments on the page, surface an empty record
	// immediately rather than `null` — `MessageBubble` can branch on
	// "no entries" without waiting for a subscription that never opened.
	if (cacheKey.length === 0) {
		return EMPTY_RECORD;
	}
	// The subscription is opened but data hasn't arrived yet. Surface
	// `null` (NOT `undefined`) so `MessageBubble` knows we're in batched
	// mode — passing `undefined` would be interpreted as "standalone" and
	// each bubble would open its own fallback subscription.
	if (data === undefined) return null;
	return data as AttachmentFilesById;
}

// Hoisted singleton so consumers receive the SAME reference every render
// when there are no attachments. Prevents downstream `useMemo` deps that
// observe this value from churning.
const EMPTY_RECORD: AttachmentFilesById = Object.freeze({}) as AttachmentFilesById;
