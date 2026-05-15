"use client";

/**
 * EntityListPage — renders the DataTable or KanbanBoard inside EntityPageLayout.
 *
 * Slots:
 *   - `leading`      — left side of the toolbar (e.g. a muted count pill)
 *   - `aboveBody`    — content above the DataTable/Board (e.g. selection toolbar)
 *   - `toolbarExtras`— render prop for toolbar extras based on the table instance
 *   - `search`       — wired straight into EntityPageLayout's toolbar search
 *
 * Body height is driven by `flex min-h-0 flex-1` so DataTable/Kanban own their
 * own scroll. No duplicate pagination — DataTable renders its own.
 */

import type { ColumnDef, Table } from "@tanstack/react-table";
import type { Id } from "@/convex/_generated/dataModel";
import { DataTable } from "@/core/data-display/datatable/components/DataTable";
import { DataTableViewOptions } from "@/core/data-display/datatable/components/DataTableViewOptions";
import { useDataTable } from "@/core/data-display/datatable/hooks/useDataTable";
import {
	KanbanBoard,
	type KanbanColumnConfig,
} from "@/core/data-display/kanban/components/KanbanBoard";
import { EmptyState } from "../shared/components/EmptyState";
import type { EntitySlot, ViewKind } from "../shared/types";
import { EntityPageLayout, type PrimaryActionConfig } from "./EntityPageLayout";

interface EntityListPageProps<TRow extends { id: string }> {
	slot: EntitySlot;
	items: TRow[] | undefined;
	columns: ColumnDef<TRow, unknown>[];
	views?: ViewKind[];
	view: ViewKind;
	onViewChange: (v: ViewKind) => void;
	primaryAction?: PrimaryActionConfig;
	orgId?: Id<"orgs">;
	/** Optional search field. Wired to table global filter when provided. */
	search?: {
		value: string;
		onChange: (v: string) => void;
		placeholder?: string;
	};
	/** Render prop for extra toolbar controls that need access to the table. */
	renderToolbarExtras?: (table: Table<TRow>) => React.ReactNode;
	/** Rendered above the DataTable / Board body (selection toolbar, filter row). */
	aboveBody?: (table: Table<TRow>) => React.ReactNode;
	// Board props
	boardColumns?: KanbanColumnConfig[];
	itemsByColumnId?: Record<string, TRow[]>;
	renderCard?: (item: TRow, isDragging: boolean) => React.ReactNode;
	onCardMove?: (itemId: string, fromColumnId: string, toColumnId: string) => Promise<void>;
	renderColumnFooter?: (columnId: string) => React.ReactNode;
	onAddToColumn?: (columnId: string) => void;
	// Empty state
	emptyTitle?: string;
	emptyDescription?: string;
	emptyAction?: React.ReactNode;
}

export function EntityListPage<TRow extends { id: string }>({
	slot: _slot,
	items,
	columns,
	views = ["list", "board"],
	view,
	onViewChange,
	primaryAction,
	orgId,
	search,
	renderToolbarExtras,
	aboveBody,
	boardColumns,
	itemsByColumnId,
	renderCard,
	onCardMove,
	renderColumnFooter,
	onAddToColumn,
	emptyTitle,
	emptyDescription,
	emptyAction,
}: EntityListPageProps<TRow>) {
	const isLoading = items === undefined;

	const { table } = useDataTable({
		data: items ?? [],
		columns,
		pageCount: Math.ceil((items?.length ?? 0) / 25),
		initialState: {
			pagination: { pageSize: 25, pageIndex: 0 },
			// Default sort: newest first. The "createdAt" column is appended by
			// useEntityColumns and reads `_creationTime`. Header clicks override
			// it; clearing the sort returns to this order.
			sorting: [{ id: "createdAt", desc: true }] as never,
		},
		getRowId: (row) => row.id,
	});

	return (
		<EntityPageLayout
			views={views}
			view={view}
			onViewChange={onViewChange}
			primaryAction={primaryAction}
			orgId={orgId}
			search={search}
			toolbarExtras={
				<>
					{renderToolbarExtras?.(table)}
					{view === "list" && <DataTableViewOptions table={table} />}
				</>
			}
		>
			{isLoading ? null : items.length === 0 ? (
				<EmptyState
					title={emptyTitle ?? "Nothing here yet"}
					description={emptyDescription}
					action={emptyAction}
				/>
			) : view === "list" ? (
				<div className="flex min-h-0 min-w-0 flex-1 flex-col gap-2 py-3 xl:p-4">
					{aboveBody?.(table)}
					<DataTable table={table} pageSizeOptions={[10, 25, 50, 100]} />
				</div>
			) : boardColumns && itemsByColumnId && renderCard && onCardMove ? (
				<div className="flex min-h-0 min-w-0 flex-1 flex-col gap-2 py-3 xl:p-4">
					{aboveBody?.(table)}
					<div className="flex min-h-0 min-w-0 flex-1">
						<KanbanBoard
							columns={boardColumns}
							itemsByColumnId={itemsByColumnId}
							renderCard={renderCard}
							onCardMove={onCardMove}
							renderColumnFooter={renderColumnFooter}
							onAddToColumn={onAddToColumn}
						/>
					</div>
				</div>
			) : null}
		</EntityPageLayout>
	);
}
