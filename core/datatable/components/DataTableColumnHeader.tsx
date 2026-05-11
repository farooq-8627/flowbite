"use client";

import type { Column } from "@tanstack/react-table";
import { ArrowDown, ArrowDownUp, ArrowUp, EyeOff, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

interface DataTableColumnHeaderProps<TData, TValue> extends React.ComponentProps<"div"> {
	column: Column<TData, TValue>;
	title: string;
}

export function DataTableColumnHeader<TData, TValue>({
	column,
	title,
	className,
}: DataTableColumnHeaderProps<TData, TValue>) {
	if (!column.getCanSort()) {
		return <div className={cn(className)}>{title}</div>;
	}

	return (
		<div className={cn("flex items-center gap-x-2", className)}>
			<DropdownMenu>
				{/* -ms-3 is RTL-safe equivalent of -ml-3 */}
				<DropdownMenuTrigger asChild>
					<Button
						variant="ghost"
						size="sm"
						className="-ms-3 h-8 data-[state=open]:bg-accent"
					>
						<span>{title}</span>
						{column.getIsSorted() === "desc" ? (
							<ArrowDown className="ms-2 size-3" />
						) : column.getIsSorted() === "asc" ? (
							<ArrowUp className="ms-2 size-3" />
						) : (
							<ArrowDownUp className="ms-2 size-3" />
						)}
					</Button>
				</DropdownMenuTrigger>
				<DropdownMenuContent align="start">
					<DropdownMenuItem onClick={() => column.toggleSorting(false)}>
						<ArrowUp className="me-2 size-4 text-muted-foreground/70" />
						Asc
					</DropdownMenuItem>
					<DropdownMenuItem onClick={() => column.toggleSorting(true)}>
						<ArrowDown className="me-2 size-4 text-muted-foreground/70" />
						Desc
					</DropdownMenuItem>
					{column.getIsSorted() && (
						<DropdownMenuItem onClick={() => column.clearSorting()}>
							<X className="me-2 size-4 text-muted-foreground/70" />
							Reset
						</DropdownMenuItem>
					)}
					<DropdownMenuSeparator />
					<DropdownMenuItem onClick={() => column.toggleVisibility(false)}>
						<EyeOff className="me-2 size-4 text-muted-foreground/70" />
						Hide
					</DropdownMenuItem>
				</DropdownMenuContent>
			</DropdownMenu>
		</div>
	);
}
