"use client";

/**
 * CalendarFilters — three source toggles (Reminders / Activities / Deals).
 *
 * STATUS: IMPLEMENTED.
 *
 * Bound to the `?sources=` URL param via `useCalendarFilters()` so deep
 * linking + back/forward both restore the user's filter state.
 *
 * Visual contract:
 *   ☑ ● Reminders            (orange dot + checkbox + label)
 *   ☑ ● Meetings & calls     (indigo dot)
 *   ☑ ● Deal close dates     (blue dot)
 *
 * Layout is vertical (sidebar consumer) by default. Pass
 * `direction="horizontal"` to lay them out in a row (toolbar consumer).
 */

import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";
import { useCalendarFilters } from "../hooks/useCalendarViewMode";
import { EVENT_SOURCE_META, EVENT_SOURCE_ORDER } from "../lib/event-source-colors";

interface CalendarFiltersProps {
	direction?: "vertical" | "horizontal";
	className?: string;
}

export function CalendarFilters({ direction = "vertical", className }: CalendarFiltersProps) {
	const { isActive, toggle } = useCalendarFilters();

	return (
		<ul
			className={cn(
				"grid gap-1.5",
				direction === "horizontal" && "grid-flow-col auto-cols-max",
				className,
			)}
			aria-label="Calendar source filters"
		>
			{EVENT_SOURCE_ORDER.map((source) => {
				const meta = EVENT_SOURCE_META[source];
				const checkboxId = `cal-filter-${source}`;
				const checked = isActive(source);
				return (
					<li key={source} className="flex items-center gap-2">
						<Checkbox
							id={checkboxId}
							checked={checked}
							onCheckedChange={() => toggle(source)}
							aria-label={meta.label}
						/>
						<label
							htmlFor={checkboxId}
							className="flex min-w-0 flex-1 cursor-pointer items-center gap-1.5 text-xs"
							title={meta.description}
						>
							<span
								aria-hidden
								className="inline-block size-2 shrink-0 rounded-full"
								style={{ backgroundColor: meta.color }}
							/>
							<span className={cn("truncate", !checked && "text-muted-foreground")}>
								{meta.label}
							</span>
						</label>
					</li>
				);
			})}
		</ul>
	);
}
