"use client";

import { GripVertical } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { KanbanColumnHandle } from "@/components/ui/kanban";
import { cn } from "@/lib/utils";
import { KanbanColumnActions } from "./KanbanColumnActions";

interface KanbanColumnHeaderProps {
  columnId: string;
  title: string;
  count: number;
  color?: string;
  /** Pipeline value sum — only shown when caller passes showValue=true (permission-gated) */
  totalValue?: number;
  showValue?: boolean;
  currencyCode?: string;
  onEditColumn?: (columnId: string) => void;
  onDeleteColumn?: (columnId: string) => void;
}

export function KanbanColumnHeader({
  columnId,
  title,
  count,
  color,
  totalValue,
  showValue,
  currencyCode = "USD",
  onEditColumn,
  onDeleteColumn,
}: KanbanColumnHeaderProps) {
  return (
    <div className="flex items-center gap-x-1.5 p-0">
      {/* Drag handle for the column — wired to KanbanColumnHandle from dnd-kit primitive */}
      <KanbanColumnHandle asChild>
        <button
          type="button"
          aria-label="Move column"
          className={cn(
            "flex h-8 w-8 items-center justify-center rounded-[--radius]",
            "text-secondary-foreground/50 cursor-grab hover:bg-accent",
          )}
        >
          <GripVertical className="size-4" />
        </button>
      </KanbanColumnHandle>

      {/* Color dot from pipeline stage */}
      <span
        className="size-2 rounded-full shrink-0"
        style={{ backgroundColor: color ?? "#94a3b8" }}
      />

      <span className="me-auto text-sm font-medium truncate">{title}</span>

      <Badge variant="secondary" className="text-xs pointer-events-none">
        {count}
      </Badge>

      {/* Pipeline value — permission-gated by caller */}
      {showValue && totalValue !== undefined && (
        <span className="text-xs text-muted-foreground font-medium">
          {new Intl.NumberFormat("en-US", {
            style: "currency",
            currency: currencyCode,
            notation: "compact",
          }).format(totalValue)}
        </span>
      )}

      {(onEditColumn || onDeleteColumn) && (
        <KanbanColumnActions
          columnId={columnId}
          columnTitle={title}
          onEdit={onEditColumn}
          onDelete={onDeleteColumn}
        />
      )}
    </div>
  );
}
