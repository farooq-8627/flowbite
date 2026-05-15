"use client";

/**
 * KanbanBoard — renders the entity board with correct overflow semantics.
 *
 * Layout contract:
 *   - The whole board takes the full height of its parent (the parent should
 *     give it min-h-0 + flex-1 so the board knows where to stop).
 *   - Only ONE horizontal scroll container — at the board level.
 *   - Each column is a flex-col with [header][scrollable body][footer?]:
 *       - Header: fixed (does not scroll).
 *       - Body:   scrolls vertically when content overflows.
 *       - Footer: fixed at the bottom of the column (optional — used for the
 *                 "+ Add card" button and future bottom-insert slots).
 *   - No y-scroll on the board or on the page — the cards scroll inside their
 *     own column, not the whole page.
 *
 * Usage inside EntityListPage:
 *   <div className="flex min-h-0 flex-1"><KanbanBoard ... /></div>
 */

import { useCallback, useRef } from "react";
import {
	Kanban,
	KanbanBoard as KanbanBoardPrimitive,
	KanbanColumn,
	KanbanOverlay,
} from "@/components/ui/kanban";
import { createRestrictToContainer } from "../utils/restrict-to-container";
import { KanbanColumnHeader } from "./KanbanColumnHeader";
import { KanbanAddCardButton, KanbanEmptyColumn } from "./KanbanHelpers";

export interface KanbanColumnConfig {
	id: string;
	title: string;
	color?: string;
	isFinal?: boolean;
	finalType?: "positive" | "negative" | "neutral";
}

interface KanbanBoardProps<T extends { id: string }> {
	columns: KanbanColumnConfig[];
	itemsByColumnId: Record<string, T[]>;
	renderCard: (item: T, isDragging: boolean) => React.ReactNode;
	onCardMove: (itemId: string, fromColumnId: string, toColumnId: string) => Promise<void>;
	showColumnValue?: boolean;
	getItemValue?: (item: T) => number | undefined;
	currencyCode?: string;
	addCardAllowedColumns?: "first-only" | "all" | string[];
	onAddToColumn?: (columnId: string) => void;
	onEditColumn?: (columnId: string) => void;
	onDeleteColumn?: (columnId: string) => void;
	/** Optional footer rendered at the bottom of every column (below the card list). */
	renderColumnFooter?: (columnId: string) => React.ReactNode;
}

export function KanbanBoard<T extends { id: string }>({
	columns,
	itemsByColumnId,
	renderCard,
	onCardMove,
	showColumnValue,
	getItemValue,
	currencyCode,
	addCardAllowedColumns = "first-only",
	onAddToColumn,
	onEditColumn,
	onDeleteColumn,
	renderColumnFooter,
}: KanbanBoardProps<T>) {
	const containerRef = useRef<HTMLDivElement>(null);

	// eslint-disable-next-line react-hooks/exhaustive-deps
	const restrictToBoard = useCallback(
		createRestrictToContainer(() => containerRef.current),
		[],
	);

	const columnMap = Object.fromEntries(
		columns.map((col) => [col.id, itemsByColumnId[col.id] ?? []]),
	);

	function canAddToColumn(columnId: string, index: number): boolean {
		if (!onAddToColumn) return false;
		if (addCardAllowedColumns === "all") return true;
		if (addCardAllowedColumns === "first-only") return index === 0;
		return addCardAllowedColumns.includes(columnId);
	}

	function findColumnForItem(itemId: string): string | null {
		for (const [colId, items] of Object.entries(columnMap)) {
			if (items.some((i) => i.id === itemId)) return colId;
		}
		return null;
	}

	return (
		<div ref={containerRef} className="flex h-full min-h-0 w-full min-w-0">
			{/* biome-ignore lint/suspicious/noExplicitAny: Kanban primitive generic slot */}
			<Kanban<any>
				value={columnMap}
				onValueChange={async (newColumns: Record<string, T[]>) => {
					for (const [colId, items] of Object.entries(newColumns)) {
						for (const item of items as T[]) {
							const prevCol = findColumnForItem(item.id);
							if (prevCol && prevCol !== colId) {
								await onCardMove(item.id, prevCol, colId);
							}
						}
					}
				}}
				getItemValue={(item: T) => item.id}
				modifiers={[restrictToBoard]}
			>
				{/*
				 * Outer scroll container: ONLY x-scroll. Height is 100% of parent
				 * so every column can be `h-full` and scroll its own cards inside.
				 */}
				<div className="flex h-full w-full min-w-0 overflow-x-auto overflow-y-hidden">
					<KanbanBoardPrimitive className="flex h-full items-stretch gap-3 ">
						{columns.map((col, index) => {
							const items = itemsByColumnId[col.id] ?? [];
							const totalValue =
								showColumnValue && getItemValue
									? items.reduce(
											(sum, item) => sum + (getItemValue(item) ?? 0),
											0,
										)
									: undefined;

							return (
								<KanbanColumn
									key={col.id}
									value={col.id}
									className="flex h-full w-[280px] shrink-0 flex-col gap-1 rounded-[var(--radius)] border bg-muted/40 p-1.5"
								>
									<KanbanColumnHeader
										columnId={col.id}
										title={col.title}
										count={items.length}
										color={col.color}
										totalValue={totalValue}
										showValue={showColumnValue}
										currencyCode={currencyCode}
										onEditColumn={onEditColumn}
										onDeleteColumn={onDeleteColumn}
									/>

									{/* Scrollable card body — takes remaining column height */}
									<div className="flex min-h-0 flex-1 flex-col gap-1.5 overflow-y-auto overflow-x-hidden pe-0.5">
										{items.length === 0 && <KanbanEmptyColumn />}
										{items.map((item) => renderCard(item, false))}
									</div>

									{/* Fixed footer slot (add button + any custom footer) */}
									{(canAddToColumn(col.id, index) && onAddToColumn) ||
									renderColumnFooter ? (
										<div className="flex shrink-0 flex-col gap-1 pt-1">
											{canAddToColumn(col.id, index) && onAddToColumn && (
												<KanbanAddCardButton
													columnId={col.id}
													onAdd={onAddToColumn}
												/>
											)}
											{renderColumnFooter?.(col.id)}
										</div>
									) : null}
								</KanbanColumn>
							);
						})}
					</KanbanBoardPrimitive>
				</div>

				<KanbanOverlay>
					{({ value }) => {
						const item = Object.values(columnMap)
							.flat()
							.find((i) => i.id === value);
						if (!item) return null;
						return renderCard(item, true);
					}}
				</KanbanOverlay>
			</Kanban>
		</div>
	);
}
