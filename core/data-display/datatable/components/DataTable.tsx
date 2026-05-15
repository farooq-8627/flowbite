"use client";

/**
 * DataTable — entity list view grid.
 *
 * Layout contract:
 *   - Takes full height of its parent (parent must be `flex min-h-0 flex-1`).
 *   - ONE scroll container owns both axes: horizontal when columns exceed the
 *     viewport, vertical when rows do. Nothing outside this container scrolls.
 *   - Sticky `<thead>` stays pinned on y-scroll inside the container.
 *   - Pagination is rendered internally below the scroll container.
 *
 * We render a raw `<table>` (not shadcn's Table wrapper) so we avoid the
 * double-scroll container that was preventing x-scroll inside the entity
 * page shell.
 */

import { flexRender, type Table as TanstackTable } from "@tanstack/react-table";
import type * as React from "react";
import { cn } from "@/lib/utils";
import { getCommonPinningStyles } from "../utils/data-table";
import { DataTablePagination } from "./DataTablePagination";

interface DataTableProps<TData> extends React.ComponentProps<"div"> {
	table: TanstackTable<TData>;
	/** Bulk action bar — only shown when rows are selected */
	actionBar?: React.ReactNode;
	/** When true, hide the built-in pagination (caller renders its own). */
	hidePagination?: boolean;
	/** Page-size options forwarded to the pagination. */
	pageSizeOptions?: number[];
	onRowClick?: (row: TData) => void;
}

export function DataTable<TData>({
	table,
	actionBar,
	hidePagination,
	pageSizeOptions = [10, 25, 50, 100],
	onRowClick,
	children,
}: DataTableProps<TData>) {
	return (
		<div className="flex h-full min-h-0 min-w-0 flex-col gap-2">
			{children}

			{/* Scrollable shell: border outside, both-axis scroll inside. */}
			<div className="relative flex min-h-0 min-w-0 flex-1 overflow-hidden rounded-[var(--radius)] border">
				<div className="min-h-0 min-w-0 flex-1 overflow-auto">
					<table className="w-full min-w-max caption-bottom text-xs">
						<thead className="sticky top-0 z-10 bg-muted/70 backdrop-blur-sm [&_tr]:border-b">
							{table.getHeaderGroups().map((headerGroup) => (
								<tr key={headerGroup.id} className="border-b hover:bg-transparent">
									{headerGroup.headers.map((header) => (
										<th
											key={header.id}
											colSpan={header.colSpan}
											className="h-9 whitespace-nowrap px-2 text-start align-middle text-xs font-semibold text-foreground"
											style={getCommonPinningStyles({
												column: header.column,
											})}
										>
											{header.isPlaceholder
												? null
												: flexRender(
														header.column.columnDef.header,
														header.getContext(),
													)}
										</th>
									))}
								</tr>
							))}
						</thead>
						<tbody className="[&_tr:last-child]:border-0">
							{table.getRowModel().rows?.length ? (
								table.getRowModel().rows.map((row) => (
									<tr
										key={row.id}
										data-state={row.getIsSelected() && "selected"}
										className={cn(
											"border-b text-xs transition-colors hover:bg-muted/50 data-[state=selected]:bg-muted",
											onRowClick && "cursor-pointer",
										)}
										onClick={() => onRowClick?.(row.original)}
									>
										{row.getVisibleCells().map((cell) => (
											<td
												key={cell.id}
												className="whitespace-nowrap px-2 py-2 align-middle"
												style={getCommonPinningStyles({
													column: cell.column,
												})}
											>
												{flexRender(
													cell.column.columnDef.cell,
													cell.getContext(),
												)}
											</td>
										))}
									</tr>
								))
							) : (
								<tr>
									<td
										colSpan={table.getAllColumns().length}
										className="h-24 text-center text-sm text-muted-foreground"
									>
										No results.
									</td>
								</tr>
							)}
						</tbody>
					</table>
				</div>
			</div>

			{!hidePagination && (
				<DataTablePagination table={table} pageSizeOptions={pageSizeOptions} />
			)}
			{actionBar && table.getFilteredSelectedRowModel().rows.length > 0 && actionBar}
		</div>
	);
}
