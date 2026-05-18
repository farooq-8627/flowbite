/**
 * reminder-buckets — partition a list of reminders by visible state.
 *
 * STATUS: IMPLEMENTED.
 *
 * Used by:
 *   - `RemindersPanel` (entity tab) to render an "Overdue" + "Today" +
 *     "Upcoming" + "Completed" stack.
 *   - `DueTodayWidget` to take only the "today" + "overdue" subsets.
 *   - The reminders DataTable — it sorts within each bucket so the most
 *     urgent items float to the top.
 *
 * Buckets are returned with stable keys regardless of input — empty
 * buckets exist as `[]`, so callers can iterate in a fixed order without
 * defensive checks.
 */

import { getReminderState, type ReminderLike, type ReminderState } from "./reminder-status";

export type ReminderBuckets<T extends ReminderLike> = Record<ReminderState, T[]>;

/**
 * Partition `reminders` into 4 buckets by visible state, then sort each
 * bucket so the most relevant items come first:
 *   - overdue   → most overdue first (oldest dueAt first)
 *   - today     → earliest time first (smallest dueAt first)
 *   - upcoming  → soonest first (smallest dueAt first)
 *   - completed → most recently completed first (largest completedAt first)
 *
 * Pass `now` to pin the clock for tests (defaults to `Date.now()`).
 */
export function bucketByDue<T extends ReminderLike>(
	reminders: ReadonlyArray<T>,
	now: number = Date.now(),
): ReminderBuckets<T> {
	const buckets: ReminderBuckets<T> = {
		overdue: [],
		today: [],
		upcoming: [],
		completed: [],
	};
	for (const r of reminders) {
		const state = getReminderState(r, now);
		buckets[state].push(r);
	}
	buckets.overdue.sort((a, b) => a.dueAt - b.dueAt);
	buckets.today.sort((a, b) => a.dueAt - b.dueAt);
	buckets.upcoming.sort((a, b) => a.dueAt - b.dueAt);
	buckets.completed.sort((a, b) => (b.completedAt ?? 0) - (a.completedAt ?? 0));
	return buckets;
}

/**
 * Stable iteration order — used by panels / widgets / view-options
 * builders so every consumer agrees on which bucket comes first.
 */
export const REMINDER_BUCKET_ORDER: ReadonlyArray<ReminderState> = [
	"overdue",
	"today",
	"upcoming",
	"completed",
] as const;

/** Convenience: total count across all 4 buckets. */
export function totalCount<T extends ReminderLike>(buckets: ReminderBuckets<T>): number {
	return (
		buckets.overdue.length +
		buckets.today.length +
		buckets.upcoming.length +
		buckets.completed.length
	);
}

/**
 * Convenience: count of "open" (not-completed) reminders. This is the
 * number we show on every entity tab badge ("Reminders 3" = 3 open).
 */
export function openCount<T extends ReminderLike>(buckets: ReminderBuckets<T>): number {
	return buckets.overdue.length + buckets.today.length + buckets.upcoming.length;
}
