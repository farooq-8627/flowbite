"use client";

/**
 * KanbanColumnHeader — thin column header with a CENTERED drag zone.
 *
 * Layout (left → right):
 *   ┌─ drag-handle ────────────────────────────────┬─ trailing actions ─┐
 *   │ • dot  Title  ⟨count⟩  $value? (ms-auto)     │ + add?  ⋮ menu?    │
 *   └──────────────────────────────────────────────┴────────────────────┘
 *
 * Why the structure changed
 * ─────────────────────────
 * The previous version wrapped the WHOLE header in `<KanbanColumnHandle>`.
 * dnd-kit registers its pointer-down listener on the handle node, so even
 * with `stopPropagation` on the trailing-actions wrapper, real-world clicks
 * on the `+` button or the ⋮ menu felt unresponsive — pointerdown reaches
 * the handle first, and the activator-node logic fights with the button's
 * synthetic click. The fix is structural: the handle ONLY covers the
 * title/count/value region; the trailing actions are siblings of the
 * handle, so dnd-kit never sees their pointer events.
 *
 * The `+` button is opt-in (set `onAdd`); used by the notes board so each
 * category column can quickly spawn an inline composer at the top of its
 * card list. Entity boards leave it off.
 */

import { Plus } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { KanbanColumnHandle } from "@/components/ui/kanban";
import { cn } from "@/lib/utils";
import { KanbanColumnActions } from "./KanbanColumnActions";

interface KanbanColumnHeaderProps {
	columnId: string;
	title: string;
	count: number;
	color?: string;
	totalValue?: number;
	showValue?: boolean;
	currencyCode?: string;
	onEditColumn?: (columnId: string) => void;
	onDeleteColumn?: (columnId: string) => void;
	/**
	 * When set, renders a small `+` button on the right side of the header
	 * that fires this callback. Used by the notes board to spawn an inline
	 * composer at the TOP of the column. Entity boards omit this.
	 */
	onAddCard?: (columnId: string) => void;
	/** Tooltip / aria-label for the add button. Defaults to `Add card`. */
	addCardLabel?: string;
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
	onAddCard,
	addCardLabel = "Add card",
}: KanbanColumnHeaderProps) {
	const hasTrailingActions = !!onAddCard || !!onEditColumn || !!onDeleteColumn;

	return (
		<div className="flex h-8 shrink-0 items-center gap-1 rounded-[var(--radius)] px-1">
			<KanbanColumnHandle asChild>
				<div
					className={cn(
						"flex h-full min-w-0 flex-1 cursor-grab items-center gap-2 rounded-[var(--radius)] px-1.5",
						"select-none hover:bg-accent/40 data-dragging:cursor-grabbing",
					)}
				>
					<span
						className="size-2 shrink-0 rounded-full"
						style={{ backgroundColor: color ?? "#94a3b8" }}
					/>
					<span className="truncate text-xs font-semibold capitalize">{title}</span>
					<Badge
						variant="secondary"
						className="pointer-events-none h-4 px-1.5 text-[10px] font-normal"
					>
						{count}
					</Badge>
					{showValue && totalValue !== undefined && (
						<span className="ms-auto text-[10px] font-medium text-muted-foreground tabular-nums">
							{new Intl.NumberFormat("en-US", {
								style: "currency",
								currency: currencyCode,
								notation: "compact",
							}).format(totalValue)}
						</span>
					)}
				</div>
			</KanbanColumnHandle>

			{hasTrailingActions && (
				<div className="flex shrink-0 items-center gap-0.5">
					{onAddCard && (
						<Button
							type="button"
							variant="ghost"
							size="icon"
							className="size-6 text-muted-foreground hover:text-foreground"
							aria-label={addCardLabel}
							title={addCardLabel}
							onClick={() => onAddCard(columnId)}
						>
							<Plus className="size-3.5" />
						</Button>
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
			)}
		</div>
	);
}
