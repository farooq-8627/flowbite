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
 *
 * Sprint Stage 1 (2026-05-26 — DASHBOARD-AUDIT.md §3 Step 3) — header
 * gained a small "+ Schedule" button that prefills the chat composer
 * via `sendChatPrefill`. The calendar grid itself is always useful
 * (even empty) so we don't replace it; the CTA augments the header.
 */

import { ArrowRightIcon, CalendarDaysIcon, CalendarPlusIcon } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { sendChatPrefill } from "@/core/ai/lib/chatPrefill";
import { ymdKey } from "@/core/scheduling/calendar/lib/calendar-grid";

interface MiniCalendarWidgetProps {
	orgSlug: string;
	className?: string;
}

export function MiniCalendarWidget({ orgSlug, className }: MiniCalendarWidgetProps) {
	const router = useRouter();
	const [selected, setSelected] = useState<Date>(() => new Date());

	return (
		<Card className={`flex flex-col min-w-0 overflow-hidden ${className ?? ""}`.trim()}>
			<CardHeader className="flex flex-row items-center justify-between gap-2 pb-2">
				<div className="flex items-center gap-2">
					<CalendarDaysIcon className="size-4 text-muted-foreground" aria-hidden />
					<CardTitle className="text-base">Calendar</CardTitle>
				</div>
				<div className="flex items-center gap-1">
					<Button
						size="sm"
						variant="outline"
						className="h-7 text-xs"
						onClick={() =>
							sendChatPrefill(
								"Create a reminder for me, pick a date and time and a quick title.",
							)
						}
					>
						<CalendarPlusIcon className="me-1 size-3" />
						Schedule
					</Button>
					<Link
						href={`/${orgSlug}/tasks?view=calendar`}
						className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
					>
						Open <ArrowRightIcon className="size-3" />
					</Link>
				</div>
			</CardHeader>
			<CardContent className="flex flex-1 items-center justify-center pt-0">
				<Calendar
					mode="single"
					selected={selected}
					onSelect={(date) => {
						if (!date) return;
						setSelected(date);
						router.push(`/${orgSlug}/tasks?view=calendar&date=${ymdKey(date)}`);
					}}
					captionLayout="dropdown"
				/>
			</CardContent>
		</Card>
	);
}
