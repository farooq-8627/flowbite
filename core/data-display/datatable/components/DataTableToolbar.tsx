"use client";

import type { Column, Table } from "@tanstack/react-table";
import { X } from "lucide-react";
import * as React from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { DataTableDateFilter } from "./DataTableDateFilter";
import { DataTableFacetedFilter } from "./DataTableFacetedFilter";
import { DataTableSliderFilter } from "./DataTableSliderFilter";

interface DataTableToolbarProps<TData> extends React.ComponentProps<"div"> {
	table: Table<TData>;
}

export function DataTableToolbar<TData>({
	table,
	children,
	className,
	...props
}: DataTableToolbarProps<TData>) {
	const isFiltered = table.getState().columnFilters.length > 0;

	const columns = React.useMemo(
		() => table.getAllColumns().filter((col) => col.getCanFilter()),
		[table],
	);

	const onReset = React.useCallback(() => table.resetColumnFilters(), [table]);

	return (
		<div
			role="toolbar"
			aria-orientation="horizontal"
			className={cn("flex w-full items-start justify-between gap-2 p-1", className)}
			{...props}
		>
			<div className="flex flex-1 flex-wrap items-center gap-2">
				{columns.map((column) => (
					<DataTableToolbarFilter key={column.id} column={column} />
				))}
				{isFiltered && (
					<Button
						aria-label="Reset filters"
						variant="outline"
						size="sm"
						className="border-dashed"
						onClick={onReset}
					>
						<X className="me-1 size-4" />
						Reset
					</Button>
				)}
			</div>
			<div className="flex items-center gap-2">
				{children}
				{/* <DataTableViewOptions table={table} /> */}
			</div>
		</div>
	);
}

function DataTableToolbarFilter<TData>({ column }: { column: Column<TData> }) {
	const meta = column.columnDef.meta;
	if (!meta?.variant) return null;

	switch (meta.variant) {
		case "text":
			return (
				<Input
					placeholder={meta.placeholder ?? meta.label}
					value={(column.getFilterValue() as string) ?? ""}
					onChange={(e) => column.setFilterValue(e.target.value)}
					className="h-8 w-40 lg:w-56"
				/>
			);
		case "number":
			return (
				<div className="relative">
					<Input
						type="number"
						inputMode="numeric"
						placeholder={meta.placeholder ?? meta.label}
						value={(column.getFilterValue() as string) ?? ""}
						onChange={(e) => column.setFilterValue(e.target.value)}
						className={cn("h-8 w-[120px]", meta.unit && "pe-8")}
					/>
					{meta.unit && (
						<span className="bg-accent text-muted-foreground absolute top-0 end-0 bottom-0 flex items-center rounded-e-md px-2 text-sm">
							{meta.unit}
						</span>
					)}
				</div>
			);
		case "range":
			return <DataTableSliderFilter column={column} title={meta.label ?? column.id} />;
		case "date":
		case "dateRange":
			return (
				<DataTableDateFilter
					column={column}
					title={meta.label ?? column.id}
					multiple={meta.variant === "dateRange"}
				/>
			);
		case "select":
		case "multiSelect":
			return (
				<DataTableFacetedFilter
					column={column}
					title={meta.label ?? column.id}
					options={meta.options ?? []}
					multiple={meta.variant === "multiSelect"}
				/>
			);
		default:
			return null;
	}
}
