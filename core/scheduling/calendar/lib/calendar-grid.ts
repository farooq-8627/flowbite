/**
 * calendar-grid — date-fns helpers that produce the cells for the grid.
 *
 * STATUS: IMPLEMENTED.
 *
 * Three pure helpers, one per supported view mode:
 *   - `getMonthGrid(date)` returns the 35 / 42 cells covering one calendar
 *     month, padded with the trailing days of the previous month and the
 *     leading days of the next month so each row is a full week.
 *   - `getWeekDays(date)` returns the 7 days of the week containing `date`.
 *   - `getDayHours(date)` returns 24 ISO timestamps spanning the day.
 *
 * Plus `getRangeForView` produces the `[rangeStart, rangeEnd]` pair the
 * Convex `getEvents` query expects. The grid rendering helpers and the
 * hook driving the Convex subscription share this single source of truth
 * for "what range does this view cover" — so a click on "Next month" can
 * compute both the new cell list AND the new query range from one input.
 *
 * Locale: the week start day comes from `getWeekStartsOn(locale)`. We
 * default to Sunday (US convention) but accept overrides — orgs can wire
 * `Intl.Locale(...).getWeekInfo()` if/when locales are configurable.
 */

import {
	addDays,
	addMonths,
	addWeeks,
	eachDayOfInterval,
	endOfDay,
	endOfMonth,
	endOfWeek,
	format,
	startOfDay,
	startOfMonth,
	startOfWeek,
	subMonths,
	subWeeks,
} from "date-fns";

export type CalendarViewMode = "month" | "week" | "day" | "list";

/** Stable Date-FNS `weekStartsOn` for the world's two big conventions. */
export type WeekStart = 0 | 1 | 2 | 3 | 4 | 5 | 6; // 0 = Sunday, 1 = Monday, …

/**
 * Default week start. Sunday matches the US calendar convention used by
 * the donor template + most CRM users in the US/UAE markets we serve.
 * If org-level locale configuration lands later, swap in the resolved
 * value at the call site.
 */
export const DEFAULT_WEEK_STARTS_ON: WeekStart = 0;

/**
 * Generate the 35 / 42 days needed to render a `month` view. Always
 * starts on the configured `weekStartsOn` and ends on the end of the
 * trailing week.
 */
export function getMonthGrid(date: Date, weekStartsOn: WeekStart = DEFAULT_WEEK_STARTS_ON): Date[] {
	const start = startOfWeek(startOfMonth(date), { weekStartsOn });
	const end = endOfWeek(endOfMonth(date), { weekStartsOn });
	return eachDayOfInterval({ start, end });
}

/** 7 days for the `week` view. */
export function getWeekDays(date: Date, weekStartsOn: WeekStart = DEFAULT_WEEK_STARTS_ON): Date[] {
	const start = startOfWeek(date, { weekStartsOn });
	return Array.from({ length: 7 }, (_, i) => addDays(start, i));
}

/** 24 hours for the `day` view (each as a Date pinned at HH:00). */
export function getDayHours(date: Date): Date[] {
	const start = startOfDay(date);
	return Array.from({ length: 24 }, (_, i) => addDays(start, 0).setHours(i)).map(
		(ts) => new Date(ts),
	);
}

/**
 * Compute the [rangeStart, rangeEnd] window that the calendar query
 * needs to populate the given view.
 *
 *   - month: the entire month-grid extent (so trailing/leading days
 *     get their events too).
 *   - week:  the 7 days of the week.
 *   - day:   the 24 hours of the day.
 *   - list:  ±90 days around the anchor, matching the donor's "list of
 *     upcoming events". The cap matches the embedded-panel rule
 *     (≤ 90 days clamp).
 */
export function getRangeForView(
	mode: CalendarViewMode,
	anchor: Date,
	weekStartsOn: WeekStart = DEFAULT_WEEK_STARTS_ON,
): { rangeStart: number; rangeEnd: number } {
	if (mode === "month") {
		const grid = getMonthGrid(anchor, weekStartsOn);
		return {
			rangeStart: startOfDay(grid[0]!).getTime(),
			rangeEnd: endOfDay(grid[grid.length - 1]!).getTime(),
		};
	}
	if (mode === "week") {
		const start = startOfWeek(anchor, { weekStartsOn });
		const end = endOfWeek(anchor, { weekStartsOn });
		return {
			rangeStart: startOfDay(start).getTime(),
			rangeEnd: endOfDay(end).getTime(),
		};
	}
	if (mode === "day") {
		return {
			rangeStart: startOfDay(anchor).getTime(),
			rangeEnd: endOfDay(anchor).getTime(),
		};
	}
	// list
	return {
		rangeStart: startOfDay(addDays(anchor, -7)).getTime(),
		rangeEnd: endOfDay(addDays(anchor, 90)).getTime(),
	};
}

/** Step the anchor one unit in the chosen direction. */
export function shiftAnchor(
	mode: CalendarViewMode,
	anchor: Date,
	direction: "prev" | "next",
): Date {
	const sign = direction === "next" ? 1 : -1;
	switch (mode) {
		case "month":
			return sign > 0 ? addMonths(anchor, 1) : subMonths(anchor, 1);
		case "week":
			return sign > 0 ? addWeeks(anchor, 1) : subWeeks(anchor, 1);
		case "day":
			return addDays(anchor, sign);
		case "list":
			return sign > 0 ? addMonths(anchor, 1) : subMonths(anchor, 1);
		default:
			return anchor;
	}
}

/**
 * Stable cell key used by `bucketByDay` and the React grid.
 * `yyyy-MM-dd` is timezone-agnostic per the user's wall clock — so a
 * reminder at 23:55 today and a reminder at 00:05 tomorrow live in
 * different keys, matching what the user expects.
 */
export function ymdKey(d: Date | number): string {
	return format(d, "yyyy-MM-dd");
}

/**
 * Pretty title for the toolbar — depends on view mode.
 *   - month → "May 2026"
 *   - week  → "May 11 – 17, 2026"
 *   - day   → "Monday, May 18, 2026"
 *   - list  → "Upcoming events"
 */
export function formatViewTitle(
	mode: CalendarViewMode,
	anchor: Date,
	weekStartsOn: WeekStart = DEFAULT_WEEK_STARTS_ON,
): string {
	switch (mode) {
		case "month":
			return format(anchor, "MMMM yyyy");
		case "week": {
			const start = startOfWeek(anchor, { weekStartsOn });
			const end = endOfWeek(anchor, { weekStartsOn });
			const sameMonth = start.getMonth() === end.getMonth();
			const sameYear = start.getFullYear() === end.getFullYear();
			if (sameMonth && sameYear) {
				return `${format(start, "MMM d")} – ${format(end, "d, yyyy")}`;
			}
			if (sameYear) {
				return `${format(start, "MMM d")} – ${format(end, "MMM d, yyyy")}`;
			}
			return `${format(start, "MMM d, yyyy")} – ${format(end, "MMM d, yyyy")}`;
		}
		case "day":
			return format(anchor, "EEEE, MMMM d, yyyy");
		case "list":
			return "Upcoming events";
	}
}
