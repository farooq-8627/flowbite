"use client";

/**
 * ReminderStatusBadge — visual chip showing a reminder's state.
 *
 * STATUS: IMPLEMENTED.
 *
 * Reuses `components/ui/badge`. The state is computed with
 * `getReminderState`, so callers can pass either a full `Doc<"reminders">`
 * or any object with `{ dueAt, status, completedAt? }` (mirrors what the
 * calendar DTO exposes).
 *
 * Sizes:
 *   - `xs` — used inside table cells (matches DataTable default cell
 *     density).
 *   - `sm` — used inside reminder cards / panels (slightly more breathing
 *     room).
 *
 * Visual contract:
 *   ┌──────────┐
 *   │ ● Today  │   ← coloured dot + label, sized to the badge variant
 *   └──────────┘
 *
 * The dot is intentional — colourblind-friendly. The label uses the
 * canonical `REMINDER_STATE_LABEL` so wording stays in lock-step
 * everywhere. Outline styling keeps the chip readable on every row's
 * background (table, card, panel).
 */

import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import {
	getReminderState,
	REMINDER_STATE_COLOR,
	REMINDER_STATE_LABEL,
	type ReminderLike,
	type ReminderState,
} from "../lib/reminder-status";

interface ReminderStatusBadgeProps {
	/** Either the reminder itself, or a pre-computed state. */
	reminder?: ReminderLike;
	state?: ReminderState;
	/** Pin the clock — useful for tests / SSR. */
	now?: number;
	size?: "xs" | "sm";
	className?: string;
}

const SIZE_CLASS: Record<NonNullable<ReminderStatusBadgeProps["size"]>, string> = {
	xs: "h-4 px-1.5 py-0 text-[10px] gap-1",
	sm: "h-5 px-2 py-0.5 text-[11px] gap-1.5",
};

const DOT_CLASS: Record<NonNullable<ReminderStatusBadgeProps["size"]>, string> = {
	xs: "size-1.5",
	sm: "size-2",
};

export function ReminderStatusBadge({
	reminder,
	state,
	now,
	size = "xs",
	className,
}: ReminderStatusBadgeProps) {
	const resolved: ReminderState =
		state ?? (reminder ? getReminderState(reminder, now) : "upcoming");
	const color = REMINDER_STATE_COLOR[resolved];
	const label = REMINDER_STATE_LABEL[resolved];

	return (
		<Badge
			variant="outline"
			className={cn(SIZE_CLASS[size], className)}
			style={{
				color,
				borderColor: `${color}66`,
				backgroundColor: `${color}14`,
			}}
			title={label}
		>
			<span
				aria-hidden
				className={cn("inline-block shrink-0 rounded-full", DOT_CLASS[size])}
				style={{ backgroundColor: color }}
			/>
			<span className="truncate">{label}</span>
		</Badge>
	);
}
