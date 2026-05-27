"use client";

/**
 * EventForm — calendar-specific create/edit drawer.
 *
 * "Create event" from the calendar = create a task. Wraps the canonical
 * `<TaskForm>` with calendar-specific defaults:
 *
 *   1. Overrides the submit label to "Save as task".
 *   2. Pre-fills `dueAt` with whatever date the user clicked in the
 *      grid (we round to 9 AM if no time was supplied).
 *   3. Defaults `type` to `todo` (calendar events that aren't a
 *      call/email/meeting are general to-do items by default; the
 *      operator can switch the type chip if needed).
 *
 * Replaces ReminderForm-based shim per TASKS-RENAME-PLAN.md (Stage 4B).
 */

import { set } from "date-fns";
import type { Doc, Id } from "@/convex/_generated/dataModel";
import { TaskForm } from "@/core/scheduling/tasks/components/TaskForm";

interface EventFormProps {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	/** Edit mode — pass the full task doc. */
	task?: Doc<"tasks"> | null;
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

export function EventForm({ open, onOpenChange, task, defaults }: EventFormProps) {
	const dueAt = defaults?.startsAt ? snapTo9amIfMidnight(defaults.startsAt) : undefined;

	return (
		<TaskForm
			open={open}
			onOpenChange={onOpenChange}
			task={task}
			defaults={
				task
					? undefined
					: {
							personCode: defaults?.personCode,
							dealCode: defaults?.dealCode,
							entityType:
								defaults?.entityType ??
								(defaults?.personCode ? "person" : undefined),
							entityId: defaults?.entityId ?? defaults?.personCode,
							assignedTo: defaults?.assignedTo,
							title: defaults?.title,
							dueAt,
							type: "todo",
						}
			}
			submitLabel={task ? "Save changes" : "Save as task"}
		/>
	);
}
