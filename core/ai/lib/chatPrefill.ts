"use client";

/**
 * core/ai/lib/chatPrefill.ts
 *
 * Tiny event-based bridge for pre-filling the chat composer from anywhere
 * in the app — used by the proactive AI Suggestions panel (P1.14) so a
 * "Take action" click on a suggestion drops the suggested intent into
 * the composer ready for the user to send.
 *
 * Why a window event instead of a Zustand / Convex store?
 *   - The chat panel and the suggestions panel are tree-isolated (the
 *     panel mounts in the sidebar shell; suggestions mount in the
 *     dashboard view). Lifting state to a common ancestor would mean
 *     context plumbing every level.
 *   - The pre-fill is a fire-and-forget signal — no need for state
 *     persistence, no need for a re-render of upstream components.
 *   - One CustomEvent costs nothing and works in both desktop sidebar
 *     and mobile sheet without extra wiring.
 *
 * Usage (publisher):
 *   import { sendChatPrefill } from "@/core/ai/lib/chatPrefill";
 *   sendChatPrefill("Schedule a follow-up with P-001 for next week");
 *
 * Usage (subscriber, in ChatComposer):
 *   useChatPrefillListener((intent) => {
 *     setDraft(intent);
 *     textareaRef.current?.focus();
 *   });
 */

import { useEffect } from "react";

const EVENT_NAME = "flowbite:ai-chat-prefill";
const OPEN_EVENT_NAME = "flowbite:ai-chat-open";

/**
 * Dispatch a chat-prefill intent. Safe to call during render — the
 * effect runs on the next tick. Silently no-ops on the server (where
 * `window` is undefined).
 */
export function sendChatPrefill(intent: string): void {
	if (typeof window === "undefined") return;
	window.dispatchEvent(new CustomEvent(EVENT_NAME, { detail: { intent } }));
}

/**
 * Stage 5 — Open the AI chat panel from anywhere in the app.
 *
 * The dashboard's AIQuickComposerCard pairs this with `sendChatPrefill`
 * to give the user a one-click "type → send" flow without first opening
 * the side sheet. The DashboardLayoutClient owns the open/close state +
 * the cookie persistence, so this is a fire-and-forget signal — the
 * layout listener does the actual work.
 *
 * Idempotent if the panel is already open. Silently no-ops on the
 * server (SSR).
 */
export function openChatPanel(): void {
	if (typeof window === "undefined") return;
	window.dispatchEvent(new CustomEvent(OPEN_EVENT_NAME));
}

/**
 * Subscribe to chat-prefill events. The handler receives the intent
 * string. Auto-cleans up on unmount. The handler ref is read fresh on
 * every event so closures over stale state are not a concern.
 */
export function useChatPrefillListener(handler: (intent: string) => void): void {
	useEffect(() => {
		if (typeof window === "undefined") return;
		const onEvent = (event: Event) => {
			const detail = (event as CustomEvent<{ intent: string }>).detail;
			if (detail && typeof detail.intent === "string") {
				handler(detail.intent);
			}
		};
		window.addEventListener(EVENT_NAME, onEvent);
		return () => {
			window.removeEventListener(EVENT_NAME, onEvent);
		};
	}, [handler]);
}

/**
 * Stage 5 — subscribe to chat-panel-open events. The DashboardLayoutClient
 * uses this to open its panel when `openChatPanel()` is called from the
 * dashboard quick composer (or any other surface that needs to surface
 * the chat). Auto-cleans up on unmount; SSR-safe.
 */
export function useChatPanelOpenListener(handler: () => void): void {
	useEffect(() => {
		if (typeof window === "undefined") return;
		const onEvent = () => {
			handler();
		};
		window.addEventListener(OPEN_EVENT_NAME, onEvent);
		return () => {
			window.removeEventListener(OPEN_EVENT_NAME, onEvent);
		};
	}, [handler]);
}
