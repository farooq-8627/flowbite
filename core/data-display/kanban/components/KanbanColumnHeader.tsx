"use client";

/**
 * KanbanColumnHeader — thin column header.
 *
 * The entire header is the drag handle (via KanbanColumnHandle). No giant
 * grip button. Layout: [color dot] [title] [count] [value?] [actions?].
 */

import { Badge } from "@/components/ui/badge";
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
		<KanbanColumnHandle asChild>
			<div
				className={cn(
					"flex h-8 shrink-0 cursor-grab items-center gap-2 rounded-[var(--radius)] px-2",
					"select-none hover:bg-accent/40",
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
				{(onEditColumn || onDeleteColumn) && (
					// biome-ignore lint/a11y/noStaticElementInteractions: event-stop wrapper keeps the actions menu from starting a column drag
					<div
						className={cn(showValue ? "" : "ms-auto")}
						onClick={(e) => e.stopPropagation()}
						onKeyDown={(e) => e.stopPropagation()}
					>
						<KanbanColumnActions
							columnId={columnId}
							columnTitle={title}
							onEdit={onEditColumn}
							onDelete={onDeleteColumn}
						/>
					</div>
				)}
			</div>
		</KanbanColumnHandle>
	);
}
