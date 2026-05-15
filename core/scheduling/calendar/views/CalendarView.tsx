"use client";

/**
 * CalendarView — org-wide calendar (placeholder, no UI yet).
 *
 * UI Architecture (per CORE-FEATURES-ARCHITECTURE.md §3.5):
 *   - **Sidebar** (mini-cal + source filters + quick add) and **Main grid**
 *     (month/week/day/list) are INDEPENDENT components.
 *   - Org-wide page composes both. Profile / Deal / Company tabs embed only
 *     the Main grid.
 *   - "Create event" → calls `useCreateEventFromCalendar` (which is
 *     `useCreateReminder` under the hood). No separate events table.
 *
 * Status: backend wired (`useCalendarEvents`). UI pending.
 */
import { useMemo, useState } from "react";
import { useCalendarEvents } from "@/core/scheduling/calendar/hooks";
import { useCurrentOrg } from "@/core/shell/shared/hooks/useCurrentOrg";

const MONTH_MS = 31 * 24 * 60 * 60 * 1000;

export function CalendarView() {
	const { orgId, orgSlug } = useCurrentOrg();

	const [center] = useState(() => Date.now());
	const range = useMemo(
		() => ({ rangeStart: center - MONTH_MS, rangeEnd: center + MONTH_MS }),
		[center],
	);

	const events = useCalendarEvents({ orgId, ...range, scope: "org" });

	return (
		<div data-status="calendar-pending-ui" className="p-6">
			<h1 className="text-xl font-semibold">Calendar</h1>
			<p className="text-sm text-muted-foreground">
				Backend connected — {events?.length ?? 0} events in the current ±31d window. UI
				pending.
			</p>
			<pre className="mt-4 max-h-[40vh] overflow-auto rounded-[var(--radius)] border bg-muted p-3 text-xs">
				{JSON.stringify(
					{ orgSlug, count: events?.length, sample: events?.slice(0, 3) },
					null,
					2,
				)}
			</pre>
			{/* When UI lands:
			    <CalendarSidebar
			      sourceFilters={...}
			      miniCalDate={...}
			      onCreate={() => createEvent({ ... })}  // calls useCreateEventFromCalendar
			    />
			    <CalendarMain events={events} viewMode={...} />
			*/}
		</div>
	);
}
