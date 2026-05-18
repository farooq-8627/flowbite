"use client";

/**
 * CalendarMain — pure renderer for the calendar grid.
 *
 * STATUS: IMPLEMENTED.
 *
 * Per AGENTS.md "per-row data on a list view comes from one batched query"
 * + SCHEDULING-IMPLEMENTATION.md §4.4:
 *   This component receives `events` (already filtered + sorted) as a
 *   prop. It NEVER calls `useQuery`. It NEVER calls `useCurrentOrg`. The
 *   parent view (or panel) is responsible for fetching once and passing
 *   the array down.
 *
 * Four view modes:
 *   - month: 7×N grid; each cell shows up to 3 chips with "+N more".
 *   - week:  7-column day strip; events stack as chips inside each day.
 *   - day:   single day, hour-by-hour list.
 *   - list:  flat list of upcoming events (next 90 days).
 *
 * Click model (2026-05-19 update — single-click to create)
 * ─────────────────────────────────────────────────────────
 *   - Click empty space in a month/week cell → opens the create-form
 *     pre-filled with that date AND updates `selectedDate` so the
 *     toolbar / sidebar reflect the chosen day. (Previously this was
 *     a double-click, but every consumer requested single-click since
 *     it matches Google Calendar muscle memory.)
 *   - Click an empty hour slot in day-view → same as above, with hour.
 *   - Click a chip → calls `onSelectEvent(event, anchorEl)`. Chip's
 *     onClick `stopPropagation` keeps the cell handler from firing.
 *   - Double-click is preserved as an alias of single-click — no harm
 *     done if a user double-clicks out of habit.
 *   - Keyboard Enter / Space on a focused cell also opens the form
 *     (matches mouse), keyboard `N` is kept for power-users.
 *
 * Performance:
 *   - bucketByDay runs once via useMemo, keyed on the events array
 *     reference. Cell renderers do an O(1) Map.get lookup.
 *   - Month grid produces at most 42 cells. Week → 7. Day → up to 24
 *     hour-rows. List → up to 200 events (we cap at 200 with a "load
 *     more" CTA — though the calendar query itself caps activity logs
 *     at 500 so this is rarely hit).
 *
 * RTL: every directional class uses `ms-/me-/ps-/pe-/start/end`. The
 * 7-day header reads "Sun Mon Tue …" (or whichever locale-aware order
 * date-fns produces).
 */

import { format, isSameDay, isSameMonth, isToday, startOfDay } from "date-fns";
import { CalendarOffIcon } from "lucide-react";
import type { MouseEvent } from "react";
import { useMemo, useRef, useState } from "react";
import type { CalendarEventDTO } from "@/convex/crm/shared/calendar/queries";
import { cn } from "@/lib/utils";
import { bucketByDay } from "../lib/calendar-buckets";
import {
	type CalendarViewMode,
	DEFAULT_WEEK_STARTS_ON,
	getDayHours,
	getMonthGrid,
	getWeekDays,
	type WeekStart,
	ymdKey,
} from "../lib/calendar-grid";
import { EventChip } from "./EventChip";
import { EventDetailPopover } from "./EventDetailPopover";

const MAX_CELL_CHIPS = 3;

interface CalendarMainProps {
	viewMode: CalendarViewMode;
	selectedDate: Date;
	events: ReadonlyArray<CalendarEventDTO> | undefined;
	weekStartsOn?: WeekStart;
	onSelectDate?: (date: Date) => void;
	/**
	 * Called on click of an empty month/week cell — opens the EventForm
	 * with the cell's date pre-filled. The cell ALSO calls `onSelectDate`
	 * so the highlighted day stays in sync.
	 */
	onCreateAtDate?: (date: Date) => void;
	/**
	 * Called on click of an empty day-view hour row — opens the EventForm
	 * with the cell's date AND hour pre-filled.
	 */
	onCreateAtDateTime?: (date: Date) => void;
	canManageReminder?: boolean;
	onCompleteReminder?: (event: CalendarEventDTO) => void;
	onEditReminder?: (event: CalendarEventDTO) => void;
	onDeleteReminder?: (event: CalendarEventDTO) => void;
	/** Fires when a reminder chip is dropped on a different day. */
	onRescheduleReminder?: (event: CalendarEventDTO, newDate: Date) => void;
	className?: string;
}

