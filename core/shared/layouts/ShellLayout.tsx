"use client";

import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { AppSheet } from "@/components/ui/app-sheet";
import { useNavSlot } from "@/core/shell/context/nav-slot-context";
import { SearchFilterProvider } from "./search-filter-context";
import { ShellNav } from "./ShellNav";
import { ShellToolbar } from "./ShellToolbar";
import { useActiveShellGroup } from "./useActiveShellGroup";
import {
	getVisibleShellSections,
	scrollToShellSection,
	useShellSearch,
} from "./useShellSearch";
import type { ShellGroup, ShellSection } from "./types";

type ShellLayoutProps = {
	/** Title shown in the mobile sheet's sr-only label and sheet header. */
	title: string;
	/** Top-level navigation groups — rendered in the left rail. */
	groups: ShellGroup[];
	/** Sections under every group — used for toolbar pills + Fuse search index. */
	sections: ShellSection[];
	/** The current user's permissions. `undefined` while loading. */
	permissions: string[] | undefined;
	/** Fallback group id when the URL doesn't specify one. */
	defaultGroupId: string;
	/**
	 * Render function for a group's content.
	 * Called once with the active group in normal mode, or once per matching
	 * group (in order of first search hit) in search mode.
	 */
	renderGroup: (groupId: string) => ReactNode;
	/** Placeholder for the search input. */
	searchPlaceholder?: string;
	/** Accessible label for the search input. */
	searchAriaLabel?: string;
	/**
	 * Must be true before the layout will render. Keeps SSR hydration clean
	 * when the parent is still fetching org data.
	 */
	isReady?: boolean;
	/** Rendered when `isReady` is false. Defaults to null (blank). */
	loadingState?: ReactNode;
	/** Rendered when the org/data failed to resolve. Defaults to null. */
	notFoundState?: ReactNode;
};

/**
 * ShellLayout — the reusable "left-rail + topnav-pills + scrollable content"
 * chrome used by /settings and /profile/[personCode].
 *
 * Responsibilities:
 *   1. Render the left rail (desktop) and a mobile sheet trigger (< xl).
 *   2. Permission-filter groups based on `permissions`.
 *   3. Track active group in the URL (`?group=`) via `useActiveShellGroup`.
 *   4. Derive section pills for the active group + drive scrollspy.
 *   5. Inject a toolbar into the topnav slot on xl+, render it inline on < xl.
 *   6. Full-text search (Fuse.js) over every visible section; in search mode
 *      the content area shows all matching groups stacked vertically and
 *      hides non-matching sections via `SearchFilterProvider`.
 *   7. When the user picks a pill, scroll the inner `<main>` WITHOUT shifting
 *      the outer dashboard (see `scrollToShellSection`). When the user changes
 *      groups, reset the inner `<main>` scroll to top.
 *
 * What it does NOT do:
 *   - Fetch any data. The consumer is responsible for its own queries and
 *     passes `permissions` + `isReady` down. Keeps this layout agnostic to
 *     whichever page is using it.
 *   - Render the section cards themselves. The consumer's `renderGroup` does
 *     that, wrapped automatically in a `SearchFilterProvider` when searching.
 *
 * UI is identical to the previous inline SettingsView layout — this is a pure
 * extraction.
 */
