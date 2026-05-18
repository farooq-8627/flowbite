"use client";

/**
 * useCalendarViewMode — UI state for the calendar.
 *
 * STATUS: IMPLEMENTED.
 *
 * Per AGENTS.md "zustand = UI state only" + the SCHEDULING-IMPLEMENTATION
 * plan §6:
 *   - `viewMode` ("month"/"week"/"day"/"list")  → URL param `cal` (was `view`)
 *   - `selectedDate`                              → in-memory state (no URL persistence)
 *   - `sources` (3 source filters)                → URL param `sources`
 *
 * URL persistence uses `nuqs` so deep-linking works ("share me your view
 * of next Tuesday's events"). `selectedDate` deliberately resets to today
 * on page-load — sharing a link to a specific past date isn't a real use
 * case and we'd rather keep the user oriented to the present.
 *
 * The hook intentionally does NOT subscribe to anything Convex — it only
 * holds UI knobs. The data fetch lives in `useCalendarEvents` and is
 * called by `<CalendarView>` once.
 *
 * URL key choice: `cal` (NOT `view`)
 * ──────────────────────────────────
 * Originally this hook used `view` as its URL key. That collided with
 * `RemindersView`, which ALSO uses `view` to switch between its three
 * top-level modes (today / list / calendar). The bug surfaced as: open
 * `?view=calendar`, click "Week" inside the calendar's internal toolbar,
 * the URL became `?view=week` — RemindersView then saw `view=week` and
 * fell back to its default `list` mode, leaving the calendar grid blank.
 *
 * Renamed to `cal` so the two URL contracts never overlap. Same for
 * `sources` → kept as-is, no collision.
 */

import { parseAsArrayOf, parseAsStringLiteral, useQueryState } from "nuqs";
import { useCallback, useMemo, useState } from "react";
import type { CalendarViewMode } from "../lib/calendar-grid";
import { type CalendarEventSource, EVENT_SOURCE_ORDER } from "../lib/event-source-colors";

const VIEW_VALUES = ["month", "week", "day", "list"] as const;

export function useCalendarViewMode() {
	const [viewMode, setViewMode] = useQueryState(
		"cal",
		parseAsStringLiteral(VIEW_VALUES)
			.withDefault("month")
			.withOptions({ clearOnDefault: true, history: "replace" }),
	);

	const [selectedDate, setSelectedDate] = useState<Date>(() => new Date());

	const today = useCallback(() => setSelectedDate(new Date()), []);

	return {
		viewMode: viewMode as CalendarViewMode,
		setViewMode: (v: CalendarViewMode) => void setViewMode(v),
		selectedDate,
		setSelectedDate,
		today,
	};
}

const SOURCE_VALUES = EVENT_SOURCE_ORDER as ReadonlyArray<CalendarEventSource>;

/**
 * Source filters — the three checkboxes in the sidebar / filters
 * popover. Default = all three on. Persists to `?sources=`.
 *
 * Kept separate from `useCalendarViewMode` so consumers that only need
 * the view mode don't pull in a second URL param subscription.
 */
export function useCalendarFilters() {
	const [activeSources, setActiveSources] = useQueryState(
		"sources",
		parseAsArrayOf(parseAsStringLiteral(SOURCE_VALUES))
			.withDefault([...SOURCE_VALUES])
			.withOptions({ history: "replace" }),
	);

	const isActive = useCallback(
		(s: CalendarEventSource) => activeSources?.includes(s) ?? true,
		[activeSources],
	);

	const toggle = useCallback(
		(s: CalendarEventSource) => {
			void setActiveSources((prev) => {
				const current = (prev ?? [...SOURCE_VALUES]) as CalendarEventSource[];
				return current.includes(s) ? current.filter((x) => x !== s) : [...current, s];
			});
		},
		[setActiveSources],
	);

	const setAll = useCallback(
		(values: CalendarEventSource[]) => void setActiveSources(values),
		[setActiveSources],
	);

	const stable = useMemo<CalendarEventSource[]>(
		() => (activeSources ? [...activeSources] : [...SOURCE_VALUES]),
		[activeSources],
	);

	return { sources: stable, isActive, toggle, setAll };
}