export function CalendarMain({
	viewMode,
	selectedDate,
	events,
	weekStartsOn = DEFAULT_WEEK_STARTS_ON,
	onSelectDate,
	onCreateAtDate,
	onCreateAtDateTime,
	canManageReminder,
	onCompleteReminder,
	onEditReminder,
	onDeleteReminder,
	onRescheduleReminder,
	className,
}: CalendarMainProps) {
	// Single bucket pass; every cell does an O(1) Map.get lookup.
	const buckets = useMemo(() => bucketByDay(events ?? []), [events]);

	// Popover state — controlled by the grid; clicking outside closes.
	const anchorRef = useRef<HTMLElement | null>(null);
	const [popoverEvent, setPopoverEvent] = useState<CalendarEventDTO | null>(null);
	const [popoverOpen, setPopoverOpen] = useState(false);

	const handleSelectEvent = (event: CalendarEventDTO, e: MouseEvent<HTMLButtonElement>) => {
		anchorRef.current = e.currentTarget;
		setPopoverEvent(event);
		setPopoverOpen(true);
	};

	return (
		<div className={cn("flex min-h-0 min-w-0 flex-1 flex-col", className)}>
			{/* Body */}
			{viewMode === "month" && (
				<MonthGrid
					selectedDate={selectedDate}
					buckets={buckets}
					weekStartsOn={weekStartsOn}
					onSelectDate={onSelectDate}
					onCreateAtDate={onCreateAtDate}
					onSelectEvent={handleSelectEvent}
					onRescheduleReminder={onRescheduleReminder}
				/>
			)}
			{viewMode === "week" && (
				<WeekGrid
					selectedDate={selectedDate}
					buckets={buckets}
					weekStartsOn={weekStartsOn}
					onSelectDate={onSelectDate}
					onCreateAtDate={onCreateAtDate}
					onSelectEvent={handleSelectEvent}
					onRescheduleReminder={onRescheduleReminder}
				/>
			)}
			{viewMode === "day" && (
				<DayGrid
					selectedDate={selectedDate}
					events={events ?? []}
					onCreateAtDateTime={onCreateAtDateTime}
					onSelectEvent={handleSelectEvent}
				/>
			)}
			{viewMode === "list" && (
				<ListView events={events ?? []} onSelectEvent={handleSelectEvent} />
			)}

			{/* Popover — anchored to the chip via portal */}
			<EventDetailPopover
				event={popoverEvent}
				open={popoverOpen}
				onOpenChange={(v) => {
					setPopoverOpen(v);
					if (!v) setPopoverEvent(null);
				}}
				anchor={anchorRef.current}
				canManageReminder={canManageReminder}
				onCompleteReminder={(e) => {
					setPopoverOpen(false);
					onCompleteReminder?.(e);
				}}
				onEditReminder={(e) => {
					setPopoverOpen(false);
					onEditReminder?.(e);
				}}
				onDeleteReminder={(e) => {
					setPopoverOpen(false);
					onDeleteReminder?.(e);
				}}
			/>
		</div>
	);
}

// ─── Month grid ──────────────────────────────────────────────────────────────