export function ShellLayout({
	title,
	groups,
	sections,
	permissions,
	defaultGroupId,
	renderGroup,
	searchPlaceholder,
	searchAriaLabel,
	isReady = true,
	loadingState = null,
	notFoundState = null,
}: ShellLayoutProps) {
	const { activeGroup, setActiveGroup } = useActiveShellGroup<string>(defaultGroupId);
	const [activeSectionId, setActiveSectionId] = useState<string | null>(null);
	const [sheetOpen, setSheetOpen] = useState(false);
	const [query, setQuery] = useState("");
	const { setSlot, clearSlot } = useNavSlot();

	const isSearching = query.trim().length > 0;

	// ── Permission-filter visible groups ─────────────────────────────────────
	const visibleGroups = useMemo(() => {
		if (!permissions) return [];
		return groups.filter((g) => {
			if (g.ownerOnly) return permissions.includes("org.delete");
			if (g.permission) return permissions.includes(g.permission);
			return true;
		});
	}, [groups, permissions]);

	const resolvedGroupId = visibleGroups.some((g) => g.id === activeGroup)
		? activeGroup
		: (visibleGroups[0]?.id ?? activeGroup);

	// ── Section pills for the active group ──────────────────────────────────
	const sectionsForGroup = useMemo(() => {
		if (!permissions) return [];
		return getVisibleShellSections(sections, permissions, resolvedGroupId);
	}, [sections, permissions, resolvedGroupId]);

	const resolvedSectionId = sectionsForGroup.some((s) => s.id === activeSectionId)
		? activeSectionId
		: (sectionsForGroup[0]?.id ?? null);

	// ── Full-text search ─────────────────────────────────────────────────────
	const hits = useShellSearch(query, groups, sections, permissions);
	const { matchingIds, groupOrder } = useMemo(() => {
		const ids = new Set<string>();
		const seen = new Set<string>();
		const order: string[] = [];
		for (const hit of hits) {
			ids.add(hit.id);
			if (!seen.has(hit.groupId)) {
				seen.add(hit.groupId);
				order.push(hit.groupId);
			}
		}
		return { matchingIds: ids, groupOrder: order };
	}, [hits]);

	// ── Scrollspy — highlight the section currently in the viewport. ─────────
	useEffect(() => {
		if (isSearching || sectionsForGroup.length === 0) return;
		const els = sectionsForGroup
			.map((s) => document.getElementById(s.id))
			.filter((el): el is HTMLElement => el !== null);
		if (els.length === 0) return;

		const observer = new IntersectionObserver(
			(entries) => {
				const visible = entries
					.filter((e) => e.isIntersecting)
					.sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0];
				if (visible) setActiveSectionId(visible.target.id);
			},
			{ rootMargin: "-10% 0px -70% 0px", threshold: 0 },
		);
		for (const el of els) observer.observe(el);
		return () => observer.disconnect();
	}, [sectionsForGroup, isSearching]);

	// ── Keep the URL in sync when visible groups change (first-render fallback).
	useEffect(() => {
		if (resolvedGroupId !== activeGroup) setActiveGroup(resolvedGroupId);
	}, [resolvedGroupId, activeGroup, setActiveGroup]);

	// Stable handlers — wrapped in useCallback so the topnav-slot effect below
	// only re-runs when something *meaningful* changes (not on every render).
	const handlePickSection = useCallback((id: string) => {
		setActiveSectionId(id);
		scrollToShellSection(id);
	}, []);

	const handleGroupChange = useCallback(
		(groupId: string) => {
			setActiveGroup(groupId);
			setActiveSectionId(null);
			setQuery("");
			setSheetOpen(false);
			// Reset scroll on the inner <main> ONLY — never on window, or the outer
			// dashboard layout shifts.
			const mainEl = document.querySelector<HTMLElement>(
				'main[data-shell-scroll="true"]',
			);
			mainEl?.scrollTo({ top: 0, behavior: "auto" });
		},
		[setActiveGroup],
	);

	// ── Inject toolbar into the topnav slot (xl+) ────────────────────────────
	// Includes every prop passed into ShellToolbar so stale closures can't leak.
	// NavSlotProvider stores the slot in a ref and only notifies subscribers, so
	// calling setSlot again is cheap and does not re-render the provider tree.
	useEffect(() => {
		setSlot(
			<ShellToolbar
				sections={sectionsForGroup}
				activeSectionId={resolvedSectionId}
				onPickSection={handlePickSection}
				query={query}
				onQueryChange={setQuery}
				isSearching={isSearching}
				searchPlaceholder={searchPlaceholder}
				searchAriaLabel={searchAriaLabel}
				className="hidden xl:flex w-full"
			/>,
		);
	}, [
		sectionsForGroup,
		resolvedSectionId,
		query,
		isSearching,
		handlePickSection,
		searchPlaceholder,
		searchAriaLabel,
		setSlot,
	]);

	useEffect(() => () => clearSlot(), [clearSlot]);

	if (!isReady) return <>{loadingState}</>;
	if (!permissions) return <>{notFoundState}</>;

	return (
		<div className="flex h-full overflow-hidden">
			<div className="hidden w-52 shrink-0 pe-2 xl:flex">
				<ShellNav
					activeGroupId={resolvedGroupId}
					onGroupChange={handleGroupChange}
					groups={visibleGroups}
				/>
			</div>

			<AppSheet
				open={sheetOpen}
				onOpenChange={setSheetOpen}
				title={title}
				side="left"
				width="16rem"
				className="p-3 pt-4"
			>
				<div className="flex h-11 shrink-0 items-center px-2">
					<span className="text-2xl font-semibold">{title}</span>
				</div>
				<ShellNav
					activeGroupId={resolvedGroupId}
					onGroupChange={handleGroupChange}
					groups={visibleGroups}
				/>
			</AppSheet>

			<div className="flex flex-1 flex-col overflow-hidden">
				<ShellToolbar
					sections={sectionsForGroup}
					activeSectionId={resolvedSectionId}
					onPickSection={handlePickSection}
					onOpenSheet={() => setSheetOpen(true)}
					query={query}
					onQueryChange={setQuery}
					isSearching={isSearching}
					searchPlaceholder={searchPlaceholder}
					searchAriaLabel={searchAriaLabel}
					className="xl:hidden px-3 py-2 flex-wrap"
				/>

				<main
					data-shell-scroll="true"
					data-settings-scroll="true"
					className="flex-1 overflow-y-auto p-4 md:p-6 rounded-[var(--radius)]"
				>
					<div className="max-w-full space-y-6">
						{isSearching ? (
							hits.length === 0 ? (
								<div className="flex flex-col items-center justify-center gap-2 rounded-[var(--radius)] border border-dashed py-16 text-center">
									<p className="text-sm font-medium">
										No results match “{query}”.
									</p>
									<p className="text-xs text-muted-foreground">
										Try a different word, or clear the search to see
										everything.
									</p>
								</div>
							) : (
								<>
									<div className="px-1 text-xs text-muted-foreground">
										{hits.length}{" "}
										{hits.length === 1 ? "result" : "results"} for “
										{query}”
									</div>
									<SearchFilterProvider matchingIds={matchingIds}>
										<div className="space-y-6">
											{groupOrder.map((gid) => (
												<div key={gid}>{renderGroup(gid)}</div>
											))}
										</div>
									</SearchFilterProvider>
								</>
							)
						) : (
							renderGroup(resolvedGroupId)
						)}
					</div>
				</main>
			</div>
		</div>
	);
}
