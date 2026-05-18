"use client";

/**
 * TimelineFilters — chip row that filters the visible entries client-side.
 *
 * Why client-side
 * ───────────────
 * Each loaded page is at most 50 entries; filtering one page is trivial.
 * Server-side filtering would require six different query branches and
 * complicate the cursor logic without any user-visible benefit.
 *
 * Why a chip row (not a dropdown)
 * ───────────────────────────────
 * The 6 options are mutually exclusive (radio-group semantics) and small
 * enough to render in one line. A dropdown would hide the current state.
 *
 * RTL safety
 *   Uses `gap-2` and logical `me-*` only. No physical directional spacing.
 */

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { TimelineFilter } from "./types";

interface TimelineFiltersProps {
	value: TimelineFilter;
	onChange: (next: TimelineFilter) => void;
	/** Optional — counts to render per chip. When unset, no badges. */
	counts?: Partial<Record<TimelineFilter, number>>;
	className?: string;
}

const OPTIONS: { value: TimelineFilter; label: string }[] = [
	{ value: "all", label: "All" },
	{ value: "notes", label: "Notes" },
	{ value: "reminders", label: "Reminders" },
	{ value: "activity", label: "Activity" },
	{ value: "ai", label: "AI" },
	{ value: "system", label: "System" },
];

export function TimelineFilters({ value, onChange, counts, className }: TimelineFiltersProps) {
	return (
		<div
			role="radiogroup"
			aria-label="Filter timeline entries"
			className={cn("flex flex-wrap items-center gap-1.5", className)}
		>
			{OPTIONS.map((opt) => {
				const active = value === opt.value;
				const count = counts?.[opt.value];
				return (
					<Button
						key={opt.value}
						type="button"
						role="radio"
						aria-checked={active}
						size="sm"
						variant={active ? "default" : "outline"}
						onClick={() => onChange(opt.value)}
						className={cn(
							"h-7 rounded-[var(--radius)] px-2.5 text-xs",
							!active && "border-dashed",
						)}
					>
						{opt.label}
						{typeof count === "number" && (
							<span
								className={cn(
									"ms-1.5 rounded-[calc(var(--radius)-2px)] px-1 text-[10px]",
									active
										? "bg-primary-foreground/20 text-primary-foreground"
										: "bg-muted text-muted-foreground",
								)}
							>
								{count}
							</span>
						)}
					</Button>
				);
			})}
		</div>
	);
}
