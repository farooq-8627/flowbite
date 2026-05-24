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
