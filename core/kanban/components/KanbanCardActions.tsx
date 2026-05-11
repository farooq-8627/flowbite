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

interface KanbanCardActionsProps {
	itemId: string;
	onEdit?: (itemId: string) => void;
	onDelete?: (itemId: string) => void;
}

export function KanbanCardActions({ itemId, onEdit, onDelete }: KanbanCardActionsProps) {
	const [open, setOpen] = useState(false);

	return (
		<DropdownMenu open={open} onOpenChange={setOpen}>
			<DropdownMenuTrigger asChild>
				<Button
					variant="ghost"
					className="flex h-8 w-8 p-0 ms-auto data-[state=open]:bg-muted"
					aria-label="Card actions"
				>
					<EllipsisVertical className="h-4 w-4" />
				</Button>
			</DropdownMenuTrigger>
			<DropdownMenuContent align="end" className="w-[160px]">
				{onEdit && (
					<DropdownMenuItem
						onClick={() => {
							onEdit(itemId);
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
						onClick={() => onDelete(itemId)}
					>
						Delete
					</DropdownMenuItem>
				)}
			</DropdownMenuContent>
		</DropdownMenu>
	);
}
