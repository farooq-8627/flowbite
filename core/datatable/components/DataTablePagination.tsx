"use client";

import type { Table } from "@tanstack/react-table";
import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";

interface DataTablePaginationProps<TData> {
	table: Table<TData>;
	pageSizeOptions?: number[];
}

export function DataTablePagination<TData>({
	table,
	pageSizeOptions = [10, 25, 50, 100],
}: DataTablePaginationProps<TData>) {
	const totalRows = table.getFilteredRowModel().rows.length;
	const selected = table.getFilteredSelectedRowModel().rows.length;
	const pageIndex = table.getState().pagination.pageIndex;
	const pageSize = table.getState().pagination.pageSize;
	const from = totalRows === 0 ? 0 : pageIndex * pageSize + 1;
	const to = Math.min((pageIndex + 1) * pageSize, totalRows);

	return (
		<div className="flex w-full shrink-0 flex-wrap items-center justify-between gap-x-3 gap-y-1 text-xs text-muted-foreground">
			<div className="flex items-center gap-3">
				{selected > 0 ? (
					<span>
						{selected} of {totalRows} selected
					</span>
				) : (
					<span className="tabular-nums">
						{from}–{to} of {totalRows}
					</span>
				)}
			</div>
			<div className="flex items-center gap-3">
				<div className="hidden items-center gap-1.5 sm:flex">
					<span>Rows</span>
					<Select
						value={`${pageSize}`}
						onValueChange={(value) => table.setPageSize(Number(value))}
					>
						<SelectTrigger size="sm" className="h-7 w-16 text-xs">
							<SelectValue />
						</SelectTrigger>
						<SelectContent side="top" align="center">
							{pageSizeOptions.map((size) => (
								<SelectItem key={size} value={`${size}`} className="text-xs">
									{size}
								</SelectItem>
							))}
						</SelectContent>
					</Select>
				</div>
				<div className="flex items-center gap-0.5 rtl:[&>button>svg]:-scale-100">
					<Button
						variant="ghost"
						size="icon"
						className="size-7"
						onClick={() => table.setPageIndex(0)}
						disabled={!table.getCanPreviousPage()}
						aria-label="First page"
					>
						<ChevronsLeft className="size-3.5" />
					</Button>
					<Button
						variant="ghost"
						size="icon"
						className="size-7"
						onClick={() => table.previousPage()}
						disabled={!table.getCanPreviousPage()}
						aria-label="Previous page"
					>
						<ChevronLeft className="size-3.5" />
					</Button>
					<span className="px-1 tabular-nums">
						{pageIndex + 1} / {table.getPageCount() || 1}
					</span>
					<Button
						variant="ghost"
						size="icon"
						className="size-7"
						onClick={() => table.nextPage()}
						disabled={!table.getCanNextPage()}
						aria-label="Next page"
					>
						<ChevronRight className="size-3.5" />
					</Button>
					<Button
						variant="ghost"
						size="icon"
						className="size-7"
						onClick={() => table.setPageIndex(table.getPageCount() - 1)}
						disabled={!table.getCanNextPage()}
						aria-label="Last page"
					>
						<ChevronsRight className="size-3.5" />
					</Button>
				</div>
			</div>
		</div>
	);
}