function MonthGrid({
	selectedDate,
	buckets,
	weekStartsOn,
	onSelectDate,
	onCreateAtDate,
	onSelectEvent,
	onRescheduleReminder,
}: {
	selectedDate: Date;
	buckets: Map<string, CalendarEventDTO[]>;
	weekStartsOn: WeekStart;
	onSelectDate?: (d: Date) => void;
	onCreateAtDate?: (d: Date) => void;
	onSelectEvent: (e: CalendarEventDTO, ev: MouseEvent<HTMLButtonElement>) => void;
	onRescheduleReminder?: (event: CalendarEventDTO, newDate: Date) => void;
}) {
	const days = useMemo(
		() => getMonthGrid(selectedDate, weekStartsOn),
		[selectedDate, weekStartsOn],
	);

	const weekDayLabels = useMemo(() => days.slice(0, 7).map((d) => format(d, "EEE")), [days]);

	return (
		<div className="flex min-h-0 min-w-0 flex-1 flex-col">
			{/* Day-of-week header row */}
			<div className="grid grid-cols-7 border-b bg-muted/30">
				{weekDayLabels.map((label) => (
					<div
						key={label}
						className="px-2 py-2 text-center text-[11px] font-medium uppercase tracking-wide text-muted-foreground"
					>
						{label}
					</div>
				))}
			</div>

			{/* Cell grid */}
			<div className="grid min-h-0 flex-1 grid-cols-7 auto-rows-fr overflow-auto">
				{days.map((day) => {
					const key = ymdKey(day);
					const dayEvents = buckets.get(key) ?? [];
					const inMonth = isSameMonth(day, selectedDate);
					const isDayToday = isToday(day);
					const isSelected = isSameDay(day, selectedDate);
					return (
						// biome-ignore lint/a11y/useSemanticElements: CSS grid layout, not a table — role="gridcell" is appropriate for calendar cells
						<div
							key={day.toISOString()}
							role="gridcell"
							tabIndex={0}
							onClick={() => {
								onSelectDate?.(day);
								onCreateAtDate?.(day);
							}}
							onKeyDown={(e) => {
								if (e.key === "Enter" || e.key === " ") {
									e.preventDefault();
									onSelectDate?.(day);
									onCreateAtDate?.(day);
								}
								if (e.key === "n" || e.key === "N") {
									e.preventDefault();
									onCreateAtDate?.(day);
								}
							}}
							onDragOver={(e) => {
								e.preventDefault();
								e.dataTransfer.dropEffect = "move";
							}}
							onDrop={(e) => {
								e.preventDefault();
								const data = e.dataTransfer.getData("application/calendar-event");
								if (!data || !onRescheduleReminder) return;
								try {
									const event = JSON.parse(data) as CalendarEventDTO;
									if (!isSameDay(day, new Date(event.startsAt))) {
										onRescheduleReminder(event, day);
									}
								} catch {
									/* ignore malformed */
								}
							}}
							className={cn(
								"flex min-h-[88px] flex-col items-stretch gap-1 border-b border-e p-1.5 text-start transition-colors hover:bg-accent/30 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring cursor-pointer",
								!inMonth && "bg-muted/20 text-muted-foreground",
								isSelected && !isDayToday && "ring-1 ring-inset ring-primary/40",
								isDayToday && "bg-primary/5",
							)}
							title={onCreateAtDate ? "Click to add a reminder" : undefined}
						>
							<div className="flex items-center justify-between gap-1">
								<span
									className={cn(
										"inline-flex size-6 items-center justify-center rounded-full text-xs font-medium",
										isDayToday && "bg-primary text-primary-foreground",
									)}
								>
									{format(day, "d")}
								</span>
								{dayEvents.length > MAX_CELL_CHIPS && (
									<span className="text-[10px] text-muted-foreground">
										+{dayEvents.length - MAX_CELL_CHIPS}
									</span>
								)}
							</div>
							<div className="flex min-h-0 flex-col gap-0.5">
								{dayEvents.slice(0, MAX_CELL_CHIPS).map((event) => (
									<EventChip
										key={event.id}
										event={event}
										onSelect={onSelectEvent}
										variant="cell"
										draggable={event.source === "reminder"}
									/>
								))}
							</div>
						</div>
					);
				})}
			</div>
		</div>
	);
}

// ─── Week grid ───────────────────────────────────────────────────────────────

