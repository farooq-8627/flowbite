"use client";

/**
 * CategoryDotPicker — circular color-swatch popover used in the corner of
 * every note card. Replaces the legacy fixed-color picker.
 *
 * The button itself shows the CURRENT category's bg color as a small dot.
 * Clicking opens a popover listing every non-archived category in display
 * order; picking one fires `onPick(categoryId)` and closes.
 *
 * Pure UI — the parent owns the data fetch + mutation.
 */

import { Check } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import type { Doc, Id } from "@/convex/_generated/dataModel";
import { cn } from "@/lib/utils";

interface CategoryDotPickerProps {
	categories: Doc<"noteCategories">[] | undefined;
	currentCategoryId: Id<"noteCategories"> | undefined;
	onPick: (id: Id<"noteCategories">) => void;
	/** Override the trigger label for screen readers. */
	ariaLabel?: string;
	/** Visual size of the trigger dot (px). Default 18. */
	size?: number;
	/** Add a thin ring around the trigger so it stands out on coloured cards. */
	ringed?: boolean;
}

export function CategoryDotPicker({
	categories,
	currentCategoryId,
	onPick,
	ariaLabel = "Change category",
	size = 18,
	ringed = false,
}: CategoryDotPickerProps) {
	const current = categories?.find((c) => c._id === currentCategoryId);
	const triggerColor = current?.bgColor ?? "#cbd5e1"; // slate-300 fallback

	return (
		<Popover>
			<PopoverTrigger asChild>
				<button
					type="button"
					aria-label={ariaLabel}
					title={current?.name ?? "Pick category"}
					className={cn(
						"inline-flex shrink-0 items-center justify-center rounded-full transition-transform hover:scale-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
						ringed && "ring-2 ring-background",
					)}
					style={{
						width: size,
						height: size,
						backgroundColor: triggerColor,
					}}
				/>
			</PopoverTrigger>
			<PopoverContent className="w-56 p-1" align="end">
				<div className="px-2 py-1 text-[11px] uppercase tracking-wide text-muted-foreground">
					Category
				</div>
				<div className="flex flex-col gap-0.5">
					{(categories ?? []).map((c) => (
						<button
							key={c._id}
							type="button"
							onClick={() => onPick(c._id)}
							className={cn(
								"flex w-full items-center gap-2 rounded-[var(--radius)] px-2 py-1.5 text-sm hover:bg-accent",
								c._id === currentCategoryId && "bg-accent",
							)}
						>
							<span
								className="size-3 shrink-0 rounded-full"
								style={{ backgroundColor: c.bgColor }}
							/>
							<span className="flex-1 truncate text-start">{c.name}</span>
							{c._id === currentCategoryId && (
								<Check className="size-3.5 text-primary" />
							)}
						</button>
					))}
					{(!categories || categories.length === 0) && (
						<div className="px-2 py-2 text-xs text-muted-foreground">
							No categories yet.
						</div>
					)}
				</div>
			</PopoverContent>
		</Popover>
	);
}
