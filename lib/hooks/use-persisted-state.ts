"use client";

/**
 * usePersistedState — useState that mirrors to localStorage so values survive
 * route changes and reloads.
 *
 * Why this exists
 * ───────────────
 * Per-session view options (which card fields are visible, which hidden
 * statuses the user revealed, which axis the board groups by) reset on every
 * navigation when held in plain `useState`. localStorage gives us a quick,
 * device-local persistence layer — no backend round-trip, instant reads.
 *
 * Contract
 * ────────
 *   - Server-render safe: returns the initial value during SSR; reads
 *     localStorage on mount.
 *   - JSON-serialisable values only.
 *   - Invalid / corrupt entries are silently dropped (we fall back to the
 *     initial value rather than throwing).
 *   - Keys are namespaced under `flowbite:state:` so we never collide with
 *     other libraries.
 */

import { useCallback, useEffect, useRef, useState } from "react";

const KEY_PREFIX = "flowbite:state:";

function readStored<T>(key: string, fallback: T): T {
	if (typeof window === "undefined") return fallback;
	try {
		const raw = window.localStorage.getItem(KEY_PREFIX + key);
		if (raw === null) return fallback;
		return JSON.parse(raw) as T;
	} catch {
		return fallback;
	}
}

function writeStored<T>(key: string, value: T): void {
	if (typeof window === "undefined") return;
	try {
		window.localStorage.setItem(KEY_PREFIX + key, JSON.stringify(value));
	} catch {
		/* quota / private mode — silently no-op */
	}
}

/**
 * Persistent useState. Reads from localStorage on mount; writes on every
 * change. Returns the same `[value, setValue]` shape as React.useState.
 *
 * @param key  Stable storage key (namespaced under `flowbite:state:`).
 * @param initialValue Fallback for the first render and for missing /
 *                     corrupt entries.
 */
export function usePersistedState<T>(
	key: string,
	initialValue: T,
): [T, React.Dispatch<React.SetStateAction<T>>] {
	const [value, setValue] = useState<T>(initialValue);
	const hydratedRef = useRef(false);

	// Hydrate from localStorage exactly once on mount.
	// biome-ignore lint/correctness/useExhaustiveDependencies: usePersistedState is intentionally locked to a single key for the component's lifetime; swapping keys mid-flight would clobber state. Callers that genuinely need a different key should remount.
	useEffect(() => {
		if (hydratedRef.current) return;
		hydratedRef.current = true;
		const stored = readStored<T | undefined>(key, undefined as unknown as T);
		if (stored !== undefined) setValue(stored);
	}, []);

	const setAndPersist = useCallback<React.Dispatch<React.SetStateAction<T>>>(
		(next) => {
			setValue((prev) => {
				const resolved = typeof next === "function" ? (next as (p: T) => T)(prev) : next;
				writeStored(key, resolved);
				return resolved;
			});
		},
		[key],
	);

	return [value, setAndPersist];
}