function WeekGrid({
	selectedDate,
	buckets,
	weekStartsOn,
	onSelectDate,
	onCreateAtDate,
	onSelectEvent,
	onRescheduleReminder,
}: {
	selectedDate: Date;
	buckets: Map<string, CalendarEventDTO[]>;
	weekStartsOn: WeekStart;
	onSelectDate?: (d: Date) => void;
	onCreateAtDate?: (d: Date) => void;
	onSelectEvent: (e: CalendarEventDTO, ev: MouseEvent<HTMLButtonElement>) => void;
	onRescheduleReminder?: (event: CalendarEventDTO, newDate: Date) => void;
}) {
	const days = useMemo(
		() => getWeekDays(selectedDate, weekStartsOn),
		[selectedDate, weekStartsOn],
	);

	return (
		<div className="grid grid-cols-7 min-h-0 flex-1 overflow-auto">
			{days.map((day) => {
				const key = ymdKey(day);
				const dayEvents = buckets.get(key) ?? [];
				const isDayToday = isToday(day);
				const isSelected = isSameDay(day, selectedDate);
				return (
					// biome-ignore lint/a11y/useSemanticElements: CSS grid layout, not a table — role="gridcell" is appropriate for calendar cells
					<div
						key={day.toISOString()}
						role="gridcell"
						tabIndex={0}
						onClick={() => {
							onSelectDate?.(day);
							onCreateAtDate?.(day);
						}}
						onKeyDown={(e) => {
							if (e.key === "Enter" || e.key === " ") {
								e.preventDefault();
								onSelectDate?.(day);
								onCreateAtDate?.(day);
							}
							if (e.key === "n" || e.key === "N") {
								e.preventDefault();
								onCreateAtDate?.(day);
							}
						}}
						onDragOver={(e) => {
							e.preventDefault();
							e.dataTransfer.dropEffect = "move";
						}}
						onDrop={(e) => {
							e.preventDefault();
							const data = e.dataTransfer.getData("application/calendar-event");
							if (!data || !onRescheduleReminder) return;
							try {
								const event = JSON.parse(data) as CalendarEventDTO;
								if (!isSameDay(day, new Date(event.startsAt))) {
									onRescheduleReminder(event, day);
								}
							} catch {
								/* ignore malformed */
							}
						}}
						className={cn(
							"flex min-h-[200px] flex-col gap-2 border-e border-b bg-background p-2 text-start transition-colors hover:bg-accent/30 cursor-pointer",
							isSelected && "ring-1 ring-inset ring-primary/40",
							isDayToday && "bg-primary/5",
						)}
						title={onCreateAtDate ? "Click to add a reminder" : undefined}
					>
						<div className="flex items-baseline justify-between gap-1">
							<span className="text-[11px] uppercase tracking-wide text-muted-foreground">
								{format(day, "EEE")}
							</span>
							<span
								className={cn(
									"inline-flex size-7 items-center justify-center rounded-full text-sm font-medium",
									isDayToday && "bg-primary text-primary-foreground",
								)}
							>
								{format(day, "d")}
							</span>
						</div>
						<div className="flex flex-col gap-1">
							{dayEvents.length === 0 ? (
								<span className="text-[10px] text-muted-foreground">No events</span>
							) : (
								dayEvents.map((event) => (
									<EventChip
										key={event.id}
										event={event}
										onSelect={onSelectEvent}
										variant="cell"
										draggable={event.source === "reminder"}
									/>
								))
							)}
						</div>
					</div>
				);
			})}
		</div>
	);
}

// ─── Day grid ────────────────────────────────────────────────────────────────

