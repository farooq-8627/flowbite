"use client";

/**
 * TasksDataTable — shared table for the /tasks page AND the dashboard
 * Live-Tasks widget.
 *
 * Two modes via the `compact` prop:
 *
 *   - **Full** (default; used by `TasksView::ListMode`) — every column
 *     from `useTaskColumns`, URL-state via `useDataTable`, the
 *     `<DataTableToolbar>` filter chip row, and `<DataTableViewOptions>`
 *     in the toolbar. Behaviour is identical to the inline DataTable
 *     block this component replaced — the extraction is purely a
 *     refactor so the dashboard widget can reuse the same surface.
 *
 *   - **Compact** (`compact: true`; used by `LiveTasksWidget`) — a
 *     minimal 5-column read-only table:
 *       ✓ complete · Title · Type · Due · Status · Assignee
 *     row click → `onEdit`. No toolbar, no view options, no select column,
 *     no actions menu, no faceted filters. Plain `useReactTable` — does
 *     NOT use the URL-state `useDataTable` hook so a dashboard remount
 *     never writes `?page=&perPage=` into the address bar.
 *
 * Per-row data per AGENTS.md "per-row data on a list view comes from one
 * batched query" — `<AssigneeCell>` and `<TaskQuickComplete>` consume
 * the org-provider context, never their own per-row queries.
 *
 * Stage 3 of `DASHBOARD-V2-PLAN.md` (2026-05-29).
 */

import {
	flexRender,
	getCoreRowModel,
	getPaginationRowModel,
	getSortedRowModel,
	useReactTable,
} from "@tanstack/react-table";
import { format, formatDistanceToNow, isThisYear } from "date-fns";
import { CheckCircle2Icon } from "lucide-react";
import { useMemo } from "react";
import type { Doc } from "@/convex/_generated/dataModel";
import { DataTable } from "@/core/data-display/datatable/components/DataTable";
import { DataTableToolbar } from "@/core/data-display/datatable/components/DataTableToolbar";
import { DataTableViewOptions } from "@/core/data-display/datatable/components/DataTableViewOptions";
import { useDataTable } from "@/core/data-display/datatable/hooks/useDataTable";
import { AssigneeCell } from "@/core/entities/shared/components/AssigneeCell";
import { cn } from "@/lib/utils";
import { useTaskColumns } from "./columns/useTaskColumns";
import { TaskQuickComplete } from "./TaskQuickComplete";
import { TaskStatusBadge } from "./TaskStatusBadge";
import { TaskTypeBadge } from "./TaskTypeBadge";

type TaskRow = Doc<"tasks">;

interface TasksDataTableProps {
	/** Tasks to render (already filtered + sorted by the parent). */
	data: TaskRow[];
	/**
	 * Compact = dashboard-widget-shaped table (5 cols, no toolbar, no
	 * URL state). Full = the original /tasks page experience.
	 */
	compact?: boolean;
	/** Row-click + actions menu wiring. */
	onEdit?: (row: TaskRow) => void;
	/** Row-action menu delete. Full-mode only. */
	onDelete?: (row: TaskRow) => void;
	/** Current user id — used by full-mode column gates. */
	currentUserId?: string;
	/** Override the wall clock — keeps tests deterministic. */
	now?: number;
	/** Compact mode page size. Defaults to 10 (the widget cap). */
	compactPageSize?: number;
}

export function TasksDataTable(props: TasksDataTableProps) {
	if (props.compact) {
		return <CompactTasksTable {...props} />;
	}
	return <FullTasksTable {...props} />;
}

// ─── Full mode — identical to the inline TasksView::ListMode table ──────────

function FullTasksTable({
	data,
	onEdit = noop,
	onDelete = noop,
	currentUserId,
	now = Date.now(),
}: TasksDataTableProps) {
	const columns = useTaskColumns({
		now,
		onEdit,
		onDelete,
		currentUserId,
	});

	const { table } = useDataTable<TaskRow>({
		data,
		columns,
		pageCount: Math.max(1, Math.ceil(data.length / 25)),
		initialState: {
			pagination: { pageSize: 25, pageIndex: 0 },
			sorting: [{ id: "dueAt", desc: false }],
		},
		getRowId: (row) => row._id,
	});

	return (
		<DataTable table={table} pageSizeOptions={[10, 25, 50, 100]} onRowClick={onEdit}>
			<DataTableToolbar table={table}>
				<DataTableViewOptions table={table} />
			</DataTableToolbar>
		</DataTable>
	);
}

// ─── Compact mode — dashboard widget table ──────────────────────────────────

