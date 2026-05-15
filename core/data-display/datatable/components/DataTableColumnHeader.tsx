"use client";

/**
 * DataTableColumnHeader — clickable header with no dropdown.
 *
 * Click cycles: none → asc → desc → none. Arrow appears only on hover OR
 * when a sort is active. For categorical columns (status, source, etc.) we
 * use a two-state toggle (asc ↔ desc, since there's no meaningful "unsorted"
 * ordering for enums beyond the row insertion order).
 *
 * Uses a tiny vertical chevron pair (`<` stacked `>`) on hover to hint sort
 * is available, without a bulky arrow icon taking permanent space.
 */

import type { Column } from "@tanstack/react-table";
import { ChevronDown, ChevronUp } from "lucide-react";
import { cn } from "@/lib/utils";

interface DataTableColumnHeaderProps<TData, TValue> extends React.ComponentProps<"button"> {
	column: Column<TData, TValue>;
	title: string;
}

export function DataTableColumnHeader<TData, TValue>({
	column,
	title,
	className,
}: DataTableColumnHeaderProps<TData, TValue>) {
	if (!column.getCanSort()) {
		return <span className={cn("text-xs font-semibold", className)}>{title}</span>;
	}

	const sorted = column.getIsSorted(); // false | "asc" | "desc"

	return (
		<button
			type="button"
			onClick={() => {
				if (sorted === false)
					column.toggleSorting(false); // asc
				else if (sorted === "asc")
					column.toggleSorting(true); // desc
				else column.clearSorting(); // back to none
			}}
			className={cn(
				"group/hdr inline-flex cursor-pointer items-center gap-1 text-xs font-semibold hover:text-foreground focus-visible:outline-none",
				sorted ? "text-foreground" : "text-muted-foreground",
				className,
			)}
		>
			<span>{title}</span>
			<span
				className={cn(
					"inline-flex flex-col items-center leading-none transition-opacity",
					sorted ? "opacity-100" : "opacity-0 group-hover/hdr:opacity-60",
				)}
				aria-hidden
			>
				<ChevronUp
					className={cn(
						"size-2.5 -mb-0.5",
						sorted === "asc" ? "text-foreground" : "text-muted-foreground",
					)}
				/>
				<ChevronDown
					className={cn(
						"size-2.5 -mt-0.5",
						sorted === "desc" ? "text-foreground" : "text-muted-foreground",
					)}
				/>
			</span>
		</button>
	);
}
