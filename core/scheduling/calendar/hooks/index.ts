/**
 * Calendar hooks — wrap the unified `getEvents` query.
 *
 * Tasks + activityLogs (meetings/calls/demos) + deal close dates are
 * server-merged into a `CalendarEvent[]` shape.
 *
 * "Create event" = create a task. We re-export `useCreateTask` so a
 * single calendar import gives the consumer everything they need.
 */
"use client";

import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";

export { useCreateTask as useCreateEventFromCalendar } from "@/core/scheduling/tasks/hooks";

/**
 * Get every calendar event in [rangeStart, rangeEnd].
 * Source filter: tasks + activity logs + deal close dates.
 */
export function useCalendarEvents(args: {
	orgId?: Id<"orgs">;
	rangeStart: number;
	rangeEnd: number;
	scope?: "org" | "person" | "entity";
	personCode?: string;
	entityType?: string;
	entityId?: string;
	sources?: ("reminder" | "activity" | "deal")[];
}) {
	return useQuery(
		api.crm.shared.calendar.queries.getEvents,
		args.orgId
			? {
					orgId: args.orgId,
					rangeStart: args.rangeStart,
					rangeEnd: args.rangeEnd,
					scope: args.scope ?? "org",
					personCode: args.personCode,
					entityType: args.entityType,
					entityId: args.entityId,
					sources: args.sources,
				}
			: "skip",
	);
}
