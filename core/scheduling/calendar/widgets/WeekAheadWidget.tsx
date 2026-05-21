"use client";

/**
 * WeekAheadWidget — 7-day strip of upcoming events with event titles.
 *
 * STATUS: IMPLEMENTED.
 *
 * Renders a row of 7 cells (today + next 6 days). Each cell shows:
 *   - day-of-week + date number
 *   - up to 3 event chips with title + colour (instead of just dots)
 *   - "+N more" line when overflow
 *
 * Click any cell → /{orgSlug}/reminders?view=calendar&date=yyyy-MM-dd
 * Click any chip → also navigates (inherits cell click — chips here are
 *   non-interactive labels, only used for display).
 *
 * Per SCHEDULING-IMPLEMENTATION.md §4.6 — uses ONE
 * `useCalendarEvents({ scope: "org" })` call with a tight 7-day window.
 * Dedupes naturally with the org-wide CalendarView when both are mounted.
 */

import { addDays, format, isToday, startOfDay } from "date-fns";
import { ArrowRightIcon, CalendarRangeIcon } from "lucide-react";
import Link from "next/link";
import { useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { Id } from "@/convex/_generated/dataModel";
import type { CalendarEventDTO } from "@/convex/crm/shared/calendar/queries";
import { useCalendarEvents } from "@/core/scheduling/calendar/hooks";
import { bucketByDay } from "@/core/scheduling/calendar/lib/calendar-buckets";
import { ymdKey } from "@/core/scheduling/calendar/lib/calendar-grid";
import { cn } from "@/lib/utils";

const MAX_CHIPS = 4;

interface WeekAheadWidgetProps {
	orgId: Id<"orgs"> | undefined;
	orgSlug: string;
	className?: string;
}

export function WeekAheadWidget({ orgId, orgSlug, className }: WeekAheadWidgetProps) {
	// Tight 7-day window — dedupes if any other consumer asks for the same range.
	const today = useMemo(() => startOfDay(new Date()).getTime(), []);
	const range = useMemo(
		() => ({
			rangeStart: today,
			rangeEnd: startOfDay(addDays(new Date(), 7)).getTime(),
		}),
		[today],
	);
	const events = useCalendarEvents({
		orgId,
		rangeStart: range.rangeStart,
		rangeEnd: range.rangeEnd,
		scope: "org",
	});
	const buckets = useMemo(() => bucketByDay(events ?? []), [events]);
	const days = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(new Date(), i)), []);

	return (
		<Card className={cn("flex flex-col", className)}>
			<CardHeader className="flex flex-row items-center justify-between gap-2 pb-2">
				<div className="flex items-center gap-2">
					<CalendarRangeIcon className="size-4 text-muted-foreground" aria-hidden />
					<CardTitle className="text-base">Week ahead</CardTitle>
				</div>
				<Link
					href={`/${orgSlug}/reminders?view=calendar`}
					className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
				>
					Open calendar <ArrowRightIcon className="size-3" />
				</Link>
			</CardHeader>
			<CardContent className="flex-1 pt-0">
				{events === undefined ? (
					<p className="text-xs text-muted-foreground">Loading…</p>
				) : (
					<ul className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-7 lg:gap-1.5">
						{days.map((day) => {
							const key = ymdKey(day);
							const list = buckets.get(key) ?? [];
							const isDayToday = isToday(day);
							return (
								<li key={key}>
									<Link
										href={`/${orgSlug}/reminders?view=calendar&date=${key}`}
										className={cn(
											"flex h-full min-h-[120px] flex-col gap-1.5 rounded-[var(--radius)] border p-2 transition-colors hover:border-ring/40 hover:bg-accent/30 lg:min-h-[110px] lg:p-1.5",
											isDayToday && "ring-1 ring-primary/40",
										)}
									>
										{/* Day-of-week — top, small, uppercase (always at the top) */}
										<span className="block text-center text-[10px] uppercase tracking-wide text-muted-foreground lg:text-start">
											{format(day, "EEE")}
										</span>
										{/* Big centered date — middle of the cell on mobile, hidden on lg
										    (lg has a tighter row showing the day inline beside the weekday). */}
										<span
											className={cn(
												"block text-center text-2xl font-semibold leading-none tabular-nums lg:hidden",
												isDayToday && "text-primary",
											)}
										>
											{format(day, "d")}
										</span>
										{/* Compact lg-only date — on the same line as weekday, since each cell is narrower */}
										<span
											className={cn(
												"hidden text-end text-sm font-semibold tabular-nums lg:block",
												isDayToday && "text-primary",
											)}
										>
											{format(day, "d")}
										</span>
										{list.length === 0 ? (
											<span className="mt-auto block text-center text-[10px] text-muted-foreground/60 lg:text-start">
												—
											</span>
										) : (
											<div className="flex flex-col gap-0.5 overflow-hidden">
												{list.slice(0, MAX_CHIPS).map((event) => (
													<MiniChip key={event.id} event={event} />
												))}
												{list.length > MAX_CHIPS && (
													<span className="text-[10px] text-muted-foreground">
														+{list.length - MAX_CHIPS} more
													</span>
												)}
											</div>
										)}
									</Link>
								</li>
							);
						})}
					</ul>
				)}
			</CardContent>
		</Card>
	);
}

/**
 * MiniChip — compact event label inside a week-ahead cell.
 *
 * Visually similar to the calendar grid `<EventChip>` but built for a much
 * narrower container — the time is omitted to give the title room to
 * breathe. The colour-bar on the start side carries the source identity
 * (orange = reminder, indigo = activity, blue = deal close).
 */
function MiniChip({ event }: { event: CalendarEventDTO }) {
	const time = format(event.startsAt, "h:mma").toLowerCase();
	return (
		<span
			className="flex items-center gap-1 truncate rounded-[calc(var(--radius)-3px)] px-1 py-0.5 text-[10px] leading-tight text-white"
			style={{ backgroundColor: event.color }}
			title={`${time} · ${event.title}`}
		>
			<span className="truncate">{event.title}</span>
		</span>
	);
}
