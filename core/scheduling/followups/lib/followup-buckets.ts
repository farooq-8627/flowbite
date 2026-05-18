/**
 * followup-buckets — partition follow-ups into Pipedrive-style buckets.
 *
 * STATUS: IMPLEMENTED.
 *
 * Why a different shape from `reminder-buckets`
 * ─────────────────────────────────────────────
 * The reminders surface buckets by visible state (`overdue` / `today`
 * / `upcoming` / `completed`) — fine for an operational queue.
 *
 * The follow-ups surface is a sales cadence view. Pipedrive, HubSpot,
 * Close.com all use a 5-bucket layout:
 *   - Overdue
 *   - Today
 *   - This week (excluding today)
 *   - Later
 *   - Completed (collapsed by default)
 *
 * "Later" is the long tail — anything past this Sunday. Splitting "this
 * week" from "later" gives the user a much better at-a-glance view of
 * their immediate cadence pressure.
 *
 * Buckets are returned with stable keys so callers iterate in fixed
 * order regardless of which buckets are empty.
 */

import { endOfWeek, isSameDay } from "date-fns";

export type FollowupBucket = "overdue" | "today" | "thisWeek" | "later" | "completed";

export type FollowupLike = {
	dueAt: number;
	status: string; // "pending" | "completed"
	completedAt?: number;
};

export type FollowupBuckets<T extends FollowupLike> = Record<FollowupBucket, T[]>;

/**
 * Stable iteration order for the panels / page layout.
 *
 * Completed is last so the user lands on the active queue first.
 */
export const FOLLOWUP_BUCKET_ORDER: ReadonlyArray<FollowupBucket> = [
	"overdue",
	"today",
	"thisWeek",
	"later",
	"completed",
] as const;

export const FOLLOWUP_BUCKET_LABEL: Record<FollowupBucket, string> = {
	overdue: "Overdue",
	today: "Today",
	thisWeek: "This week",
	later: "Later",
	completed: "Completed",
};

/**
 * Hex colour per bucket — used for the chip swatch in the FollowUpCard
 * priority/bucket indicator and for the bucket-section header.
 *
 * Aligned with `reminder-status::REMINDER_STATE_COLOR` so the same
 * colour means the same urgency across both surfaces.
 */
export const FOLLOWUP_BUCKET_COLOR: Record<FollowupBucket, string> = {
	overdue: "#dc2626", // red-600
	today: "#f59e0b", // amber-500
	thisWeek: "#3b82f6", // blue-500
	later: "#94a3b8", // slate-400
	completed: "#10b981", // emerald-500
};

/**
 * Partition `followups` into the 5 Pipedrive-style buckets, then sort
 * each bucket so the most urgent items come first.
 *
 *   - overdue   → most overdue first (oldest dueAt first)
 *   - today     → earliest time first
 *   - thisWeek  → soonest first
 *   - later     → soonest first
 *   - completed → most recently completed first (largest completedAt first)
 *
 * Pass `now` to pin the clock for tests (defaults to `Date.now()`).
 *
 * Week boundary: the host's locale `endOfWeek(now)`. Date-fns defaults
 * to Sunday-end which matches both US + EU "this week" expectations
 * for follow-up cadence.
 */
export function bucketFollowups<T extends FollowupLike>(
	followups: ReadonlyArray<T>,
	now: number = Date.now(),
): FollowupBuckets<T> {
	const buckets: FollowupBuckets<T> = {
		overdue: [],
		today: [],
		thisWeek: [],
		later: [],
		completed: [],
	};
	const weekEnd = endOfWeek(now).getTime();
	for (const f of followups) {
		if (f.status === "completed") {
			buckets.completed.push(f);
			continue;
		}
		if (f.dueAt < now && !isSameDay(f.dueAt, now)) {
			buckets.overdue.push(f);
			continue;
		}
		if (isSameDay(f.dueAt, now)) {
			buckets.today.push(f);
			continue;
		}
		if (f.dueAt <= weekEnd) {
			buckets.thisWeek.push(f);
			continue;
		}
		buckets.later.push(f);
	}
	buckets.overdue.sort((a, b) => a.dueAt - b.dueAt);
	buckets.today.sort((a, b) => a.dueAt - b.dueAt);
	buckets.thisWeek.sort((a, b) => a.dueAt - b.dueAt);
	buckets.later.sort((a, b) => a.dueAt - b.dueAt);
	buckets.completed.sort((a, b) => (b.completedAt ?? 0) - (a.completedAt ?? 0));
	return buckets;
}

/** Total open follow-ups (everything except `completed`). */
export function openFollowupCount<T extends FollowupLike>(buckets: FollowupBuckets<T>): number {
	return (
		buckets.overdue.length +
		buckets.today.length +
		buckets.thisWeek.length +
		buckets.later.length
	);
}

/** Total across all buckets. */
export function totalFollowupCount<T extends FollowupLike>(buckets: FollowupBuckets<T>): number {
	return openFollowupCount(buckets) + buckets.completed.length;
}
