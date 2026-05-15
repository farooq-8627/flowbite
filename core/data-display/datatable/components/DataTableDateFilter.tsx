"use client";

import type { Column } from "@tanstack/react-table";
import { CalendarIcon, XCircle } from "lucide-react";
import * as React from "react";
import type { DateRange } from "react-day-picker";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Separator } from "@/components/ui/separator";
import { formatDate } from "@/lib/format";

type DateSelection = Date[] | DateRange;

function getIsDateRange(value: DateSelection): value is DateRange {
	return value && typeof value === "object" && !Array.isArray(value);
}

function parseAsDate(ts: number | string | undefined): Date | undefined {
	if (!ts) return undefined;
	const n = typeof ts === "string" ? Number(ts) : ts;
	const d = new Date(n);
	return !Number.isNaN(d.getTime()) ? d : undefined;
}

function parseColumnFilterValue(value: unknown) {
	if (value === null || value === undefined) return [];
	if (Array.isArray(value))
		return value.map((i) => (typeof i === "number" || typeof i === "string" ? i : undefined));
	if (typeof value === "string" || typeof value === "number") return [value];
	return [];
}

interface DataTableDateFilterProps<TData> {
	column: Column<TData, unknown>;
	title?: string;
	multiple?: boolean;
}

export function DataTableDateFilter<TData>({
	column,
	title,
	multiple,
}: DataTableDateFilterProps<TData>) {
	const columnFilterValue = column.getFilterValue();

	const selectedDates = React.useMemo<DateSelection>(() => {
		if (!columnFilterValue) return multiple ? { from: undefined, to: undefined } : [];
		if (multiple) {
			const ts = parseColumnFilterValue(columnFilterValue);
			return { from: parseAsDate(ts[0]), to: parseAsDate(ts[1]) };
		}
		const ts = parseColumnFilterValue(columnFilterValue);
		const d = parseAsDate(ts[0]);
		return d ? [d] : [];
	}, [columnFilterValue, multiple]);

	const onSelect = React.useCallback(
		(date: Date | DateRange | undefined) => {
			if (!date) {
				column.setFilterValue(undefined);
				return;
			}
			if (multiple && !("getTime" in date)) {
				const from = date.from?.getTime();
				const to = date.to?.getTime();
				column.setFilterValue(from || to ? [from, to] : undefined);
			} else if (!multiple && "getTime" in date) {
				column.setFilterValue(date.getTime());
			}
		},
		[column, multiple],
	);

	const onReset = React.useCallback(
		(e: React.MouseEvent) => {
			e.stopPropagation();
			column.setFilterValue(undefined);
		},
		[column],
	);

	const hasValue = React.useMemo(() => {
		if (multiple) {
			if (!getIsDateRange(selectedDates)) return false;
			return selectedDates.from || selectedDates.to;
		}
		if (!Array.isArray(selectedDates)) return false;
		return selectedDates.length > 0;
	}, [multiple, selectedDates]);

	const label = React.useMemo(() => {
		if (multiple) {
			if (!getIsDateRange(selectedDates)) return null;
			const has = selectedDates.from || selectedDates.to;
			const text = has
				? selectedDates.from && selectedDates.to
					? `${formatDate(selectedDates.from)} - ${formatDate(selectedDates.to)}`
					: formatDate(selectedDates.from ?? selectedDates.to)
				: "Select date range";
			return (
				<span className="flex items-center gap-2">
					<span>{title}</span>
					{has && (
						<>
							<Separator
								orientation="vertical"
								className="mx-0.5 data-[orientation=vertical]:h-4"
							/>
							<span>{text}</span>
						</>
					)}
				</span>
			);
		}
		if (getIsDateRange(selectedDates)) return null;
		const has = selectedDates.length > 0;
		const text = has ? formatDate(selectedDates[0]) : "Select date";
		return (
			<span className="flex items-center gap-2">
				<span>{title}</span>
				{has && (
					<>
						<Separator
							orientation="vertical"
							className="mx-0.5 data-[orientation=vertical]:h-4"
						/>
						<span>{text}</span>
					</>
				)}
			</span>
		);
	}, [selectedDates, multiple, title]);

	return (
		<Popover>
			<PopoverTrigger asChild>
				<Button variant="outline" size="sm" className="border-dashed">
					{hasValue ? (
						<button
							type="button"
							aria-label={`Clear ${title} filter`}
							onClick={onReset}
							className="focus-visible:ring-ring rounded-[var(--radius)] opacity-70 transition-opacity hover:opacity-100 focus-visible:ring-1 focus-visible:outline-none"
						>
							<XCircle className="size-4" />
						</button>
					) : (
						<CalendarIcon className="size-4" />
					)}
					{label}
				</Button>
			</PopoverTrigger>
			<PopoverContent className="w-auto p-0" align="start">
				{multiple ? (
					<Calendar
						mode="range"
						selected={
							getIsDateRange(selectedDates)
								? selectedDates
								: { from: undefined, to: undefined }
						}
						onSelect={onSelect}
					/>
				) : (
					<Calendar
						mode="single"
						selected={!getIsDateRange(selectedDates) ? selectedDates[0] : undefined}
						onSelect={onSelect}
					/>
				)}
			</PopoverContent>
		</Popover>
	);
}
