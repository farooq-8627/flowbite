"use client";

import { Loader2 } from "lucide-react";
/**
 * MessageList — scrollable, bottom-anchored message feed.
 *
 * Donor: shadboard `apps/chat/_components/chat-box-content-list.tsx`. Adapted:
 *   - Drops the local reducer + chat context — Convex live queries deliver
 *     fresh data automatically (see IMPLEMENTATION.md §5).
 *   - Backend returns messages in descending order (newest first); we reverse
 *     once on the client so the DOM order is chronological. The auto-scroll
 *     math becomes trivial: scrollTop = scrollHeight.
 *   - WhatsApp-style pinned-stick-to-bottom: when the user is at (or within
 *     80px of) the bottom we follow new content; if they've scrolled up to
 *     read history, new messages don't yank them down.
 *   - Date dividers (Tier B4): "Today", "Yesterday", weekday, or full date.
 *
 * 2026-05-17 (batch 5):
 *   - **Sender-only grouping.** A message is a "continuation" of the run iff
 *     the previous message has the same author + same authorType + same day.
 *     The previous 5-minute time window has been removed. So if Alice sends
 *     50 messages back-to-back over 4 hours, only the FIRST shows the avatar
 *     and name; the rest are continuations. Telegram / WhatsApp behaviour.
 *   - **Bottom-anchored scroll, robust to media loads.** On first mount we
 *     snap to the bottom in `useLayoutEffect`, BEFORE the browser paints.
 *     A `ResizeObserver` watches the inner `<ul>`; when its height grows
 *     (image / video / audio finished loading and reflowed) AND the user
 *     was pinned to the bottom, we re-snap. Because `scrollTop` doesn't
 *     change during a content-grow reflow, the scroll handler can't fire,
 *     so `isPinnedRef` keeps its previous value (true) — that's why this
 *     works without a separate "user intent" flag.
 *   - **Cursor-based pagination.** The list accepts `loadOlder` + an
 *     `isLoadingOlder` flag from the parent. When the user scrolls to the
 *     top, an IntersectionObserver on a sentinel `<li>` calls `loadOlder()`.
 *     Before the older messages prepend, we capture `scrollHeight`; after
 *     React commits, we adjust `scrollTop` by the delta so the user's
 *     visual position is preserved (no jump).
 *   - **Reaction-aware bottom spacing.** The previous message's floating
 *     reaction chip pokes below its bubble; we forward `prevHasFloatingReaction`
 *     into `MessageBubble` so the next bubble can bump its top margin.
 */
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { Doc, Id } from "@/convex/_generated/dataModel";
import { useMessageAttachmentsForThread } from "@/core/comms/messages/hooks/useMessageAttachmentsForThread";
import { cn } from "@/lib/utils";
import { MessageBubble } from "./MessageBubble";

/** Distance from the bottom (px) below which we auto-scroll on new messages. */
const PIN_TO_BOTTOM_THRESHOLD = 80;

type Author = { name: string; avatarUrl?: string };

type MessageListProps = {
	/**
	 * Org id of the active conversation. Used by the list-level batched
	 * attachment query so each bubble doesn't open its own subscription.
	 */
	orgId: Id<"orgs">;
	messages: Doc<"messages">[] | undefined;
	authorsById: Map<string, Author>;
	currentUserId: Id<"users"> | undefined;
	/** Server permission for moderation (delete others' messages). */
	canDeleteAny: boolean;
	/** True for 2-participant conversations — bubbles hide the sender label. */
	isDirect: boolean;
	/** Reply target callback — bubbles set the active reply in the parent. */
	onReply?: (message: Doc<"messages">) => void;
	/**
	 * When provided AND `canLoadOlder` is true, an IntersectionObserver on a
	 * sentinel at the top will fetch the next older page automatically.
	 */
	loadOlder?: () => void;
	canLoadOlder?: boolean;
	isLoadingOlder?: boolean;
	className?: string;
};

