/**
 * task-type — helpers for the task type chip.
 *
 * Source of truth: schema/crmShared.ts::tasks.type validator. Closed
 * union: "todo" | "call" | "email" | "meeting" | "followup".
 *
 * The `type` field replaces the legacy reminders `source` field. Verbs
 * map cleanly to the 5 types: a "call" task = "ring back", "email" =
 * "email back", "meeting" = "schedule meeting", "followup" = the CRM
 * cadence type that carries the `tasks.followup`-flavoured defaults.
 */

import {
	BellIcon,
	CalendarClockIcon,
	type LucideIcon,
	MailIcon,
	PhoneIcon,
	UsersIcon,
} from "lucide-react";

export type TaskType = "todo" | "call" | "email" | "meeting" | "followup";

export const TASK_TYPE_VALUES: ReadonlyArray<TaskType> = [
	"todo",
	"call",
	"email",
	"meeting",
	"followup",
] as const;

export const TASK_TYPE_LABEL: Record<TaskType, string> = {
	todo: "To-do",
	call: "Call",
	email: "Email",
	meeting: "Meeting",
	followup: "Follow-up",
};

/** Hex colours — same palette as the priority chip but tuned per type. */
export const TASK_TYPE_COLOR: Record<TaskType, string> = {
	todo: "#64748b", // slate-500 — neutral, generic
	call: "#10b981", // emerald-500 — voice
	email: "#3b82f6", // blue-500 — async written
	meeting: "#a855f7", // purple-500 — multi-party / scheduled
	followup: "#f59e0b", // amber-500 — CRM cadence pressure
};

/** Lucide icons per type — used in chips, columns, dropdowns. */
export const TASK_TYPE_ICON: Record<TaskType, LucideIcon> = {
	todo: BellIcon,
	call: PhoneIcon,
	email: MailIcon,
	meeting: UsersIcon,
	followup: CalendarClockIcon,
};

/** Type guard — narrow an arbitrary string to a known type. */
export function isTaskType(value: unknown): value is TaskType {
	return typeof value === "string" && (TASK_TYPE_VALUES as ReadonlyArray<string>).includes(value);
}

/** Resolve a type value with a fallback to `todo`. */
export function resolveTaskType(value: unknown): TaskType {
	return isTaskType(value) ? value : "todo";
}
