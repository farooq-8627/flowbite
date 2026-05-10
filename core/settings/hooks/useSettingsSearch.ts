"use client";

import { useMemo } from "react";
import Fuse from "fuse.js";
import type { IFuseOptions } from "fuse.js";
import {
	SETTINGS_SECTIONS,
	getVisibleSections,
	type SettingsSectionEntry,
} from "../config/settings-sections";
import { SETTINGS_GROUPS, type SettingsGroup } from "../config/settings-nav";

/** A section entry enriched with group label so search results can show a breadcrumb. */
export type SettingsSearchHit = SettingsSectionEntry & {
	groupLabel: string;
};

/** Fuse.js options — weighted so labels match first, then keywords, then description. */
const FUSE_OPTIONS: IFuseOptions<SettingsSearchHit> = {
	keys: [
		{ name: "label",        weight: 0.40 },
		{ name: "keywords",     weight: 0.30 },
		{ name: "description",  weight: 0.20 },
		{ name: "groupLabel",   weight: 0.10 },
	],
	// Lower = stricter. 0.35 catches typos like "apearance" but still ranks sensibly.
	threshold: 0.35,
	ignoreLocation: true,
	minMatchCharLength: 2,
	includeScore: true,
};

/**
 * Fuzzy-search every visible settings section.
 *
 * The hook:
 *   1. Filters SETTINGS_SECTIONS by the user's permissions.
 *   2. Attaches the group label so results can render "Group ▸ Section".
 *   3. Builds a Fuse instance (memoised per `permissions`).
 *   4. On query, returns up to `limit` hits — or the full enriched list when the query is blank.
 */
export function useSettingsSearch(query: string, permissions: string[] | undefined, limit = 20) {
	const { fuse, allHits } = useMemo(() => {
		const groupLabelById = new Map<string, string>(
			SETTINGS_GROUPS.map((g: SettingsGroup) => [g.id, g.label]),
		);

		const visible = permissions ? getVisibleSections(permissions) : [];
		const hits: SettingsSearchHit[] = visible.map((s) => ({
			...s,
			groupLabel: groupLabelById.get(s.groupId) ?? s.groupId,
		}));

		return {
			fuse: new Fuse(hits, FUSE_OPTIONS),
			allHits: hits,
		};
	}, [permissions]);

	return useMemo(() => {
		const q = query.trim();
		if (!q) return [];
		return fuse.search(q, { limit }).map((r) => r.item);
	}, [fuse, query, limit]);
}

/** Helper for downstream components: jump to a settings section by id. */
export function scrollToSection(sectionId: string) {
	if (typeof document === "undefined") return;
	const el = document.getElementById(sectionId);
	if (!el) return;
	el.scrollIntoView({ behavior: "smooth", block: "start" });
	// Inset ring + brief background tint — renders inside the card so there's
	// no clipping risk from overflow or neighboring cards.
	el.classList.add("ring-2", "ring-inset", "ring-primary/50", "transition");
	window.setTimeout(() => {
		el.classList.remove("ring-2", "ring-inset", "ring-primary/50");
	}, 1400);
}
