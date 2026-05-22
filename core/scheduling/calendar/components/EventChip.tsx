"use client";

/**
 * EventChip — single event pill rendered inside a calendar cell.
 *
 * STATUS: IMPLEMENTED.
 *
 * Visual contract (compact — a calendar cell shows up to 3 chips
 * before truncating):
 *   ┌──────────────────────────┐
 *   │ ◯ 2:30 PM Title          │
 *   └──────────────────────────┘
 *
 * The chip:
 *   - Reads its colour from the server-stamped DTO (no per-source switch
 *     in the renderer — keeps the event/colour mapping single-sourced
 *     in `convex/crm/shared/calendar/queries.ts`).
 *   - Click stops propagation so the cell-level selectDate handler
 *     doesn't fire when the user is targeting the chip.
 *   - Renders an `aria-label` describing source + time + title for SR
 *     users.
 */

import { format } from "date-fns";
import type { MouseEvent } from "react";
import type { CalendarEventDTO } from "@/convex/crm/shared/calendar/queries";
import { cn } from "@/lib/utils";

interface EventChipProps {
	event: CalendarEventDTO;
	onSelect?: (event: CalendarEventDTO, e: MouseEvent<HTMLButtonElement>) => void;
	/** Layout variant: cell (compact, fits in calendar cells) | row (full width, list view). */
	variant?: "cell" | "row";
	/** Whether this chip can be dragged to reschedule. */
	draggable?: boolean;
	className?: string;
}

export function EventChip({
	event,
	onSelect,
	variant = "cell",
	draggable: isDraggable,
	className,
}: EventChipProps) {
	const time = format(event.startsAt, "h:mm a");
	const ariaLabel = `${event.source} · ${time} · ${event.title}`;

	if (variant === "row") {
		return (
			<button
				type="button"
				onClick={(e) => {
					e.stopPropagation();
					onSelect?.(event, e);
				}}
				aria-label={ariaLabel}
				className={cn(
					"flex w-full items-start gap-2 rounded-[var(--radius)] border bg-card px-3 py-2 text-start transition-colors hover:bg-accent",
					className,
				)}
			>
				<span
					aria-hidden
					className="mt-1 size-2 shrink-0 rounded-full"
					style={{ backgroundColor: event.color }}
				/>
				<span className="flex min-w-0 flex-1 flex-col">
					<span className="flex items-baseline justify-between gap-2">
						<span className="truncate text-sm font-medium" title={event.title}>
							{event.title}
						</span>
						<span className="text-[11px] text-muted-foreground">{time}</span>
					</span>
					<span className="truncate text-[11px] capitalize text-muted-foreground">
						{event.source}
						{event.personCode ? ` · ${event.personCode}` : ""}
					</span>
				</span>
			</button>
		);
	}

	return (
		<button
			type="button"
			onClick={(e) => {
				e.stopPropagation();
				onSelect?.(event, e);
			}}
			draggable={isDraggable}
			onDragStart={(e) => {
				e.stopPropagation();
				e.dataTransfer.setData("application/calendar-event", JSON.stringify(event));
				e.dataTransfer.effectAllowed = "move";
			}}
			aria-label={ariaLabel}
			title={`${time} — ${event.title}`}
			className={cn(
				"flex w-full items-center gap-1 rounded-[calc(var(--radius)-2px)] px-1.5 py-0.5 text-start text-[10px] leading-tight text-white transition-opacity hover:opacity-90",
				isDraggable && "cursor-grab active:cursor-grabbing",
				className,
			)}
			style={{ backgroundColor: event.color }}
		>
			<span className="shrink-0 font-semibold tabular-nums">
				{format(event.startsAt, "h:mm")}
			</span>
			<span className="truncate">{event.title}</span>
		</button>
	);
}
