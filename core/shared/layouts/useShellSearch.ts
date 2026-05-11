"use client";

import type { IFuseOptions } from "fuse.js";
import Fuse from "fuse.js";
import { useMemo } from "react";
import type { ShellGroup, ShellSection } from "./types";

/** A search hit enriched with the parent group's label (for "Group ▸ Section" rendering). */
export type ShellSearchHit = ShellSection & {
	groupLabel: string;
};

/**
 * Fuse.js options — weighted so labels match first, keywords second,
 * description third, and the group label last (avoids "Team ▸ Billing" false
 * positives when searching "team").
 *
 * threshold 0.35 catches typos like "apearance" while still ranking sensibly.
 */
const FUSE_OPTIONS: IFuseOptions<ShellSearchHit> = {
	keys: [
		{ name: "label", weight: 0.4 },
		{ name: "keywords", weight: 0.3 },
		{ name: "description", weight: 0.2 },
		{ name: "groupLabel", weight: 0.1 },
	],
	threshold: 0.35,
	ignoreLocation: true,
	minMatchCharLength: 2,
	includeScore: true,
};

/**
 * Filter shell sections to ones the current user can see.
 *
 * Rules:
 *   - If the section is ownerOnly, user must have `org.delete`.
 *   - If the section has a `permission`, user must have it (owners always pass).
 *   - Otherwise the section is visible to anyone who can reach the parent group.
 *
 * Exported so shells can compute their own visible pills without duplicating logic.
 */
export function getVisibleShellSections(
	sections: ShellSection[],
	permissions: string[],
	groupId?: string,
): ShellSection[] {
	const isOwner = permissions.includes("org.delete");
	return sections.filter((s) => {
		if (groupId && s.groupId !== groupId) return false;
		if (s.ownerOnly && !isOwner) return false;
		if (s.permission && !permissions.includes(s.permission) && !isOwner) return false;
		return true;
	});
}

/**
 * Fuzzy-search every visible shell section.
 *
 * 1. Filters sections by the user's permissions.
 * 2. Attaches the group label so results can render "Group ▸ Section".
 * 3. Builds a Fuse instance (memoised per `permissions` + `sections`).
 * 4. Returns up to `limit` hits — or `[]` when the query is blank.
 */
export function useShellSearch(
	query: string,
	groups: ShellGroup[],
	sections: ShellSection[],
	permissions: string[] | undefined,
	limit = 20,
): ShellSearchHit[] {
	const { fuse } = useMemo(() => {
		const groupLabelById = new Map<string, string>(groups.map((g) => [g.id, g.label]));

		const visible = permissions ? getVisibleShellSections(sections, permissions) : [];
		const hits: ShellSearchHit[] = visible.map((s) => ({
			...s,
			groupLabel: groupLabelById.get(s.groupId) ?? s.groupId,
		}));

		return { fuse: new Fuse(hits, FUSE_OPTIONS) };
	}, [groups, sections, permissions]);

	return useMemo(() => {
		const q = query.trim();
		if (!q) return [];
		return fuse.search(q, { limit }).map((r) => r.item);
	}, [fuse, query, limit]);
}

/**
 * Scroll a shell section into view WITHOUT causing the outer dashboard layout
 * (topnav, sidebar, window) to shift.
 *
 * IMPLEMENTATION NOTES — please read before changing:
 *
 * 1. We do NOT call `element.scrollIntoView()`. The spec says it recursively
 *    adjusts every scrollable ancestor until the element is in the root
 *    viewport — which shifts the outer dashboard layout when the shell's inner
 *    <main> is scrolled far down. Global rule: never use scrollIntoView inside
 *    nested-scroll shells.
 *
 * 2. We ALWAYS apply the transient highlight ring, even when the container is
 *    not scrollable (e.g. Appearance has only 2 sub-sections and doesn't
 *    overflow). Previously the function bailed out early when there was no
 *    scroll container, so the card never "blinked" — the user had no visual
 *    confirmation that their pill-click did anything. Now: scroll iff we can,
 *    highlight always.
 *
 * 3. The target scroll container is found by walking up the DOM and picking
 *    the nearest ancestor whose computed overflow-y is auto/scroll/overlay AND
 *    whose scrollHeight exceeds its clientHeight. A div with overflow:auto but
 *    no overflowing content is NOT a scroll target.
 *
 * Reference: `core/settings/hooks/useSettingsSearch.ts` (wraps this helper)
 * and the AGENTS.md global rule banning scrollIntoView inside shells.
 */
export function scrollToShellSection(sectionId: string, headerOffset = 24): void {
	if (typeof document === "undefined") return;
	const el = document.getElementById(sectionId);
	if (!el) return;

	// 1. Scroll only if there is a scrollable ancestor.
	const container = findScrollableAncestor(el);
	if (container) {
		const elRect = el.getBoundingClientRect();
		const containerRect = container.getBoundingClientRect();
		const targetTop = container.scrollTop + (elRect.top - containerRect.top) - headerOffset;
		container.scrollTo({ top: Math.max(0, targetTop), behavior: "smooth" });
	}

	// 2. Highlight ALWAYS — gives a visual affordance even when nothing scrolls.
	el.classList.add("ring-2", "ring-inset", "ring-primary/50", "transition");
	window.setTimeout(() => {
		el.classList.remove("ring-2", "ring-inset", "ring-primary/50");
	}, 1400);
}

/** Walk up the DOM; return the first ancestor that is an actually-scrollable container. */
function findScrollableAncestor(el: HTMLElement): HTMLElement | null {
	let node: HTMLElement | null = el.parentElement;
	while (node && node !== document.body) {
		const style = window.getComputedStyle(node);
		const overflowY = style.overflowY;
		if (overflowY === "auto" || overflowY === "scroll" || overflowY === "overlay") {
			if (node.scrollHeight > node.clientHeight) return node;
		}
		node = node.parentElement;
	}
	return null;
}
