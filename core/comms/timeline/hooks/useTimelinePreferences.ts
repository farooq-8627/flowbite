"use client";

/**
 * useTimelinePreferences — per-device timeline display preferences.
 *
 * Why this is local (not a Convex column)
 * ───────────────────────────────────────
 * Different teammates want different things on their feed. Sales reps want
 * everything; admins prefer a low-noise audit feed. Storing this on the
 * org would force a one-size-fits-all rule. Storing on the user means
 * extra Convex calls + a schema migration. localStorage is fine: the
 * activity log is always written; this only changes what's visible.
 *
 * Default behaviour (anti-duplication)
 * ────────────────────────────────────
 * The unified timeline merges THREE sources: activityLogs, notes, and
 * reminders. When you create a note, you get BOTH:
 *   - the note row (rendered as a card with the note's content), AND
 *   - an activityLog entry with action="note_created" (rendered as a
 *     bare line "Note added · 5m ago").
 * Same for reminders / follow-ups. Showing both is redundant — the user
 * sees "Reminder set" twice in a row. By default we hide the redundant
 * activity-log entries; the notes/reminders cards still surface every
 * note + reminder created.
 *
 * Users can opt back in via Settings → CRM → Timeline.
 *
 * Storage shape
 * ─────────────
 * `orbitly:state:timeline:hiddenEventGroups` — string[] of group keys.
 *
 * Group keys are coarse-grained "categories" rather than raw action
 * strings, so the user toggles "Reminder created/edited" once instead of
 * picking from a dozen actions. The mapping from action → group lives
 * in `TIMELINE_EVENT_GROUPS` below.
 */

import { useCallback, useMemo } from "react";
import { usePersistedState } from "@/lib/hooks/use-persisted-state";

export type TimelineEventGroupId =
	| "noteRedundant"
	| "reminderRedundant"
	| "followupRedundant"
	| "messageSent"
	| "stageChange"
	| "statusChange"
	| "fieldUpdate"
	| "aiAction"
	| "systemAction"
	| "createDelete";

export interface TimelineEventGroup {
	id: TimelineEventGroupId;
	label: string;
	description: string;
	/**
	 * `true` when this group is the noisy "shadow" of a card-based entry.
	 * These are hidden by default to keep the feed clean. Users can
	 * opt back in.
	 */
	defaultHidden: boolean;
	/**
	 * Predicate run against an activity log entry's `action` string.
	 * Returning `true` means "this entry belongs to this group".
	 */
	matches: (action: string) => boolean;
}

/**
 * Canonical group definitions — the ONLY place that decides which
 * activity actions belong to which user-facing toggle.
 *
 * Order matters for evaluation: the first group whose `matches`
 * predicate returns true wins. Place the redundant groups first so
 * a `note_created` action lands in `noteRedundant` rather than
 * `createDelete`.
 */