function DayGrid({
	selectedDate,
	events,
	onCreateAtDateTime,
	onSelectEvent,
}: {
	selectedDate: Date;
	events: ReadonlyArray<CalendarEventDTO>;
	onCreateAtDateTime?: (date: Date) => void;
	onSelectEvent: (e: CalendarEventDTO, ev: MouseEvent<HTMLButtonElement>) => void;
}) {
	const hours = useMemo(() => getDayHours(selectedDate), [selectedDate]);
	const dayKey = ymdKey(selectedDate);
	const dayEvents = useMemo(
		() =>
			events
				.filter((e) => ymdKey(e.startsAt) === dayKey)
				.sort((a, b) => a.startsAt - b.startsAt),
		[events, dayKey],
	);

	// Bucket day events by hour for fast cell lookup.
	const eventsByHour = useMemo(() => {
		const m = new Map<number, CalendarEventDTO[]>();
		for (const e of dayEvents) {
			const h = new Date(e.startsAt).getHours();
			const list = m.get(h);
			if (list) list.push(e);
			else m.set(h, [e]);
		}
		return m;
	}, [dayEvents]);

	return (
		<div className="grid grid-cols-[5rem_1fr] min-h-0 flex-1 overflow-auto">
			{hours.map((hour) => {
				const h = hour.getHours();
				const list = eventsByHour.get(h) ?? [];
				return (
					<div key={h} className="contents">
						<div className="border-e border-b bg-muted/20 px-2 py-1.5 text-[11px] text-muted-foreground tabular-nums">
							{format(hour, "h a")}
						</div>
						{/* biome-ignore lint/a11y/useSemanticElements: nested <button> chips inside this cell prevent us from making the cell itself a <button> */}
						<div
							className="border-b p-1.5 transition-colors hover:bg-accent/20 cursor-pointer focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring min-h-[3rem]"
							role="button"
							tabIndex={0}
							onClick={() => {
								if (!onCreateAtDateTime) return;
								const at = new Date(selectedDate);
								at.setHours(h, 0, 0, 0);
								onCreateAtDateTime(at);
							}}
							onKeyDown={(e) => {
								if (!onCreateAtDateTime) return;
								if (e.key === "Enter" || e.key === " ") {
									e.preventDefault();
									const at = new Date(selectedDate);
									at.setHours(h, 0, 0, 0);
									onCreateAtDateTime(at);
								}
							}}
							title={
								onCreateAtDateTime
									? `Click to add a reminder at ${format(hour, "h a")}`
									: undefined
							}
						>
							{list.length === 0 ? (
								<span className="block h-6 text-[10px] text-muted-foreground/50 opacity-0 hover:opacity-100">
									Click to add
								</span>
							) : (
								<div className="flex flex-col gap-1.5">
									{list.map((event) => (
										<EventChip
											key={event.id}
											event={event}
											onSelect={onSelectEvent}
											variant="row"
										/>
									))}
								</div>
							)}
						</div>
					</div>
				);
			})}
		</div>
	);
}

// ─── List view ───────────────────────────────────────────────────────────────

function ListView({
	events,
	onSelectEvent,
}: {
	events: ReadonlyArray<CalendarEventDTO>;
	onSelectEvent: (e: CalendarEventDTO, ev: MouseEvent<HTMLButtonElement>) => void;
}) {
	// Already filtered + sorted by the server. Group by day for headers.
	const groups = useMemo(() => {
		const today = startOfDay(new Date()).getTime();
		const upcoming = events.filter((e) => e.startsAt >= today);
		const map = new Map<string, CalendarEventDTO[]>();
		for (const e of upcoming) {
			const k = ymdKey(e.startsAt);
			const list = map.get(k);
			if (list) list.push(e);
			else map.set(k, [e]);
		}
		// Convert to ordered tuples (chronological).
		return Array.from(map.entries()).sort((a, b) => a[0].localeCompare(b[0]));
	}, [events]);

	if (groups.length === 0) {
		return (
			<div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-2 px-6 py-12 text-center">
				<CalendarOffIcon className="size-6 text-muted-foreground" aria-hidden />
				<p className="text-sm text-muted-foreground">No upcoming events.</p>
			</div>
		);
	}

	return (
		<div className="flex min-h-0 flex-1 flex-col gap-4 overflow-auto p-4">
			{groups.map(([key, list]) => {
				const date = list[0]!.startsAt;
				return (
					<div key={key} className="grid gap-2">
						<h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
							{isToday(date) ? "Today" : format(date, "EEE, MMM d")}
							<span className="ms-2 rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-normal">
								{list.length}
							</span>
						</h3>
						<div className="grid gap-1.5">
							{list.map((event) => (
								<EventChip
									key={event.id}
									event={event}
									onSelect={onSelectEvent}
									variant="row"
								/>
							))}
						</div>
					</div>
				);
			})}
		</div>
	);
}
