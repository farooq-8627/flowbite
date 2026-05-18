"use client";

/**
 * CalendarSidebar — sidebar of the org-wide Calendar page.
 *
 * STATUS: IMPLEMENTED.
 *
 * Layout:
 *   ┌──────────────────────┐
 *   │ ┌─────────────────┐  │
 *   │ │ + New event     │  │   ← primary action
 *   │ └─────────────────┘  │
 *   │                      │
 *   │ [ mini calendar ]    │   ← shadcn <Calendar> single-day picker
 *   │                      │
 *   │ Sources              │
 *   │ ☑ ● Reminders        │   ← <CalendarFilters> vertical
 *   │ ☑ ● Meetings & calls │
 *   │ ☑ ● Deal close dates │
 *   │                      │
 *   │ Today's reminders    │   ← optional teaser; reuses <ReminderCard>
 *   │ ◯ Follow up Acme...  │
 *   │ ◯ Demo for Tara...   │
 *   └──────────────────────┘
 *
 * Mounted ONLY on the org-wide CalendarView. Embedded panels render
 * `CalendarMain` directly.
 */

import { BellPlusIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { CalendarFilters } from "./CalendarFilters";

interface CalendarSidebarProps {
	selectedDate: Date;
	onSelectDate: (d: Date) => void;
	canCreate?: boolean;
	onCreate?: () => void;
	className?: string;
}

export function CalendarSidebar({
	selectedDate,
	onSelectDate,
	canCreate,
	onCreate,
	className,
}: CalendarSidebarProps) {
	return (
		<aside
			className={`flex w-full flex-col gap-5 border-e bg-background p-3 xl:w-72 ${className ?? ""}`}
		>
			{canCreate && (
				<Button onClick={onCreate} className="w-full">
					<BellPlusIcon className="me-2 size-4" />
					New event
				</Button>
			)}

			{/* Mini calendar — uses shadcn <Calendar>, no extra deps */}
			<div className="rounded-[var(--radius)] border bg-card p-2">
				<Calendar
					mode="single"
					selected={selectedDate}
					onSelect={(d) => d && onSelectDate(d)}
					captionLayout="dropdown"
				/>
			</div>

			{/* Source filters */}
			<section className="grid gap-2">
				<h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
					Sources
				</h3>
				<CalendarFilters direction="vertical" />
			</section>
		</aside>
	);
}
