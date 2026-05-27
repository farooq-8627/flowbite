/**
 * task-status — pure helpers that classify a task by its visible state.
 *
 * Tasks are the canonical scheduling row (replaces reminders + followups
 * per TASKS-RENAME-PLAN.md). The state semantics (overdue / today /
 * upcoming / completed) are unchanged from the legacy reminders surface,
 * but every helper is rewritten to read `Doc<"tasks">` shape.
 */

import { isSameDay } from "date-fns";

/** A minimal shape — anything with a dueAt number + a string status fits. */
export type TaskLike = {
	dueAt: number;
	status: string; // "pending" | "completed"
	completedAt?: number;
};

/** Visible state on the UI. Drives badge colour and bucket placement. */
export type TaskState = "overdue" | "today" | "upcoming" | "completed";

/**
 * Derive a task's UI state.
 *
 * Rules:
 *   - `status === "completed"` → always `"completed"` (regardless of dueAt).
 *   - `dueAt < now` AND not completed → `"overdue"`.
 *   - `dueAt` is on the same calendar day as `now` → `"today"`.
 *   - everything else → `"upcoming"`.
 *
 * "Same calendar day" uses date-fns `isSameDay`, which respects the host's
 * local timezone — matches the user's wall-clock mental model.
 */
export function getTaskState(task: TaskLike, now: number = Date.now()): TaskState {
	if (task.status === "completed") return "completed";
	if (task.dueAt < now) return "overdue";
	if (isSameDay(task.dueAt, now)) return "today";
	return "upcoming";
}

/** Source of truth for state labels. */
export const TASK_STATE_LABEL: Record<TaskState, string> = {
	overdue: "Overdue",
	today: "Due today",
	upcoming: "Upcoming",
	completed: "Completed",
};

/**
 * Hex colours per state — matches the calendar event-source palette so
 * the same colour means the same urgency across every surface.
 */
export const TASK_STATE_COLOR: Record<TaskState, string> = {
	overdue: "#dc2626", // red-600
	today: "#f59e0b", // amber-500
	upcoming: "#3b82f6", // blue-500
	completed: "#10b981", // emerald-500
};
