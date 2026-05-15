"use client";

import type { Table } from "@tanstack/react-table";
import { Check, Settings2 } from "lucide-react";
import * as React from "react";
import { Button } from "@/components/ui/button";
import {
	Command,
	CommandEmpty,
	CommandGroup,
	CommandInput,
	CommandItem,
	CommandList,
} from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

interface DataTableViewOptionsProps<TData> {
	table: Table<TData>;
}

export function DataTableViewOptions<TData>({ table }: DataTableViewOptionsProps<TData>) {
	const columns = React.useMemo(
		() =>
			table
				.getAllColumns()
				.filter((col) => typeof col.accessorFn !== "undefined" && col.getCanHide()),
		[table],
	);

	return (
		<Popover>
			<PopoverTrigger asChild>
				<Button
					aria-label="Toggle columns"
					variant="outline"
					size="sm"
					className="h-7 gap-1.5 px-2 text-xs"
				>
					<Settings2 className="size-3.5" />
					<span className="hidden sm:inline">View</span>
				</Button>
			</PopoverTrigger>
			<PopoverContent align="end" className="w-44 p-0">
				<Command>
					<CommandInput placeholder="Search columns..." />
					<CommandList>
						<CommandEmpty>No columns found.</CommandEmpty>
						<CommandGroup>
							{columns.map((column) => (
								<CommandItem
									key={column.id}
									onSelect={() => column.toggleVisibility(!column.getIsVisible())}
								>
									<span className="truncate">
										{column.columnDef.meta?.label ?? column.id}
									</span>
									<Check
										className={cn(
											"ms-auto size-4 shrink-0",
											column.getIsVisible() ? "opacity-100" : "opacity-0",
										)}
									/>
								</CommandItem>
							))}
						</CommandGroup>
					</CommandList>
				</Command>
			</PopoverContent>
		</Popover>
	);
}
