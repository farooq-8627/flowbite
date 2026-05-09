"use client";

import { useCallback, useRef } from "react";
import {
  Kanban,
  KanbanBoard as KanbanBoardPrimitive,
  KanbanColumn,
  KanbanOverlay,
} from "@/components/ui/kanban";
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";
import { createRestrictToContainer } from "../utils/restrict-to-container";
import { KanbanColumnHeader } from "./KanbanColumnHeader";
import { KanbanAddCardButton, KanbanEmptyColumn } from "./KanbanHelpers";

export interface KanbanColumnConfig {
  id: string;
  /** Stage name from DB — never hardcoded */
  title: string;
  color?: string;
  isFinal?: boolean;
  finalType?: "positive" | "negative" | "neutral";
}

interface KanbanBoardProps<T extends { id: string }> {
  columns: KanbanColumnConfig[];
  /** Items grouped by columnId — comes from Convex query */
  itemsByColumnId: Record<string, T[]>;
  /** Caller provides the card renderer — board stays generic */
  renderCard: (item: T, isDragging: boolean) => React.ReactNode;
  /** Called when user drops a card into a different column */
  onCardMove: (itemId: string, fromColumnId: string, toColumnId: string) => Promise<void>;
  /** Optional: show aggregate value in column header (permission-gated by caller) */
  showColumnValue?: boolean;
  getItemValue?: (item: T) => number | undefined;
  currencyCode?: string;
  /**
   * Controls which columns show the "+ Add card" button.
   * "first-only" (default) = only first column (leads/deals business rule)
   * "all" = every column (tasks board)
   * string[] = specific column ids
   */
  addCardAllowedColumns?: "first-only" | "all" | string[];
  onAddToColumn?: (columnId: string) => void;
  onEditColumn?: (columnId: string) => void;
  onDeleteColumn?: (columnId: string) => void;
  isLoading?: boolean;
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
}: KanbanBoardProps<T>) {
  const containerRef = useRef<HTMLDivElement>(null);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const restrictToBoard = useCallback(
    createRestrictToContainer(() => containerRef.current),
    [],
  );

  // Build the Record<columnId, T[]> shape the primitive expects
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
    <div ref={containerRef}>
      {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
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
        <ScrollArea className="w-full rounded-[--radius] pb-4">
          <KanbanBoardPrimitive className="flex items-start">
            {columns.map((col, index) => {
              const items = itemsByColumnId[col.id] ?? [];
              const totalValue =
                showColumnValue && getItemValue
                  ? items.reduce((sum, item) => sum + (getItemValue(item) ?? 0), 0)
                  : undefined;

              return (
                <KanbanColumn
                  key={col.id}
                  value={col.id}
                  className="w-[280px] shrink-0"
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

                  <div className="flex flex-col gap-1 p-0.5">
                    {items.length === 0 && <KanbanEmptyColumn />}
                    {items.map((item) => renderCard(item, false))}
                  </div>

                  {canAddToColumn(col.id, index) && onAddToColumn && (
                    <KanbanAddCardButton columnId={col.id} onAdd={onAddToColumn} />
                  )}
                </KanbanColumn>
              );
            })}
          </KanbanBoardPrimitive>
          <ScrollBar orientation="horizontal" />
        </ScrollArea>

        {/* Drag overlay — renders ghost card while dragging */}
        <KanbanOverlay>
          {({ value }) => {
            const item = Object.values(columnMap).flat().find((i) => i.id === value);
            if (!item) return null;
            return renderCard(item, true);
          }}
        </KanbanOverlay>
      </Kanban>
    </div>
  );
}
