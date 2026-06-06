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
import { FirstTimeTour } from "@/components/ui/first-time-tour";
import type { Id } from "@/convex/_generated/dataModel";
import { DataTable } from "@/core/data-display/datatable/components/DataTable";
import { DataTableViewOptions } from "@/core/data-display/datatable/components/DataTableViewOptions";
import { useDataTable } from "@/core/data-display/datatable/hooks/useDataTable";
import {
	KanbanBoard,
	type KanbanColumnConfig,
} from "@/core/data-display/kanban/components/KanbanBoard";
import { ENTITY_TOUR_ID, ENTITY_TOUR_STEPS } from "@/core/entities/shared/tours";
import {
	EmptyState,
	EntityPageLayout,
	type PrimaryActionConfig,
	type ViewKind,
} from "@/core/shell/shared/entity-layout";
import type { EntitySlot } from "../shared/types";

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
	onCardMove?: (
		itemId: string,
		fromColumnId: string,
		toColumnId: string,
		newIndex: number,
	) => Promise<void>;
	renderColumnFooter?: (columnId: string) => React.ReactNode;
	onAddToColumn?: (columnId: string) => void;
	/** Forwards through to KanbanBoard. See KanbanBoard.onColumnReorder. */
	onColumnReorder?: (newOrder: string[]) => void;
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
	onColumnReorder,
	emptyTitle,
	emptyDescription,
	emptyAction,
}: EntityListPageProps<TRow>) {
	// `items` is the canonical signal for both views — list parents pass the
	// flat query result, board parents flatten their grouped result so the
	// scaffold can rely on a single shape:
	//   undefined → still loading
	//   []        → loaded, no rows yet
	//   [...]     → loaded, render the table or board
	// The board branch uses `itemsByColumnId` for actual rendering; this
	// scaffold only uses `items` for the loading / empty distinction so it
	// works identically for list-only entities (contacts/companies) and
	// board-as-primary entities (deals/leads).
	const isLoading = items === undefined;
	const isEmpty = (items?.length ?? 0) === 0;

	// Default sort: newest first. The "createdAt" column is appended by
	// `useEntityColumns` for the leads board, but the deals / contacts /
	// companies boards build their columns from a user-toggled
	// `listColumns` set. If the user hides the Created column, applying
	// the default sort would crash tanstack-table with
	// `[Table] Column with id 'createdAt' does not exist.` — guard by
	// checking the actual column ids in scope.
	const hasCreatedAtColumn = columns.some(
		(c) => (c as { id?: string; accessorKey?: string }).id === "createdAt",
	);
	const { table } = useDataTable({
		data: items ?? [],
		columns,
		pageCount: Math.ceil((items?.length ?? 0) / 25),
		initialState: {
			pagination: { pageSize: 25, pageIndex: 0 },
			sorting: hasCreatedAtColumn
				? ([{ id: "createdAt", desc: true }] as never)
				: ([] as never),
		},
		getRowId: (row) => row.id,
	});

	return (
		<>
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
				{isLoading ? null : isEmpty ? (
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
								onColumnReorder={onColumnReorder}
							/>
						</div>
					</div>
				) : null}
			</EntityPageLayout>

			{/* ONE entity coachmark, device-wide. Mounted here (not in
			    EntityPageLayout, which Notes also uses) so it fires only on
			    entity list/board pages — and only when the board has cards so
			    the drag/quick-action anchors resolve. Single id ⇒ once across
			    leads/contacts/deals/companies. See core/entities/shared/tours.ts. */}
			{view === "board" && !isLoading && !isEmpty && (
				<FirstTimeTour id={ENTITY_TOUR_ID} steps={ENTITY_TOUR_STEPS} />
			)}
		</>
	);
}
