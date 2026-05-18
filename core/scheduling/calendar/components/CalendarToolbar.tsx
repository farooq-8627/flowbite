"use client";

/**
 * CalendarToolbar — top-row controls for the calendar view.
 *
 * STATUS: IMPLEMENTED.
 *
 * Layout (40px tall row, mirrors `EntityPageLayout`'s slim-toolbar
 * convention):
 *   ┌─────────────────────────────────────────────────────────────────┐
 *   │ ◂ ▸ Today  May 2026                  [Month][Week][Day][List]   │
 *   └─────────────────────────────────────────────────────────────────┘
 *
 * Reuses `<ToggleGroup>` from `components/ui/toggle-group` for the view
 * picker and our shared `<Button>` primitive for the prev/next/today.
 *
 * The title formatter lives in `lib/calendar-grid.ts` so it's testable
 * in isolation and the panel toolbar (no view picker) shares the same
 * label.
 */

import { ChevronLeftIcon, ChevronRightIcon, SearchIcon, XIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { cn } from "@/lib/utils";
import { type CalendarViewMode, formatViewTitle, shiftAnchor } from "../lib/calendar-grid";

const VIEW_OPTIONS: Array<{ value: CalendarViewMode; label: string }> = [
	{ value: "month", label: "Month" },
	{ value: "week", label: "Week" },
	{ value: "day", label: "Day" },
	// "List" intentionally omitted from the calendar's internal toolbar.
	// Reminders' outer view toggle (Today / List / Calendar) already has a
	// dedicated "List" mode that surfaces the DataTable. Showing a second
	// "List" inside the calendar duplicates the affordance and confuses
	// the URL contract — the calendar's `cal=list` and the page's
	// `view=list` were doing visually-similar things but reading from
	// different code paths. The outer toggle owns "List".
];

interface CalendarToolbarProps {
	viewMode: CalendarViewMode;
	onViewModeChange: (v: CalendarViewMode) => void;
	selectedDate: Date;
	onSelectDate: (d: Date) => void;
	onToday: () => void;
	/** Optional search input. */
	search?: { value: string; onChange: (v: string) => void; placeholder?: string };
	/** Optional inline filter trigger (e.g. CalendarFilters in a popover). */
	filtersTrigger?: React.ReactNode;
	/** Optional primary action (e.g. "+ New event") on the right edge. */
	primaryAction?: React.ReactNode;
	className?: string;
}

export function CalendarToolbar({
	viewMode,
	onViewModeChange,
	selectedDate,
	onSelectDate,
	onToday,
	search,
	filtersTrigger,
	primaryAction,
	className,
}: CalendarToolbarProps) {
	const title = formatViewTitle(viewMode, selectedDate);

	return (
		<div
			className={cn(
				"flex flex-wrap items-center gap-2 border-b bg-background px-3 py-2",
				className,
			)}
		>
			{/* Nav cluster */}
			<div className="flex items-center gap-1">
				<Button
					type="button"
					size="icon"
					variant="ghost"
					onClick={() => onSelectDate(shiftAnchor(viewMode, selectedDate, "prev"))}
					aria-label="Previous"
					className="size-7"
				>
					<ChevronLeftIcon className="size-4" />
				</Button>
				<Button
					type="button"
					size="icon"
					variant="ghost"
					onClick={() => onSelectDate(shiftAnchor(viewMode, selectedDate, "next"))}
					aria-label="Next"
					className="size-7"
				>
					<ChevronRightIcon className="size-4" />
				</Button>
				<Button
					type="button"
					size="sm"
					variant="outline"
					onClick={onToday}
					className="h-7 px-2 text-xs"
				>
					Today
				</Button>
			</div>

			<h2 className="ms-1 text-base font-semibold tracking-tight">{title}</h2>

			{/* Search (optional) */}
			{search && (
				<div className="relative ms-2 flex items-center">
					<SearchIcon className="pointer-events-none absolute start-2 size-3.5 text-muted-foreground" />
					<Input
						type="text"
						value={search.value}
						onChange={(e) => search.onChange(e.target.value)}
						placeholder={search.placeholder ?? "Search events…"}
						className="h-7 w-44 ps-7 pe-7 text-xs"
					/>
					{search.value && (
						<button
							type="button"
							onClick={() => search.onChange("")}
							aria-label="Clear search"
							className="absolute end-1 flex size-5 items-center justify-center rounded-[var(--radius)] text-muted-foreground hover:bg-accent"
						>
							<XIcon className="size-3" />
						</button>
					)}
				</div>
			)}

			{/* Right side */}
			<div className="ms-auto flex items-center gap-2">
				{filtersTrigger}
				<ToggleGroup
					type="single"
					value={viewMode}
					onValueChange={(v) => v && onViewModeChange(v as CalendarViewMode)}
					className="rounded-[var(--radius)] border bg-background p-0.5"
				>
					{VIEW_OPTIONS.map((opt) => (
						<ToggleGroupItem
							key={opt.value}
							value={opt.value}
							className="h-6 px-2 text-xs"
							aria-label={opt.label}
						>
							{opt.label}
						</ToggleGroupItem>
					))}
				</ToggleGroup>
				{primaryAction}
			</div>
		</div>
	);
}
