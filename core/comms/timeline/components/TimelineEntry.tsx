"use client";

/**
 * TimelineEntry — switch component, picks the visual shape from `_kind`.
 *
 * The backend tags every entry with `_kind` ("bare" | "card" | "node") so
 * the frontend renderer is a simple switch. Adding a new entry type to
 * the timeline is then a backend-only change (tag the new shape with one
 * of the three kinds).
 */

import { TimelineBareEntry } from "./TimelineBareEntry";
import { TimelineCardEntry } from "./TimelineCardEntry";
import { TimelineNodeEntry } from "./TimelineNodeEntry";
import type {
	TimelineActivityEntry,
	TimelineEntry as TimelineEntryUnion,
	TimelineNoteEntry,
	TimelineReminderEntry,
} from "./types";

interface TimelineEntryProps {
	entry: TimelineEntryUnion;
	/** When true, the connector beneath this entry's icon is hidden. */
	isLast?: boolean;
	/** Pixel gap between siblings — forwarded to the icon's connector. */
	gapPx?: number;
}

export function TimelineEntry({ entry, isLast, gapPx }: TimelineEntryProps) {
	if (entry._kind === "card") {
		return (
			<TimelineCardEntry
				entry={entry as TimelineNoteEntry | TimelineReminderEntry}
				isLast={isLast}
				gapPx={gapPx}
			/>
		);
	}
	if (entry._kind === "node") {
		return (
			<TimelineNodeEntry
				entry={entry as TimelineActivityEntry}
				isLast={isLast}
				gapPx={gapPx}
			/>
		);
	}
	return (
		<TimelineBareEntry
			entry={entry as TimelineActivityEntry}
			isLast={isLast}
			gapPx={gapPx}
		/>
	);
}
