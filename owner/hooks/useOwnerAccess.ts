"use client";

/**
 * useOwnerAccess — thin client-side hook that answers "am I currently
 * inside the owner-panel route tree?" without reading the slug from the
 * JS bundle. Reads the `is_owner_panel=1` cookie set by middleware on
 * every owner-panel rewrite.
 *
 * **Why a hook instead of a context value.** The cookie is set server-side
 * before the React tree mounts, so reading it in `useEffect` is reliable
 * and avoids hydration mismatches. Components that need this signal are
 * typically telemetry-adjacent (analytics, error reporters); a hook keeps
 * the API tiny.
 *
 * Spec: PLATFORM-OWNER-PANEL.md §9.3 (cookie-based filter).
 */
import { useEffect, useState } from "react";

export const OWNER_PANEL_COOKIE = "is_owner_panel";

function readCookie(name: string): string | undefined {
	if (typeof document === "undefined") return undefined;
	const match = document.cookie.match(
		new RegExp(`(?:^|;\\s*)${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}=([^;]+)`),
	);
	return match?.[1];
}

export function useOwnerAccess(): boolean {
	const [isOwnerPanel, setIsOwnerPanel] = useState(false);
	useEffect(() => {
		setIsOwnerPanel(readCookie(OWNER_PANEL_COOKIE) === "1");
	}, []);
	return isOwnerPanel;
}