export const TIMELINE_EVENT_GROUPS: TimelineEventGroup[] = [
	{
		id: "noteRedundant",
		label: "Note created/edited (duplicate of the note card)",
		description:
			"Hides the bare \u201CNote added\u201D / \u201CNote edited\u201D activity row that fires alongside the actual note card. The note card itself always shows up.",
		defaultHidden: true,
		matches: (a) =>
			/^note[_.]/.test(a) ||
			a === "note_created" ||
			a === "note_updated" ||
			a === "note_deleted" ||
			a === "note_pinned",
	},
	{
		id: "reminderRedundant",
		label: "Task created/completed (duplicate of the task card)",
		description:
			"Hides the bare \u201CTask added\u201D / \u201CTask completed\u201D row that mirrors the task card.",
		defaultHidden: true,
		matches: (a) =>
			a === "task_created" ||
			a === "task_updated" ||
			a === "task_deleted" ||
			a === "task_completed" ||
			// Backward-compat with legacy activity log rows.
			a === "reminder_created" ||
			a === "reminder_updated" ||
			a === "reminder_deleted" ||
			a === "reminder_completed",
	},
	{
		id: "followupRedundant",
		label: "Follow-up created/completed (legacy duplicate of the task card)",
		description:
			"Hides the legacy \u201CFollow-up created\u201D activity row from before the rename to tasks.",
		defaultHidden: true,
		matches: (a) =>
			a === "followup_created" ||
			a === "followup_updated" ||
			a === "followup_deleted" ||
			a === "followup_completed",
	},
	{
		id: "messageSent",
		label: "Messages sent",
		description: "Inline conversation entries (\u201CMessage sent\u201D).",
		defaultHidden: false,
		matches: (a) => a === "message_sent" || a.startsWith("message."),
	},
	{
		id: "stageChange",
		label: "Stage changes",
		description:
			"Deal moves between pipeline stages. Useful for audit; some teams prefer to mute the noise.",
		defaultHidden: false,
		matches: (a) => a.includes("stage"),
	},
	{
		id: "statusChange",
		label: "Status changes",
		description: "Lead/contact status transitions.",
		defaultHidden: false,
		matches: (a) => a.includes("status"),
	},
	{
		id: "fieldUpdate",
		label: "Field-level updates",
		description: "Granular edits like \u201CBudget: 100 \u2192 200\u201D.",
		defaultHidden: false,
		matches: (a) => a === "field_updated",
	},
	{
		id: "aiAction",
		label: "AI actions",
		description: "Anything the AI agent does on behalf of a user.",
		defaultHidden: false,
		matches: (a) => a.startsWith("ai.") || a.includes("ai_"),
	},
	{
		id: "systemAction",
		label: "System / integration",
		description: "Background jobs, webhook syncs, automation rules.",
		defaultHidden: false,
		matches: (a) => a.startsWith("system."),
	},
	{
		id: "createDelete",
		label: "Created / converted / deleted",
		description: "Lead created, contact converted, deal won, etc.",
		defaultHidden: false,
		matches: (a) =>
			a.includes("created") ||
			a.includes("converted") ||
			a.includes("deleted") ||
			a.includes("removed") ||
			a === "won" ||
			a === "lost",
	},
];

const STORAGE_KEY = "timeline:hiddenEventGroups:v1";

/** Default-hidden group ids — derived from the registry, not duplicated. */
const DEFAULT_HIDDEN_GROUP_IDS = TIMELINE_EVENT_GROUPS.filter((g) => g.defaultHidden).map(
	(g) => g.id,
);

export interface TimelinePreferences {
	hiddenGroups: TimelineEventGroupId[];
	isHidden: (groupId: TimelineEventGroupId) => boolean;
	toggleGroup: (groupId: TimelineEventGroupId) => void;
	resetToDefaults: () => void;
}

/**
 * Hook entry point — read/write the per-device timeline preferences.
 *
 * Returns memoised values; safe to use in component render.
 */
export function useTimelinePreferences(): TimelinePreferences {
	const [hidden, setHidden] = usePersistedState<TimelineEventGroupId[]>(
		STORAGE_KEY,
		DEFAULT_HIDDEN_GROUP_IDS,
	);

	const hiddenSet = useMemo(() => new Set(hidden), [hidden]);

	const isHidden = useCallback(
		(groupId: TimelineEventGroupId) => hiddenSet.has(groupId),
		[hiddenSet],
	);

	const toggleGroup = useCallback(
		(groupId: TimelineEventGroupId) => {
			setHidden((prev) => {
				const next = new Set(prev);
				if (next.has(groupId)) next.delete(groupId);
				else next.add(groupId);
				return Array.from(next);
			});
		},
		[setHidden],
	);

	const resetToDefaults = useCallback(() => {
		setHidden(DEFAULT_HIDDEN_GROUP_IDS);
	}, [setHidden]);

	return useMemo(
		() => ({ hiddenGroups: hidden, isHidden, toggleGroup, resetToDefaults }),
		[hidden, isHidden, toggleGroup, resetToDefaults],
	);
}

/**
 * Test whether an activity-log action should be visible given the user's
 * hidden-groups preference. Pure function — safe to call inside `useMemo`.
 *
 * Iterates groups in registry order; first match wins. If the matched
 * group is hidden, returns `false`. If no group matches (unrecognised
 * action — e.g. a brand-new event type added to the backend), the entry
 * is shown by default so users don't lose data silently.
 */
export function isActivityActionVisible(
	action: string,
	hiddenGroups: ReadonlyArray<TimelineEventGroupId> | Set<TimelineEventGroupId>,
): boolean {
	const hiddenSet = hiddenGroups instanceof Set ? hiddenGroups : new Set(hiddenGroups);
	for (const group of TIMELINE_EVENT_GROUPS) {
		if (group.matches(action)) {
			return !hiddenSet.has(group.id);
		}
	}
	return true; // unrecognised — default visible.
}
