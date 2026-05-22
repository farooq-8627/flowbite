/**
 * Timeline shared types — the canonical shape returned by `getForScope`.
 *
 * The backend returns a discriminated union tagged with `_entryType` +
 * `_kind`. We narrow at the entry boundary (TimelineEntry switches on
 * `_kind`) so the leaf renderers (TimelineBareEntry / TimelineCardEntry /
 * TimelineNodeEntry) receive a fully-typed entry without runtime checks.
 *
 * Why this lives in its own file
 *   - Both `hooks/` and `components/` need the types.
 *   - Putting it in `components/` would create a circular import (the
 *     filter chip row imports types from feed, feed imports types from
 *     entries, etc.). One shared types module keeps imports linear.
 */

import type { Doc } from "@/convex/_generated/dataModel";

export type TimelineEntryType = "activity" | "note" | "reminder";
export type TimelineEntryKind = "bare" | "card" | "node";

/**
 * Common fields every entry carries (added by the backend merge).
 */
type BaseTimelineEntry = {
	_entryType: TimelineEntryType;
	_kind: TimelineEntryKind;
	_color: string;
};

export type TimelineActivityEntry = Doc<"activityLogs"> &
	BaseTimelineEntry & { _entryType: "activity" };

export type TimelineNoteEntry = Doc<"notes"> &
	BaseTimelineEntry & { _entryType: "note"; _kind: "card" };

export type TimelineReminderEntry = Doc<"reminders"> &
	BaseTimelineEntry & { _entryType: "reminder"; _kind: "card" };

export type TimelineEntry = TimelineActivityEntry | TimelineNoteEntry | TimelineReminderEntry;

// ─── Filter chip state ───────────────────────────────────────────────────────

/**
 * The chip row at the top of the feed. `all` resets every other chip;
 * any other selection is a single-chip filter (radio-group semantics).
 *
 * Filtering is client-side because:
 *   - The backend already pages 50 entries at a time — filtering one
 *     page is cheap.
 *   - Server-side filtering would require six different queries (or six
 *     args) and complicate the cursor.
 */
export type TimelineFilter = "all" | "notes" | "reminders" | "activity" | "ai" | "system";

/** Test whether an entry matches the active filter. */
export function entryMatchesFilter(entry: TimelineEntry, filter: TimelineFilter): boolean {
	if (filter === "all") return true;
	if (filter === "notes") return entry._entryType === "note";
	if (filter === "reminders") return entry._entryType === "reminder";
	if (filter === "activity") return entry._entryType === "activity";
	if (filter === "ai") {
		return entry._entryType === "activity" && entry.actorType === "ai";
	}
	if (filter === "system") {
		return (
			entry._entryType === "activity" &&
			(entry.actorType === "system" || entry.actorType === "integration")
		);
	}
	return true;
}
