"use client";

/**
 * TimelineFeed — parent component used by every surface that renders a
 * timeline (org page, profile tab, deal/company tab, dashboard widget).
 *
 * Behavioural contract
 * ────────────────────
 *   1. Subscribes via `usePaginatedTimeline` (cursor-based) — first page
 *      = `pageSize` newest entries.
 *   2. Renders entries oldest → newest top-to-bottom (we reverse the
 *      desc-sorted backend output once at render time).
 *   3. On first paint with data → scroll the inner container to the
 *      bottom so the latest entry is visible.
 *   4. Top sentinel (IntersectionObserver) → when visible AND there's
 *      more to load, calls `loadMore(pageSize)`. Before the new page
 *      lands, capture `scrollHeight`; after React commits, restore
 *      `scrollTop` by the delta so the user's visual position is
 *      preserved (no jump). This is the same pattern MessagesThread
 *      uses for chat history.
 *   5. Composer at the bottom (optional — hidden on `org` scope and
 *      dashboard widgets).
 *   6. Filter chip row at the top (optional).
 *
 * Visible cap
 * ───────────
 * `visibleCap` (default 255) is enforced ONLY on the dashboard widget /
 * other glance surfaces. On the org / profile / entity pages we don't
 * cap — the user explicitly scrolled to load more, and dropping older
 * pages off the top would defeat the pagination.
 *
 * Why scroll-to-bottom on first paint
 * ───────────────────────────────────
 * The user's mental model for an audit feed is "the newest thing is the
 * one I haven't seen yet". Showing the latest entry above the fold
 * matches what people expect from chat surfaces. The same pattern is
 * used by saas-ui's demo timeline and by every chat client.
 */

import { Loader2 } from "lucide-react";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { Id } from "@/convex/_generated/dataModel";
import { useCurrentOrg } from "@/core/shell/shared/hooks/useCurrentOrg";
import { cn } from "@/lib/utils";
import { usePaginatedTimeline, type TimelineScope } from "../hooks";
import { TimelineComposer } from "./TimelineComposer";
import { TimelineEntry } from "./TimelineEntry";
import { TimelineFilters } from "./TimelineFilters";
import {
	entryMatchesFilter,
	type TimelineEntry as TimelineEntryUnion,
	type TimelineFilter,
} from "./types";

interface TimelineFeedProps {
	scope: TimelineScope;
	showComposer?: boolean;
	showFilters?: boolean;
	emptyState?: { title: string; body?: string };
	pageSize?: number;
	visibleCap?: number;
	className?: string;
	composerEntity?: { entityType: string; entityId: string; personCode?: string };
	entryGapPx?: number;
	/** When set the internal filter state is ignored — caller owns the filter. */
	externalFilter?: TimelineFilter;
}

