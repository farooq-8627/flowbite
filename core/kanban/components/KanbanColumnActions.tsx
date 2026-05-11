"use client";

import { EllipsisVertical } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

interface KanbanColumnActionsProps {
	columnId: string;
	columnTitle: string;
	onEdit?: (columnId: string) => void;
	onDelete?: (columnId: string) => void;
}

export function KanbanColumnActions({
	columnId,
	columnTitle,
	onEdit,
	onDelete,
}: KanbanColumnActionsProps) {
	const [open, setOpen] = useState(false);

	return (
		<DropdownMenu open={open} onOpenChange={setOpen}>
			<DropdownMenuTrigger asChild>
				<Button
					variant="ghost"
					className="flex h-8 w-8 p-0 ms-auto data-[state=open]:bg-muted"
					aria-label={`Actions for ${columnTitle}`}
				>
					<EllipsisVertical className="h-4 w-4" />
				</Button>
			</DropdownMenuTrigger>
			<DropdownMenuContent align="end" className="w-[160px]">
				{onEdit && (
					<DropdownMenuItem
						onClick={() => {
							onEdit(columnId);
							setOpen(false);
						}}
					>
						Edit
					</DropdownMenuItem>
				)}
				{onEdit && onDelete && <DropdownMenuSeparator />}
				{onDelete && (
					<DropdownMenuItem
						className="text-destructive focus:text-destructive"
						onClick={() => onDelete(columnId)}
					>
						Delete
					</DropdownMenuItem>
				)}
			</DropdownMenuContent>
		</DropdownMenu>
	);
}