/**
 * Compute a stable day key (YYYY-MM-DD in the user's local timezone) for
 * grouping messages into date sections.
 */
function dayKey(ts: number): string {
	const d = new Date(ts);
	return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

function dayLabel(ts: number): string {
	const now = new Date();
	const target = new Date(ts);
	const sameDay = (a: Date, b: Date) =>
		a.getFullYear() === b.getFullYear() &&
		a.getMonth() === b.getMonth() &&
		a.getDate() === b.getDate();

	if (sameDay(now, target)) return "Today";
	const yesterday = new Date(now);
	yesterday.setDate(now.getDate() - 1);
	if (sameDay(yesterday, target)) return "Yesterday";

	// Within the past 7 days → weekday name (Mon, Tue…)
	const oneWeekAgo = new Date(now);
	oneWeekAgo.setDate(now.getDate() - 7);
	if (target > oneWeekAgo) {
		return target.toLocaleDateString(undefined, { weekday: "long" });
	}

	// Otherwise → full date.
	return target.toLocaleDateString(undefined, {
		year: target.getFullYear() === now.getFullYear() ? undefined : "numeric",
		month: "short",
		day: "numeric",
	});
}

/**
 * A floating reaction chip pokes ~12px below the bubble. Used to flag
 * messages whose chip needs extra clearance from the next message.
 */
function hasFloatingReaction(
	message: Doc<"messages">,
	currentUserId: Id<"users"> | undefined,
): boolean {
	const reactions = message.reactions;
	if (!reactions || reactions.length === 0) return false;
	const map = new Map<string, number>();
	for (const r of reactions) {
		map.set(r.emoji, (map.get(r.emoji) ?? 0) + 1);
	}
	// Single emoji with count 1 → renders as a floating chip below the bubble.
	if (map.size !== 1) return false;
	const [, count] = [...map.entries()][0]!;
	void currentUserId; // currentUserId is part of the same logic in MessageBubble; not needed here
	return count === 1;
}

export function MessageList({
	orgId,
	messages,
	authorsById,
	currentUserId,
	canDeleteAny,
	isDirect,
	onReply,
	loadOlder,
	canLoadOlder = false,
	isLoadingOlder = false,
	className,
}: MessageListProps) {
	const viewportRef = useRef<HTMLDivElement>(null);
	const [listEl, setListEl] = useState<HTMLUListElement | null>(null);
	const isPinnedRef = useRef(true);

	// Backend returns newest-first (`.order("desc")`). Display chronologically.
	const ordered = useMemo(() => {
		if (!messages) return undefined;
		return [...messages].reverse();
	}, [messages]);

	// List-level batched attachment lookup. ONE subscription resolves every
	// visible bubble's attachments; the resolved record is then sliced
	// per-bubble below. Replaces the per-bubble `useQuery(listByIds)` that
	// previously fired N subscriptions for one logical read.
	const attachmentFilesById = useMessageAttachmentsForThread({
		orgId,
		messages: ordered,
	});

	// Update the pinned flag whenever the user scrolls.
	useEffect(() => {
		const el = viewportRef.current;
		if (!el) return;
		const handleScroll = () => {
			const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
			isPinnedRef.current = distanceFromBottom < PIN_TO_BOTTOM_THRESHOLD;
		};
		el.addEventListener("scroll", handleScroll, { passive: true });
		return () => el.removeEventListener("scroll", handleScroll);
	}, []);

	// Snap to bottom when the last (newest) message changes — but only if
	// the user is currently pinned. `useLayoutEffect` runs synchronously
	// after the DOM has updated but BEFORE the browser paints, so the user
	// never sees the "top of the new content" frame.
	const lastMessageId = ordered?.[ordered.length - 1]?._id;
	// biome-ignore lint/correctness/useExhaustiveDependencies: lastMessageId is the trigger
	useLayoutEffect(() => {
		const el = viewportRef.current;
		if (!el || !ordered || ordered.length === 0) return;
		if (isPinnedRef.current) {
			el.scrollTop = el.scrollHeight;
		}
	}, [lastMessageId]);

	// ResizeObserver: when the inner <ul> grows (a media element finished
	// loading and reflowed, or a new bubble was added), re-pin to the bottom
	// if the user was already there. This is the WhatsApp-style "stays at
	// the bottom even as images load" behaviour.
	useEffect(() => {
		if (!listEl) return;
		const el = viewportRef.current;
		if (!el) return;
		let pendingFrame: number | null = null;
		const ro = new ResizeObserver(() => {
			if (!isPinnedRef.current) return;
			// Coalesce repeated growth events (multiple media loading at once)
			// into one rAF so we don't fight the browser's paint loop.
			if (pendingFrame !== null) return;
			pendingFrame = requestAnimationFrame(() => {
				pendingFrame = null;
				const v = viewportRef.current;
				if (v && isPinnedRef.current) v.scrollTop = v.scrollHeight;
			});
		});
		ro.observe(listEl);
		return () => {
			if (pendingFrame !== null) cancelAnimationFrame(pendingFrame);
			ro.disconnect();
		};
	}, [listEl]);

	// ─── Cursor pagination ───────────────────────────────────────────────────
	// When `loadOlder` is called, the parent will fetch one more page. The
	// new (older) messages are PREPENDED to `ordered`. Without intervention
	// the browser keeps `scrollTop` constant — so the visual position jumps
	// up by exactly `pageHeight`. We capture `scrollHeight` here and let a
	// `useLayoutEffect` (below) restore the visual position after React commits.
	const prevScrollHeightRef = useRef<number | null>(null);
	const prevTotalRef = useRef<number>(ordered?.length ?? 0);
	const handleRequestOlder = useCallback(() => {
		if (!loadOlder || !canLoadOlder || isLoadingOlder) return;
		const el = viewportRef.current;
		if (el) prevScrollHeightRef.current = el.scrollHeight;
		loadOlder();
	}, [loadOlder, canLoadOlder, isLoadingOlder]);

	// After older messages prepend, restore the user's visual position.
	useLayoutEffect(() => {
		const total = ordered?.length ?? 0;
		const prevTotal = prevTotalRef.current;
		prevTotalRef.current = total;
		if (prevScrollHeightRef.current === null) return;
		// Only run when items were actually prepended (total grew, AND we
		// asked for older).
		if (total <= prevTotal) return;
		const el = viewportRef.current;
		if (!el) {
			prevScrollHeightRef.current = null;
			return;
		}
		const delta = el.scrollHeight - prevScrollHeightRef.current;
		prevScrollHeightRef.current = null;
		if (delta > 0) {
			el.scrollTop += delta;
			// The growth ALSO trips the ResizeObserver — but at this moment
			// `isPinnedRef.current` is false (we're scrolled up to read history),
			// so the observer no-ops. Belt-and-braces: explicitly re-mark.
			const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
			isPinnedRef.current = distanceFromBottom < PIN_TO_BOTTOM_THRESHOLD;
		}
	}, [ordered]);

	// Sentinel auto-load: when the top sentinel is in view AND we can load
	// more, fetch the next older page.
	const sentinelRef = useRef<HTMLLIElement | null>(null);
	useEffect(() => {
		const node = sentinelRef.current;
		if (!node || !canLoadOlder || !loadOlder) return;
		const io = new IntersectionObserver(
			(entries) => {
				if (entries[0]?.isIntersecting && !isLoadingOlder) {
					handleRequestOlder();
				}
			},
			{ root: viewportRef.current, threshold: 0 },
		);
		io.observe(node);
		return () => io.disconnect();
	}, [canLoadOlder, isLoadingOlder, loadOlder, handleRequestOlder]);

	if (!ordered) {
		return (
			<div className={cn("flex flex-1 items-center justify-center p-6", className)}>
				<p className="text-sm text-muted-foreground">Loading messages…</p>
			</div>
		);
	}

	if (ordered.length === 0) {
		return (
			<div className={cn("flex flex-1 items-center justify-center p-6", className)}>
				<p className="text-sm text-muted-foreground">
					No messages yet. Send the first one below.
				</p>
			</div>
		);
	}

	// Walk the ordered array once, splicing in date dividers when day changes.
	// At the same time, mark each message as either a "leader" (showHeader=true)
	// or a "continuation" (showHeader=false) of the run by the same author —
	// continuations hide the avatar AND name, matching WhatsApp / Telegram.
	//
	// 2026-05-17 (batch 5): grouping is now sender-change ONLY. The previous
	// 5-min time window was removed — same-author back-to-back messages are
	// always a continuation, even if hours apart, as long as the day hasn't
	// changed (a date divider naturally restarts the run).
	const renderItems: Array<
		| { kind: "divider"; key: string; label: string }
		| {
				kind: "message";
				key: string;
				message: Doc<"messages">;
				showHeader: boolean;
				prevHasFloatingReaction: boolean;
		  }
	> = [];
	let lastDay: string | null = null;
	let prev: Doc<"messages"> | null = null;
	for (const message of ordered) {
		const k = dayKey(message.createdAt);
		const dayChanged = k !== lastDay;
		if (dayChanged) {
			renderItems.push({
				kind: "divider",
				key: `d:${k}`,
				label: dayLabel(message.createdAt),
			});
			lastDay = k;
		}
		const isContinuation =
			prev !== null &&
			!dayChanged &&
			String(prev.authorId) === String(message.authorId) &&
			prev.authorType === message.authorType;
		const prevHasFloating = prev !== null ? hasFloatingReaction(prev, currentUserId) : false;
		renderItems.push({
			kind: "message",
			key: String(message._id),
			message,
			showHeader: !isContinuation,
			prevHasFloatingReaction: prevHasFloating,
		});
		prev = message;
	}

	return (
		<div ref={viewportRef} className={cn("min-h-0 flex-1 overflow-y-auto", className)}>
			<ul ref={setListEl} className="flex flex-col sm:px-4 py-3">
				{/* Sentinel + "Loading older…" indicator */}
				{canLoadOlder && (
					<li
						ref={sentinelRef}
						className="flex items-center justify-center py-2"
						aria-hidden="true"
					>
						{isLoadingOlder ? (
							<Loader2
								className="size-4 animate-spin text-muted-foreground"
								aria-hidden="true"
							/>
						) : (
							<span className="h-px w-full" />
						)}
					</li>
				)}
				{renderItems.map((item) => {
					if (item.kind === "divider") {
						return (
							<li
								key={item.key}
								className="mt-3 flex items-center gap-2 py-1"
								aria-hidden="true"
							>
								<span className="h-px flex-1 bg-border" />
								<span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
									{item.label}
								</span>
								<span className="h-px flex-1 bg-border" />
							</li>
						);
					}
					const message = item.message;
					const author = authorsById.get(String(message.authorId));
					const isByCurrentUser =
						currentUserId !== undefined &&
						String(message.authorId) === String(currentUserId) &&
						message.authorType !== "ai" &&
						message.authorType !== "contact";
					return (
						<MessageBubble
							key={item.key}
							message={message}
							author={author}
							isByCurrentUser={isByCurrentUser}
							currentUserId={currentUserId}
							authorsById={authorsById}
							canDeleteAny={canDeleteAny}
							isDirect={isDirect}
							showHeader={item.showHeader}
							prevHasFloatingReaction={item.prevHasFloatingReaction}
							attachmentFilesById={attachmentFilesById}
							onReply={onReply}
						/>
					);
				})}
			</ul>
		</div>
	);
}