export function TimelineFeed({
	scope,
	showComposer,
	showFilters = true,
	emptyState,
	pageSize = 50,
	visibleCap,
	className,
	composerEntity,
	entryGapPx = 28,
	externalFilter,
}: TimelineFeedProps) {
	const { orgId } = useCurrentOrg();

	const { results, status, loadMore } = usePaginatedTimeline({
		orgId: orgId as Id<"orgs"> | undefined,
		scope,
		initialNumItems: pageSize,
	});

	const [internalFilter, setFilter] = useState<TimelineFilter>("all");
	const filter = externalFilter ?? internalFilter;

	// Reverse desc → asc for natural top-to-bottom reading order, then
	// optionally cap to `visibleCap` from the BOTTOM (we keep the newest).
	const ordered = useMemo<TimelineEntryUnion[]>(() => {
		const arr = (results ?? []).slice().reverse() as TimelineEntryUnion[];
		if (visibleCap && arr.length > visibleCap) {
			return arr.slice(arr.length - visibleCap);
		}
		return arr;
	}, [results, visibleCap]);

	const filtered = useMemo<TimelineEntryUnion[]>(() => {
		if (filter === "all") return ordered;
		return ordered.filter((e) => entryMatchesFilter(e, filter));
	}, [ordered, filter]);

	// Counts per filter — recomputed when entries or filter change.
	const counts = useMemo<Partial<Record<TimelineFilter, number>>>(() => {
		const c: Record<TimelineFilter, number> = {
			all: ordered.length,
			notes: 0,
			reminders: 0,
			activity: 0,
			ai: 0,
			system: 0,
		};
		for (const e of ordered) {
			if (e._entryType === "note") c.notes += 1;
			if (e._entryType === "reminder") c.reminders += 1;
			if (e._entryType === "activity") {
				c.activity += 1;
				if (e.actorType === "ai") c.ai += 1;
				if (e.actorType === "system" || e.actorType === "integration") c.system += 1;
			}
		}
		return c;
	}, [ordered]);

	// ── Scroll behaviour ─────────────────────────────────────────────
	const containerRef = useRef<HTMLDivElement>(null);
	const topSentinelRef = useRef<HTMLDivElement>(null);
	const [hasInitialScroll, setHasInitialScroll] = useState(false);
	const prevHeightRef = useRef<number | null>(null);
	const isLoadingMoreRef = useRef(false);
	// Tracks whether the user has actually scrolled UP from the bottom.
	// Without this, the IntersectionObserver fires on first paint (when the
	// top sentinel is briefly visible before the layout effect scrolls to
	// the bottom), and ALSO fires forever on small containers where the
	// sentinel never leaves the viewport — see commit notes 2026-05-19 PM.
	const userHasScrolledRef = useRef(false);

	// First-paint scroll-to-bottom — fire once when results first arrive.
	// Reset `userHasScrolledRef` here too so a tab-switch remount doesn't
	// inherit a stale "already scrolled" state from a previous mount.
	useLayoutEffect(() => {
		if (hasInitialScroll) return;
		if (!results || results.length === 0) return;
		const el = containerRef.current;
		if (!el) return;
		el.scrollTop = el.scrollHeight;
		userHasScrolledRef.current = false;
		setHasInitialScroll(true);
	}, [results, hasInitialScroll]);

	// Track manual scrolling. The first programmatic scroll-to-bottom above
	// fires a `scroll` event too — but we only flip `userHasScrolledRef` to
	// `true` once the user has scrolled UP from the bottom (scrollTop is
	// noticeably below scrollHeight - clientHeight).
	useEffect(() => {
		const el = containerRef.current;
		if (!el) return;
		function onScroll() {
			if (!el) return;
			const distanceFromBottom =
				el.scrollHeight - (el.scrollTop + el.clientHeight);
			if (distanceFromBottom > 32) {
				userHasScrolledRef.current = true;
			}
		}
		el.addEventListener("scroll", onScroll, { passive: true });
		return () => el.removeEventListener("scroll", onScroll);
	}, []);

	// Capture height before older page prepends.
	// biome-ignore lint/correctness/useExhaustiveDependencies: `results` is the trigger — we don't read it directly, but the effect must re-run when a new page lands so the scrollHeight delta can be applied.
	useLayoutEffect(() => {
		if (!isLoadingMoreRef.current) return;
		const el = containerRef.current;
		if (!el) return;
		// After React commits with new entries on top, restore visual position.
		const before = prevHeightRef.current ?? el.scrollHeight;
		const after = el.scrollHeight;
		const delta = after - before;
		if (delta > 0) {
			el.scrollTop = el.scrollTop + delta;
		}
		isLoadingMoreRef.current = false;
		prevHeightRef.current = null;
	}, [results]);

	const handleLoadMore = useCallback(() => {
		if (status !== "CanLoadMore") return;
		const el = containerRef.current;
		if (!el) return;
		prevHeightRef.current = el.scrollHeight;
		isLoadingMoreRef.current = true;
		loadMore(pageSize);
	}, [status, loadMore, pageSize]);

	// Top-sentinel observer — fire `loadMore` when the user scrolls to top.
	// Gates:
	//   1. `hasInitialScroll` — observer never fires before first-paint
	//      scroll-to-bottom completes (prevents the "loads on every mount"
	//      bug).
	//   2. `userHasScrolledRef.current` — only fire after the user has
	//      manually scrolled up (prevents infinite-load on small containers
	//      where the sentinel never leaves the viewport).
	useEffect(() => {
		const sentinel = topSentinelRef.current;
		const root = containerRef.current;
		if (!sentinel || !root) return;
		if (!hasInitialScroll) return;
		if (status !== "CanLoadMore") return;

		const observer = new IntersectionObserver(
			(entries) => {
				for (const entry of entries) {
					if (entry.isIntersecting && userHasScrolledRef.current) {
						handleLoadMore();
					}
				}
			},
			{ root, rootMargin: "100px 0px 0px 0px", threshold: 0 },
		);
		observer.observe(sentinel);
		return () => observer.disconnect();
	}, [handleLoadMore, status, hasInitialScroll]);

	// ── Render ───────────────────────────────────────────────────────
	const isLoading = status === "LoadingFirstPage";
	const showComposerResolved =
		showComposer ?? (scope.kind !== "org" && Boolean(composerEntity));

	if (isLoading) {
		return (
			<div
				className={cn(
					"flex h-full min-h-[200px] items-center justify-center",
					className,
				)}
			>
				<Loader2 className="size-5 animate-spin text-muted-foreground" />
			</div>
		);
	}

	const isEmpty = filtered.length === 0;

	return (
		<div className={cn("flex h-full min-h-0 flex-col gap-3", className)}>
			{/* Filters — only shown when caller hasn't taken control via externalFilter */}
			{showFilters && !externalFilter && (
				<div className="flex shrink-0 items-center justify-between gap-2 px-1">
					<TimelineFilters value={internalFilter} onChange={setFilter} counts={counts} />
				</div>
			)}

			{/* Scrollable feed */}
			<div
				ref={containerRef}
				data-timeline-scroll="true"
				className="relative flex-1 min-h-0 overflow-y-auto"
			>
				{/* Top-sentinel — invisible, triggers load-more when in view */}
				<div ref={topSentinelRef} aria-hidden className="h-1" />

				{/* Load-more spinner */}
				{status === "LoadingMore" && (
					<div className="flex justify-center py-3">
						<Loader2 className="size-4 animate-spin text-muted-foreground" />
					</div>
				)}

				{isEmpty ? (
					<EmptyState emptyState={emptyState} />
				) : (
					<div className="relative px-2 py-3">
						<ul
							className="flex flex-col"
							style={{ rowGap: `${entryGapPx}px` }}
						>
							{filtered.map((entry, idx) => (
								<li key={entry._id}>
									<TimelineEntry
										entry={entry}
										isLast={idx === filtered.length - 1}
										gapPx={entryGapPx}
									/>
								</li>
							))}
						</ul>
					</div>
				)}
			</div>

			{/* Composer */}
			{showComposerResolved && composerEntity && (
				<div className="shrink-0">
					<TimelineComposer
						entityType={composerEntity.entityType}
						entityId={composerEntity.entityId}
						personCode={composerEntity.personCode}
					/>
				</div>
			)}
		</div>
	);
}

// ─── Empty state ─────────────────────────────────────────────────────────────

function EmptyState({
	emptyState,
}: {
	emptyState?: { title: string; body?: string };
}) {
	const title = emptyState?.title ?? "No activity yet";
	const body =
		emptyState?.body ??
		"Activity, notes, and reminders will appear here as they happen.";
	return (
		<div className="flex h-full min-h-[180px] flex-col items-center justify-center gap-1 px-6 text-center">
			<p className="text-sm font-medium text-foreground">{title}</p>
			<p className="text-xs text-muted-foreground">{body}</p>
		</div>
	);
}
