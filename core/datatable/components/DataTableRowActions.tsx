"use client";

import type { Row } from "@tanstack/react-table";
import { MoreHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

interface DataTableRowActionsProps<TData> {
  row: Row<TData>;
  onEdit?: (row: Row<TData>) => void;
  onDelete?: (row: Row<TData>) => void;
  /** Extra items rendered before the separator */
  extraItems?: React.ReactNode;
}

export function DataTableRowActions<TData>({
  row,
  onEdit,
  onDelete,
  extraItems,
}: DataTableRowActionsProps<TData>) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          className="flex h-8 w-8 p-0 data-[state=open]:bg-muted"
          aria-label="Open row actions"
        >
          <MoreHorizontal className="size-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-[160px]">
        {onEdit && (
          <DropdownMenuItem onClick={() => onEdit(row)}>Edit</DropdownMenuItem>
        )}
        {extraItems}
        {(onEdit || extraItems) && onDelete && <DropdownMenuSeparator />}
        {onDelete && (
          <DropdownMenuItem
            className="text-destructive focus:text-destructive"
            onClick={() => onDelete(row)}
          >
            Delete
          </DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
