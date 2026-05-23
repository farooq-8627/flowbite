"use client";
/**
 * core/ai/lib/uiPreferences.ts
 *
 * SSR-safe persistent UI state for the AI chat panel.
 *
 * Why a tiny custom hook instead of a 3rd-party state library:
 *   - These prefs are device-local, not server-state. We don't want them
 *     in Convex (one round-trip per render is wasteful).
 *   - We don't want Zustand for a single boolean.
 *   - We need SSR safety (Next.js App Router pre-renders on the server).
 *
 * Conventions:
 *   - All keys live under the `flowbite:ai:` prefix to avoid collisions.
 *   - Reads are synchronous (after mount); writes are fire-and-forget.
 *   - Falls back to the supplied default whenever localStorage is unavailable
 *     (SSR, locked-down browsers, private mode quotas).
 */
import { useCallback, useEffect, useState } from "react";

const PREFIX = "flowbite:ai:";

/** All persisted keys live here so Find Usages can locate them. */
export const UI_PREF_KEYS = {
	reasoningExpanded: `${PREFIX}reasoning-expanded`,
} as const;

function readBoolean(key: string, fallback: boolean): boolean {
	if (typeof window === "undefined") return fallback;
	try {
		const raw = window.localStorage.getItem(key);
		if (raw === null) return fallback;
		return raw === "true";
	} catch {
		return fallback;
	}
}

function writeBoolean(key: string, value: boolean): void {
	if (typeof window === "undefined") return;
	try {
		window.localStorage.setItem(key, value ? "true" : "false");
	} catch {
		// Private mode / quota errors — silently ignore.
	}
}

/**
 * SSR-safe persisted-boolean hook.
 *
 * Returns [value, setValue]. Reads from localStorage on mount and falls back
 * to `fallback` until then so SSR markup stays consistent.
 */
export function usePersistedBoolean(
	key: string,
	fallback: boolean,
): [boolean, (next: boolean | ((prev: boolean) => boolean)) => void] {
	const [value, setValue] = useState<boolean>(fallback);

	// Read once on mount.
	useEffect(() => {
		setValue(readBoolean(key, fallback));
		// We deliberately do NOT include `fallback` in deps — fallback only
		// matters on first read.
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [key]);

	const update = useCallback(
		(next: boolean | ((prev: boolean) => boolean)) => {
			setValue((prev) => {
				const resolved = typeof next === "function" ? next(prev) : next;
				writeBoolean(key, resolved);
				return resolved;
			});
		},
		[key],
	);

	return [value, update];
}
