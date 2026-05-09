"use client";

import type { Column } from "@tanstack/react-table";
import { Check, CirclePlus, XCircle } from "lucide-react";
import * as React from "react";
import type { Option } from "../types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";

interface DataTableFacetedFilterProps<TData, TValue> {
  column?: Column<TData, TValue>;
  title?: string;
  options: Option[];
  multiple?: boolean;
}

export function DataTableFacetedFilter<TData, TValue>({
  column,
  title,
  options,
  multiple,
}: DataTableFacetedFilterProps<TData, TValue>) {
  const [open, setOpen] = React.useState(false);

  const columnFilterValue = column?.getFilterValue();
  const selectedValues = React.useMemo(
    () => new Set(Array.isArray(columnFilterValue) ? columnFilterValue : []),
    [columnFilterValue],
  );

  const onItemSelect = React.useCallback(
    (option: Option, isSelected: boolean) => {
      if (!column) return;
      if (multiple) {
        const next = new Set(selectedValues);
        isSelected ? next.delete(option.value) : next.add(option.value);
        const vals = Array.from(next);
        column.setFilterValue(vals.length ? vals : undefined);
      } else {
        column.setFilterValue(isSelected ? undefined : [option.value]);
        setOpen(false);
      }
    },
    [column, multiple, selectedValues],
  );

  const onReset = React.useCallback(
    (e?: React.MouseEvent) => {
      e?.stopPropagation();
      column?.setFilterValue(undefined);
    },
    [column],
  );

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className="border-dashed">
          {selectedValues.size > 0 ? (
            <button
              type="button"
              aria-label={`Clear ${title} filter`}
              onClick={onReset}
              className="focus-visible:ring-ring rounded-sm opacity-70 transition-opacity hover:opacity-100 focus-visible:ring-1 focus-visible:outline-none"
            >
              <XCircle className="size-4" />
            </button>
          ) : (
            <CirclePlus className="size-4" />
          )}
          {title}
          {selectedValues.size > 0 && (
            <>
              <Separator orientation="vertical" className="mx-0.5 data-[orientation=vertical]:h-4" />
              <Badge variant="secondary" className="rounded-sm px-1 font-normal lg:hidden">
                {selectedValues.size}
              </Badge>
              <div className="hidden items-center gap-1 lg:flex">
                {selectedValues.size > 2 ? (
                  <Badge variant="secondary" className="rounded-sm px-1 font-normal">
                    {selectedValues.size} selected
                  </Badge>
                ) : (
                  options
                    .filter((o) => selectedValues.has(o.value))
                    .map((o) => (
                      <Badge key={o.value} variant="secondary" className="rounded-sm px-1 font-normal">
                        {o.label}
                      </Badge>
                    ))
                )}
              </div>
            </>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[12.5rem] p-0" align="start">
        <Command>
          <CommandInput placeholder={title} />
          <CommandList className="max-h-full">
            <CommandEmpty>No results found.</CommandEmpty>
            <CommandGroup className="max-h-[18.75rem] overflow-x-hidden overflow-y-auto">
              {options.map((option) => {
                const isSelected = selectedValues.has(option.value);
                return (
                  <CommandItem key={option.value} onSelect={() => onItemSelect(option, isSelected)}>
                    <div
                      className={cn(
                        "border-primary flex size-4 items-center justify-center rounded-sm border",
                        isSelected ? "bg-primary" : "opacity-50 [&_svg]:invisible",
                      )}
                    >
                      <Check className="size-3" />
                    </div>
                    {option.icon && <option.icon />}
                    <span className="truncate">{option.label}</span>
                    {option.count !== undefined && (
                      <span className="ms-auto font-mono text-xs">{option.count}</span>
                    )}
                  </CommandItem>
                );
              })}
            </CommandGroup>
            {selectedValues.size > 0 && (
              <>
                <CommandSeparator />
                <CommandGroup>
                  <CommandItem onSelect={() => onReset()} className="justify-center text-center">
                    Clear filters
                  </CommandItem>
                </CommandGroup>
              </>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
