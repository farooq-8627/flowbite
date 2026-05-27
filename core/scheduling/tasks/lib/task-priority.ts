/**
 * task-priority — helpers for the priority chip on tasks.
 *
 * Source of truth: schema/crmShared.ts::tasks.priority validator. Closed
 * union: "low" | "normal" | "high" | "urgent".
 */

export type TaskPriority = "low" | "normal" | "high" | "urgent";

export const TASK_PRIORITY_VALUES: ReadonlyArray<TaskPriority> = [
	"low",
	"normal",
	"high",
	"urgent",
] as const;

export const TASK_PRIORITY_LABEL: Record<TaskPriority, string> = {
	low: "Low",
	normal: "Normal",
	high: "High",
	urgent: "Urgent",
};

/** Hex colour per priority — used inline for chip + dot indicators. */
export const TASK_PRIORITY_COLOR: Record<TaskPriority, string> = {
	low: "#94a3b8", // slate-400
	normal: "#3b82f6", // blue-500
	high: "#f59e0b", // amber-500
	urgent: "#dc2626", // red-600
};

/** Sort weight — higher renders first when sorting by priority. */
export const TASK_PRIORITY_WEIGHT: Record<TaskPriority, number> = {
	urgent: 4,
	high: 3,
	normal: 2,
	low: 1,
};

/** Type guard — narrow an arbitrary string to a known priority. */
export function isTaskPriority(value: unknown): value is TaskPriority {
	return (
		typeof value === "string" && (TASK_PRIORITY_VALUES as ReadonlyArray<string>).includes(value)
	);
}

/** Resolve a priority value with a fallback to `normal`. */
export function resolveTaskPriority(value: unknown): TaskPriority {
	return isTaskPriority(value) ? value : "normal";
}
