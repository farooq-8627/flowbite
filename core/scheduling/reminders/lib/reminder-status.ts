/**
 * reminder-status — pure helpers that classify a reminder.
 *
 * STATUS: IMPLEMENTED.
 *
 * Why pure helpers
 * ────────────────
 * Every cell renderer (table row, panel card, dashboard widget) needs the
 * same "is this overdue / today / upcoming / completed?" decision. We
 * implement it ONCE here, in pure form, so:
 *   - components don't recompute it (memoization at the row/cell level
 *     is trivial when the input is a primitive `now`),
 *   - the rule is testable without React,
 *   - the calendar grid + the reminders list agree on what "overdue"
 *     means even though they read very different shapes.
 *
 * The helpers take `now: number` explicitly (defaulting to `Date.now()`)
 * so tests can pin the clock and DST-boundary tests get a fixed instant
 * to compare against.
 */

import { isSameDay } from "date-fns";

/** A minimal shape — anything with a dueAt number + a string status fits. */
export type ReminderLike = {
	dueAt: number;
	status: string; // "pending" | "completed"
	completedAt?: number;
};

/** Visible state on the UI. Drives badge colour and bucket placement. */
export type ReminderState = "overdue" | "today" | "upcoming" | "completed";

/**
 * Derive a reminder's UI state.
 *
 * Rules:
 *   - `status === "completed"` → always `"completed"` (regardless of dueAt).
 *   - `dueAt < now` AND not completed → `"overdue"`.
 *   - `dueAt` is on the same calendar day as `now` → `"today"`.
 *   - everything else → `"upcoming"`.
 *
 * "Same calendar day" uses date-fns `isSameDay`, which respects the host's
 * local timezone. This matches what the user sees on the wall clock — a
 * reminder at 23:55 today and a reminder at 00:05 tomorrow are placed in
 * different buckets even though they're 10 minutes apart, because the
 * user's mental model is calendar-day, not 24h-window.
 */
export function getReminderState(reminder: ReminderLike, now: number = Date.now()): ReminderState {
	if (reminder.status === "completed") return "completed";
	if (reminder.dueAt < now) return "overdue";
	if (isSameDay(reminder.dueAt, now)) return "today";
	return "upcoming";
}

/**
 * Stable label for a reminder state. Source of truth for buttons / badge
 * tooltips / aria-labels. We don't go through i18n here — the strings are
 * short and the few callers that surface them in user copy will go through
 * `next-intl` themselves.
 */
export const REMINDER_STATE_LABEL: Record<ReminderState, string> = {
	overdue: "Overdue",
	today: "Due today",
	upcoming: "Upcoming",
	completed: "Completed",
};

/**
 * Hex colour for each state — matches the calendar event-source palette
 * (orange = reminders / overdue, amber = today, blue = upcoming, green =
 * completed). Components prefer Tailwind classes for the badge surface;
 * these hex values are reserved for inline `style={{}}` cases (calendar
 * dot indicators, mini-cal heatmap, etc.) where Tailwind is awkward.
 */
export const REMINDER_STATE_COLOR: Record<ReminderState, string> = {
	overdue: "#dc2626", // red-600
	today: "#f59e0b", // amber-500
	upcoming: "#3b82f6", // blue-500
	completed: "#10b981", // emerald-500
};
