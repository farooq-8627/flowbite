/**
 * followup-priority — helpers for the priority chip on follow-ups.
 *
 * STATUS: IMPLEMENTED.
 *
 * `priority` is the closed-union field on `reminders.priority`. The
 * Reminders surface ignores it; the Follow-ups surface shows it as a
 * coloured chip on every card and uses it as a secondary sort key after
 * dueAt (urgent → high → normal → low).
 *
 * Source of truth: schema/crmShared.ts::reminders.priority validator.
 */

export type FollowupPriority = "low" | "normal" | "high" | "urgent";

export const FOLLOWUP_PRIORITY_VALUES: ReadonlyArray<FollowupPriority> = [
	"low",
	"normal",
	"high",
	"urgent",
] as const;

export const FOLLOWUP_PRIORITY_LABEL: Record<FollowupPriority, string> = {
	low: "Low",
	normal: "Normal",
	high: "High",
	urgent: "Urgent",
};

/**
 * Hex colour per priority. Used inline for chip + dot indicators where
 * Tailwind class composition would be awkward.
 */
export const FOLLOWUP_PRIORITY_COLOR: Record<FollowupPriority, string> = {
	low: "#94a3b8", // slate-400
	normal: "#3b82f6", // blue-500
	high: "#f59e0b", // amber-500
	urgent: "#dc2626", // red-600
};

/**
 * Sort weight — higher means render first when sorting by priority.
 * Used as a secondary sort key in the FollowUpsView DataTable.
 */
export const FOLLOWUP_PRIORITY_WEIGHT: Record<FollowupPriority, number> = {
	urgent: 4,
	high: 3,
	normal: 2,
	low: 1,
};

/** Type guard — narrow an arbitrary string to a known priority. */
export function isFollowupPriority(value: unknown): value is FollowupPriority {
	return (
		typeof value === "string" &&
		(FOLLOWUP_PRIORITY_VALUES as ReadonlyArray<string>).includes(value)
	);
}

/** Resolve a priority value with a fallback to `normal`. */
export function resolveFollowupPriority(value: unknown): FollowupPriority {
	return isFollowupPriority(value) ? value : "normal";
}
