/**
 * task-buckets — partition tasks by visible state.
 *
 * Used by:
 *   - `TasksPanel` — entity profile / deal / company tabs render
 *     "Overdue / Today / Upcoming / Completed" stack.
 *   - `DueTodayWidget` / `MyOverdueWidget` — slice into "today + overdue".
 *   - `useTaskColumns` — sorts within each bucket so the most urgent
 *     items float to the top.
 *
 * Buckets are returned with stable keys regardless of input — empty
 * buckets exist as `[]`, so callers can iterate in a fixed order without
 * defensive checks.
 */

import { endOfWeek, isSameDay } from "date-fns";
import { getTaskState, type TaskLike, type TaskState } from "./task-status";

export type TaskBuckets<T extends TaskLike> = Record<TaskState, T[]>;

/** Stable iteration order — used by panels / widgets / view-options builders. */
export const TASK_BUCKET_ORDER: ReadonlyArray<TaskState> = [
	"overdue",
	"today",
	"upcoming",
	"completed",
] as const;

/**
 * Partition `tasks` into 4 buckets by visible state, then sort each
 * bucket so the most relevant items come first:
 *   - overdue   → most overdue first (oldest dueAt first)
 *   - today     → earliest time first (smallest dueAt first)
 *   - upcoming  → soonest first (smallest dueAt first)
 *   - completed → most recently completed first (largest completedAt first)
 */
export function bucketTasksByDue<T extends TaskLike>(
	tasks: ReadonlyArray<T>,
	now: number = Date.now(),
): TaskBuckets<T> {
	const buckets: TaskBuckets<T> = {
		overdue: [],
		today: [],
		upcoming: [],
		completed: [],
	};
	for (const t of tasks) {
		const state = getTaskState(t, now);
		buckets[state].push(t);
	}
	buckets.overdue.sort((a, b) => a.dueAt - b.dueAt);
	buckets.today.sort((a, b) => a.dueAt - b.dueAt);
	buckets.upcoming.sort((a, b) => a.dueAt - b.dueAt);
	buckets.completed.sort((a, b) => (b.completedAt ?? 0) - (a.completedAt ?? 0));
	return buckets;
}

/** Total count across all 4 buckets. */
export function totalCount<T extends TaskLike>(buckets: TaskBuckets<T>): number {
	return (
		buckets.overdue.length +
		buckets.today.length +
		buckets.upcoming.length +
		buckets.completed.length
	);
}

/**
 * Count of "open" (not-completed) tasks. This is the number we show on
 * every entity tab badge ("Tasks 3" = 3 open).
 */
export function openCount<T extends TaskLike>(buckets: TaskBuckets<T>): number {
	return buckets.overdue.length + buckets.today.length + buckets.upcoming.length;
}

// ─── Cadence buckets (Pipedrive-style 5-bucket layout) ───────────────────────
//
// The legacy Follow-ups surface used a 5-bucket cadence layout
// (Overdue / Today / This week / Later / Completed). With the rename to
// `tasks`, the cadence semantics are preserved for callers that opt in
// via `bucketTasksCadence(tasks)` — used by the Tasks side-panel when the
// underlying type slice is "followup" or by the org-wide "cadence" view.

export type TaskCadenceBucket = "overdue" | "today" | "thisWeek" | "later" | "completed";

export type TaskCadenceBuckets<T extends TaskLike> = Record<TaskCadenceBucket, T[]>;

/** Stable iteration order for cadence buckets. */
export const TASK_CADENCE_BUCKET_ORDER: ReadonlyArray<TaskCadenceBucket> = [
	"overdue",
	"today",
	"thisWeek",
	"later",
	"completed",
] as const;

export const TASK_CADENCE_BUCKET_LABEL: Record<TaskCadenceBucket, string> = {
	overdue: "Overdue",
	today: "Today",
	thisWeek: "This week",
	later: "Later",
	completed: "Completed",
};

export const TASK_CADENCE_BUCKET_COLOR: Record<TaskCadenceBucket, string> = {
	overdue: "#dc2626", // red-600
	today: "#f59e0b", // amber-500
	thisWeek: "#3b82f6", // blue-500
	later: "#94a3b8", // slate-400
	completed: "#10b981", // emerald-500
};

/**
 * Partition tasks into the 5 Pipedrive-style cadence buckets and sort
 * each bucket. Used when the consumer wants the explicit "this week / later"
 * split.
 */
export function bucketTasksCadence<T extends TaskLike>(
	tasks: ReadonlyArray<T>,
	now: number = Date.now(),
): TaskCadenceBuckets<T> {
	const buckets: TaskCadenceBuckets<T> = {
		overdue: [],
		today: [],
		thisWeek: [],
		later: [],
		completed: [],
	};
	const weekEnd = endOfWeek(now).getTime();
	for (const t of tasks) {
		if (t.status === "completed") {
			buckets.completed.push(t);
			continue;
		}
		if (t.dueAt < now && !isSameDay(t.dueAt, now)) {
			buckets.overdue.push(t);
			continue;
		}
		if (isSameDay(t.dueAt, now)) {
			buckets.today.push(t);
			continue;
		}
		if (t.dueAt <= weekEnd) {
			buckets.thisWeek.push(t);
			continue;
		}
		buckets.later.push(t);
	}
	buckets.overdue.sort((a, b) => a.dueAt - b.dueAt);
	buckets.today.sort((a, b) => a.dueAt - b.dueAt);
	buckets.thisWeek.sort((a, b) => a.dueAt - b.dueAt);
	buckets.later.sort((a, b) => a.dueAt - b.dueAt);
	buckets.completed.sort((a, b) => (b.completedAt ?? 0) - (a.completedAt ?? 0));
	return buckets;
}

/** Total open (non-completed) cadence-bucket count. */
export function openCadenceCount<T extends TaskLike>(buckets: TaskCadenceBuckets<T>): number {
	return (
		buckets.overdue.length +
		buckets.today.length +
		buckets.thisWeek.length +
		buckets.later.length
	);
}
