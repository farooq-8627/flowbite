"use client";

/**
 * EventForm — calendar-specific create/edit drawer.
 *
 * STATUS: IMPLEMENTED.
 *
 * "Create event" from the calendar = create a reminder. Per
 * SCHEDULING-IMPLEMENTATION.md §0 ("`useCreateEventFromCalendar` is a
 * re-export of `useCreateReminder`") and §2.3, this form is a thin
 * wrapper around `<ReminderForm>` that:
 *
 *   1. Overrides the submit label to "Save as Reminder" so users can
 *      see the model behind the calendar (no hidden surprise).
 *   2. Pre-fills `dueAt` with whatever date the user clicked in the
 *      grid (we round to 9 AM on that date if no time was supplied).
 *   3. Sets `source = "calendar"` so the activity log says the event
 *      came from the calendar surface.
 *
 * Editing reminders from the calendar uses the same `<ReminderForm>`
 * directly — there's no calendar-specific edit shape. We pass through
 * the full reminder doc.
 */

import { set } from "date-fns";
import type { Doc, Id } from "@/convex/_generated/dataModel";
import { ReminderForm } from "@/core/scheduling/reminders/components/ReminderForm";

interface EventFormProps {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	/** Edit mode — pass the full reminder doc. */
	reminder?: Doc<"reminders"> | null;
	/** Create mode — pass calendar context (selected date + optional entity scope). */
	defaults?: {
		startsAt?: number;
		personCode?: string;
		dealCode?: string;
		entityType?: string;
		entityId?: string;
		assignedTo?: Id<"users">;
		title?: string;
	};
}

/** Snap the start to 9:00 AM local on that day if it's exactly midnight. */
function snapTo9amIfMidnight(ts: number): number {
	const d = new Date(ts);
	if (d.getHours() === 0 && d.getMinutes() === 0 && d.getSeconds() === 0) {
		return set(d, { hours: 9, minutes: 0, seconds: 0, milliseconds: 0 }).getTime();
	}
	return ts;
}

export function EventForm({ open, onOpenChange, reminder, defaults }: EventFormProps) {
	const dueAt = defaults?.startsAt ? snapTo9amIfMidnight(defaults.startsAt) : undefined;

	return (
		<ReminderForm
			open={open}
			onOpenChange={onOpenChange}
			reminder={reminder}
			defaults={
				reminder
					? undefined
					: {
							personCode: defaults?.personCode,
							dealCode: defaults?.dealCode,
							entityType: defaults?.entityType ?? "person",
							entityId: defaults?.entityId,
							assignedTo: defaults?.assignedTo,
							title: defaults?.title,
							dueAt,
							// Calendar-driven creates always log source=calendar.
							source: "calendar",
						}
			}
			submitLabel={reminder ? "Save changes" : "Save as reminder"}
		/>
	);
}
