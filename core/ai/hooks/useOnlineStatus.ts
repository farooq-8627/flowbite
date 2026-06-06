"use client";
/**
 * core/ai/hooks/useOnlineStatus.ts
 *
 * Reactive network-connectivity flag, driving the AI chat shell's offline
 * banner (`ChatOfflineBanner`).
 *
 * Implementation is the React-canonical `useSyncExternalStore` +
 * `navigator.onLine` pattern — the exact `useOnlineStatus` example from the
 * React docs:
 *   https://react.dev/reference/react/useSyncExternalStore#adding-support-for-server-rendering
 *
 *   - `subscribe` is module-level (stable identity) so React never
 *     re-subscribes across re-renders (per the docs' "My subscribe function
 *     gets called after every re-render" note).
 *   - `getServerSnapshot` returns `true` so the server HTML + the first
 *     hydration pass always render "online". We never emit an offline banner
 *     into server output (it would hydrate-mismatch or flash); the client
 *     reconciles to the real `navigator.onLine` value immediately on mount.
 *
 * Contract caveat: `navigator.onLine === true` only means the device has *a*
 * network interface up — it does NOT guarantee the Convex WebSocket is
 * connected. `false` is a reliable "definitely offline" signal; `true` is
 * "probably online". That's the right contract for a soft UX banner: we only
 * ever surface the banner on the reliable-negative.
 */
import { useSyncExternalStore } from "react";

function subscribe(callback: () => void): () => void {
	window.addEventListener("online", callback);
	window.addEventListener("offline", callback);
	return () => {
		window.removeEventListener("online", callback);
		window.removeEventListener("offline", callback);
	};
}

function getSnapshot(): boolean {
	return navigator.onLine;
}

function getServerSnapshot(): boolean {
	// Server render + first client hydration: assume online so we never put an
	// offline banner into server HTML. The client reconciles on mount.
	return true;
}

/** `true` when the browser reports a live network connection. */
export function useOnlineStatus(): boolean {
	return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
