/**
 * calendar-buckets — group events by local-day key.
 *
 * STATUS: IMPLEMENTED.
 *
 * Used by `<CalendarMain>` to render a 7×N grid of cells with at most
 * O(events) work — each cell does an O(1) Map lookup.
 *
 * The key is `yyyy-MM-dd` from `ymdKey` (calendar-grid.ts) which respects
 * the user's local timezone. This prevents the "midnight DST shifts the
 * event off the day it actually happens" bug: an event at 11:30 PM local
 * stays in the day the user sees on the wall clock, even on the spring
 * forward day where the day technically starts at 1 AM UTC.
 */

import type { CalendarEventDTO } from "@/convex/crm/shared/calendar/queries";
import { ymdKey } from "./calendar-grid";

/** Map<YMD, EventDTO[]> with a stable sort within each bucket (ascending start). */
export function bucketByDay(
	events: ReadonlyArray<CalendarEventDTO>,
): Map<string, CalendarEventDTO[]> {
	const map = new Map<string, CalendarEventDTO[]>();
	for (const e of events) {
		const key = ymdKey(e.startsAt);
		const existing = map.get(key);
		if (existing) existing.push(e);
		else map.set(key, [e]);
	}
	for (const list of map.values()) {
		list.sort((a, b) => a.startsAt - b.startsAt);
	}
	return map;
}

/**
 * Return events occurring on `date` (local YMD) — convenience wrapper used
 * by the day view + the popover when the user clicks a single cell.
 */
export function eventsForDay(
	events: ReadonlyArray<CalendarEventDTO>,
	date: Date,
): CalendarEventDTO[] {
	const key = ymdKey(date);
	return events.filter((e) => ymdKey(e.startsAt) === key).sort((a, b) => a.startsAt - b.startsAt);
}
