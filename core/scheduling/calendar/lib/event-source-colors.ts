/**
 * event-source-colors — central palette for the calendar event sources.
 *
 * STATUS: IMPLEMENTED.
 *
 * The Convex query `crm.shared.calendar.queries.getEvents` already
 * stamps a `color` on each DTO so the grid never needs to look up these
 * values directly. This module exists for the surfaces that DON'T render
 * a server-stamped DTO:
 *   - `<CalendarFilters>` toggles need swatch + label per source.
 *   - The legend in the dashboard mini-cal widget.
 *   - Tests asserting we never accidentally re-paint a source.
 *
 * The hex codes here MUST match the constants inside
 * `convex/crm/shared/calendar/queries.ts` (COLOR_REMINDER /
 * COLOR_ACTIVITY / COLOR_DEAL). If you change one, change both.
 */

import type { LucideIcon } from "lucide-react";
import { BellIcon, CalendarRangeIcon, HandshakeIcon } from "lucide-react";

export type CalendarEventSource = "reminder" | "activity" | "deal";

interface SourceMeta {
	value: CalendarEventSource;
	label: string;
	description: string;
	color: string;
	icon: LucideIcon;
}

export const EVENT_SOURCE_META: Record<CalendarEventSource, SourceMeta> = {
	reminder: {
		value: "reminder",
		label: "Reminders",
		description: "Follow-ups and tasks scheduled for you and your team.",
		color: "#f97316", // orange-500 — matches COLOR_REMINDER on the server
		icon: BellIcon,
	},
	activity: {
		value: "activity",
		label: "Meetings & calls",
		description: "Activity-log entries (meeting / call / demo scheduled).",
		color: "#6366f1", // indigo-500 — matches COLOR_ACTIVITY on the server
		icon: CalendarRangeIcon,
	},
	deal: {
		value: "deal",
		label: "Deal close dates",
		description: "Open deals with an expected close date.",
		color: "#3b82f6", // blue-500 — matches COLOR_DEAL on the server
		icon: HandshakeIcon,
	},
};

export const EVENT_SOURCE_ORDER: ReadonlyArray<CalendarEventSource> = [
	"reminder",
	"activity",
	"deal",
] as const;
