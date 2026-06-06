"use client";
/**
 * core/ai/components/ChatOfflineBanner.tsx
 *
 * Thin status banner pinned to the top of the AI chat panel when the browser
 * reports no network connection (`navigator.onLine === false`).
 *
 * Why it matters: `ConvexReactClient` queues mutations while the WebSocket is
 * down and replays them on reconnect (exponential backoff, built in), so a
 * message sent while offline is NOT lost. But without a signal the user
 * assumes the app is broken. This banner sets the expectation —
 * "your message will send when you reconnect."
 *
 * Renders `null` when online, so it costs zero layout on the happy path.
 * `role="status"` + `aria-live="polite"` announce the state change to screen
 * readers without stealing focus. Amber warning palette + RTL-safe logical
 * classes match `WarnModeBanner` (the repo's thin-top-banner convention).
 */
import { WifiOff } from "lucide-react";
import { useOnlineStatus } from "../hooks/useOnlineStatus";

export function ChatOfflineBanner() {
	const isOnline = useOnlineStatus();
	if (isOnline) return null;

	return (
		<div
			role="status"
			aria-live="polite"
			className="flex shrink-0 items-center gap-2 border-b border-amber-300/60 bg-amber-50/80 px-3 py-2 text-amber-900 text-xs dark:border-amber-700/50 dark:bg-amber-950/30 dark:text-amber-100"
		>
			<WifiOff className="size-3.5 shrink-0 text-amber-700 dark:text-amber-300" aria-hidden />
			<span className="min-w-0">
				You're offline — your message will send when you reconnect.
			</span>
		</div>
	);
}