function CompactTasksTable({
	data,
	onEdit,
	now = Date.now(),
	compactPageSize = 10,
}: TasksDataTableProps) {
	const columns = useMemo(() => buildCompactColumns({ now }), [now]);

	const table = useReactTable({
		data,
		columns,
		getRowId: (row) => row._id,
		getCoreRowModel: getCoreRowModel(),
		getSortedRowModel: getSortedRowModel(),
		getPaginationRowModel: getPaginationRowModel(),
		initialState: {
			pagination: { pageSize: compactPageSize, pageIndex: 0 },
			sorting: [{ id: "dueAt", desc: false }],
		},
	});

	if (data.length === 0) {
		return (
			<div className="flex h-full flex-col items-center justify-center gap-2 rounded-[var(--radius)] border border-dashed bg-muted/30 px-4 py-8 text-center">
				<CheckCircle2Icon className="size-6 text-muted-foreground" aria-hidden />
				<p className="text-sm font-medium text-foreground">All clear</p>
				<p className="text-xs text-muted-foreground">
					No open tasks right now. Create one to keep the day moving.
				</p>
			</div>
		);
	}

	return (
		<div className="relative overflow-hidden rounded-[var(--radius)] border">
			<div className="overflow-auto">
				<table className="w-full caption-bottom text-xs">
					<thead className="bg-muted/60 [&_tr]:border-b">
						{table.getHeaderGroups().map((headerGroup) => (
							<tr key={headerGroup.id}>
								{headerGroup.headers.map((header) => (
									<th
										key={header.id}
										className="h-8 whitespace-nowrap px-2 text-start align-middle text-[11px] font-medium uppercase tracking-wide text-muted-foreground"
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
						{table.getRowModel().rows.map((row) => (
							<tr
								key={row.id}
								className={cn(
									"border-b text-xs transition-colors",
									onEdit && "cursor-pointer hover:bg-accent/40",
								)}
								onClick={() => onEdit?.(row.original)}
							>
								{row.getVisibleCells().map((cell) => (
									<td
										key={cell.id}
										className="whitespace-nowrap px-2 py-1.5 align-middle"
									>
										{flexRender(cell.column.columnDef.cell, cell.getContext())}
									</td>
								))}
							</tr>
						))}
					</tbody>
				</table>
			</div>
		</div>
	);
}

// ─── Compact column builder (no hooks — keeps the table render-only) ────────

function buildCompactColumns({ now }: { now: number }) {
	type Col = {
		id: string;
		header: () => React.ReactNode;
		cell: (info: { row: { original: TaskRow } }) => React.ReactNode;
		accessorFn?: (row: TaskRow) => unknown;
	};

	const columns: Col[] = [
		{
			id: "complete",
			header: () => <span className="sr-only">Complete</span>,
			cell: ({ row }) => <TaskQuickComplete task={row.original} size="xs" />,
		},
		{
			id: "title",
			header: () => <span>Title</span>,
			cell: ({ row }) => (
				<span
					className={cn(
						"truncate font-medium text-foreground",
						row.original.status === "completed" && "text-muted-foreground line-through",
					)}
					title={row.original.title}
				>
					{row.original.title}
				</span>
			),
		},
		{
			id: "type",
			header: () => <span>Type</span>,
			cell: ({ row }) => <TaskTypeBadge type={row.original.type} size="xs" />,
		},
		{
			id: "dueAt",
			header: () => <span>Due</span>,
			cell: ({ row }) => (
				<span
					className="text-xs text-muted-foreground tabular-nums"
					title={format(row.original.dueAt, "PPP p")}
				>
					{formatDueShort(row.original.dueAt)}
				</span>
			),
			accessorFn: (row) => row.dueAt,
		},
		{
			id: "status",
			header: () => <span>Status</span>,
			cell: ({ row }) => <TaskStatusBadge task={row.original} now={now} size="xs" />,
		},
		{
			id: "assignedTo",
			header: () => <span>Assignee</span>,
			cell: ({ row }) => (
				<AssigneeCell userId={row.original.assignedTo} show={["avatar", "name"]} />
			),
		},
	];

	// Cast to TanStack ColumnDef shape — we omit the bits TanStack doesn't
	// need for our flat compact table (filterFn, meta variants, etc.).
	return columns as unknown as Parameters<typeof useReactTable<TaskRow>>[0]["columns"];
}

function formatDueShort(ts: number): string {
	const ONE_WEEK = 7 * 24 * 60 * 60 * 1000;
	const diff = Math.abs(ts - Date.now());
	if (diff < ONE_WEEK) return formatDistanceToNow(ts, { addSuffix: true });
	return isThisYear(ts) ? format(ts, "MMM d, h:mm a") : format(ts, "MMM d, yyyy");
}

function noop() {
	/* noop */
}
