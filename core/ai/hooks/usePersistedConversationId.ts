"use client";
/**
 * core/ai/hooks/usePersistedConversationId.ts
 *
 * Stage 3-A H3 — chat panel persists active conversation across refresh.
 *
 * Drop-in replacement for `useState<Id<"aiConversations"> | null>(null)`
 * that mirrors the value into `localStorage` keyed by orgId. Three
 * properties matter:
 *   1. SSR-safe — first paint returns null when window is undefined.
 *      The hook updates from storage in a layout effect after mount, so
 *      hydration mismatch is avoided on Next.js dynamic-rendered pages.
 *   2. Per-org isolation — switching orgs must NOT leak the previous
 *      org's stored thread. Storage key includes orgId. When orgId is
 *      undefined (no current org) we no-op.
 *   3. Stale-id resilience — caller can pass a `validIds` set; if the
 *      restored id is not present, the hook silently clears storage and
 *      returns null. Prevents loading a deleted/archived thread.
 *
 * Conventions follow AGENTS.md performance + max-update-depth rules:
 *   - Setter is wrapped in `useCallback([])` so it's stable; safe in
 *     deps.
 *   - We never put the *return* of this hook in another effect's deps
 *     (we destructure `setConversationId` and use it directly).
 */

import { useCallback, useEffect, useRef, useState } from "react";
import type { Id } from "@/convex/_generated/dataModel";

const STORAGE_PREFIX = "flowbite:chat:";
const STORAGE_SUFFIX = ":activeConv";

function buildKey(orgId: Id<"orgs"> | undefined): string | null {
	if (!orgId) return null;
	return `${STORAGE_PREFIX}${orgId}${STORAGE_SUFFIX}`;
}

function readStored(orgId: Id<"orgs"> | undefined): Id<"aiConversations"> | null {
	if (typeof window === "undefined") return null;
	const key = buildKey(orgId);
	if (!key) return null;
	try {
		const raw = window.localStorage.getItem(key);
		if (!raw) return null;
		// Convex ids are opaque strings; we don't validate the format here.
		return raw as Id<"aiConversations">;
	} catch {
		// localStorage may throw in private-browsing modes — degrade silently.
		return null;
	}
}

function writeStored(orgId: Id<"orgs"> | undefined, value: Id<"aiConversations"> | null): void {
	if (typeof window === "undefined") return;
	const key = buildKey(orgId);
	if (!key) return;
	try {
		if (value === null) window.localStorage.removeItem(key);
		else window.localStorage.setItem(key, value);
	} catch {
		// noop on storage quota / disabled
	}
}

export interface UsePersistedConversationIdOptions {
	/**
	 * Optional set of currently-existing conversation ids. When provided,
	 * the hook drops a stored id that's no longer in the set (deleted /
	 * archived) on mount.
	 */
	validIds?: ReadonlySet<string>;
}

/**
 * `[conversationId, setConversationId]` — same shape as `useState`.
 *
 * Mounts in three steps:
 *   1. First render: returns `null` (SSR-safe).
 *   2. Layout effect: reads storage, validates against `options.validIds`
 *      if supplied, sets the local state if the id is still valid.
 *   3. Subsequent setter calls: write through to storage immediately.
 *
 * When `orgId` changes, the local state resets to null and the storage
 * read re-runs against the new org's key. Stored values from a previous
 * org are NOT migrated.
 */
export function usePersistedConversationId(
	orgId: Id<"orgs"> | undefined,
	options?: UsePersistedConversationIdOptions,
): [Id<"aiConversations"> | null, (next: Id<"aiConversations"> | null) => void] {
	const [conversationId, setLocalConversationId] = useState<Id<"aiConversations"> | null>(null);

	// Track validIds via a ref so the effect doesn't re-fire when the set
	// reference changes mid-life — we only want to validate ON MOUNT (or
	// on org change), not on every conversations-list refresh.
	const validIdsRef = useRef<ReadonlySet<string> | undefined>(options?.validIds);
	validIdsRef.current = options?.validIds;

	// Restore from storage on mount + on orgId change.
	useEffect(() => {
		if (!orgId) {
			setLocalConversationId(null);
			return;
		}
		const stored = readStored(orgId);
		if (!stored) {
			setLocalConversationId(null);
			return;
		}
		const valid = validIdsRef.current;
		if (valid && !valid.has(stored)) {
			// Stale id — clear silently, fall back to null landing pane.
			writeStored(orgId, null);
			setLocalConversationId(null);
			return;
		}
		setLocalConversationId(stored);
	}, [orgId]);

	const setConversationId = useCallback(
		(next: Id<"aiConversations"> | null) => {
			setLocalConversationId(next);
			writeStored(orgId, next);
		},
		[orgId],
	);

	return [conversationId, setConversationId];
}
