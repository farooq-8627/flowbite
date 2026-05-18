"use client";

/**
 * MiniCalendarWidget — small month grid for the dashboard.
 *
 * STATUS: IMPLEMENTED.
 *
 * Reuses the shadcn `<Calendar>` primitive — same component used by the
 * sidebar of the org-wide CalendarView and by every form's date picker.
 * Selecting a date navigates to `/{orgSlug}/reminders?view=calendar&date=…`.
 *
 * No Convex subscription — purely a navigation aid. The full calendar
 * reads its own subscription on arrival.
 */

import { ArrowRightIcon, CalendarDaysIcon } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Calendar } from "@/components/ui/calendar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ymdKey } from "@/core/scheduling/calendar/lib/calendar-grid";

interface MiniCalendarWidgetProps {
	orgSlug: string;
	className?: string;
}

export function MiniCalendarWidget({ orgSlug, className }: MiniCalendarWidgetProps) {
	const router = useRouter();
	const [selected, setSelected] = useState<Date>(() => new Date());

	return (
		<Card className={`flex flex-col ${className ?? ""}`.trim()}>
			<CardHeader className="flex flex-row items-center justify-between gap-2 pb-2">
				<div className="flex items-center gap-2">
					<CalendarDaysIcon className="size-4 text-muted-foreground" aria-hidden />
					<CardTitle className="text-base">Calendar</CardTitle>
				</div>
				<Link
					href={`/${orgSlug}/reminders?view=calendar`}
					className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
				>
					Open <ArrowRightIcon className="size-3" />
				</Link>
			</CardHeader>
			<CardContent className="flex flex-1 items-center justify-center pt-0">
				<Calendar
					mode="single"
					selected={selected}
					onSelect={(date) => {
						if (!date) return;
						setSelected(date);
						router.push(`/${orgSlug}/reminders?view=calendar&date=${ymdKey(date)}`);
					}}
					captionLayout="dropdown"
				/>
			</CardContent>
		</Card>
	);
}
