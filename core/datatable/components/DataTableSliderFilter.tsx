"use client";

import type { Column } from "@tanstack/react-table";
import { CirclePlus, XCircle } from "lucide-react";
import * as React from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Separator } from "@/components/ui/separator";
import { Slider } from "@/components/ui/slider";
import { cn } from "@/lib/utils";

type RangeValue = [number, number];

function getIsValidRange(value: unknown): value is RangeValue {
  return Array.isArray(value) && value.length === 2 && typeof value[0] === "number" && typeof value[1] === "number";
}

interface DataTableSliderFilterProps<TData> {
  column: Column<TData, unknown>;
  title?: string;
}

export function DataTableSliderFilter<TData>({ column, title }: DataTableSliderFilterProps<TData>) {
  const id = React.useId();
  const columnFilterValue = getIsValidRange(column.getFilterValue()) ? (column.getFilterValue() as RangeValue) : undefined;
  const defaultRange = column.columnDef.meta?.range;
  const unit = column.columnDef.meta?.unit;

  const { min, max, step } = React.useMemo(() => {
    let minV = 0, maxV = 100;
    if (defaultRange && getIsValidRange(defaultRange)) {
      [minV, maxV] = defaultRange;
    } else {
      const vals = column.getFacetedMinMaxValues();
      if (vals && Array.isArray(vals) && vals.length === 2) {
        const [a, b] = vals;
        if (typeof a === "number" && typeof b === "number") { minV = a; maxV = b; }
      }
    }
    const range = maxV - minV;
    const step = range <= 20 ? 1 : range <= 100 ? Math.ceil(range / 20) : Math.ceil(range / 50);
    return { min: minV, max: maxV, step };
  }, [column, defaultRange]);

  const range = React.useMemo<RangeValue>(() => columnFilterValue ?? [min, max], [columnFilterValue, min, max]);
  const fmt = (v: number) => v.toLocaleString(undefined, { maximumFractionDigits: 0 });

  const onReset = React.useCallback((e: React.MouseEvent) => {
    if (e.target instanceof HTMLDivElement) e.stopPropagation();
    column.setFilterValue(undefined);
  }, [column]);

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className="border-dashed">
          {columnFilterValue ? (
            <button type="button" aria-label={`Clear ${title} filter`} onClick={onReset}
              className="focus-visible:ring-ring rounded-[var(--radius)] opacity-70 transition-opacity hover:opacity-100 focus-visible:ring-1 focus-visible:outline-none">
              <XCircle className="size-4" />
            </button>
          ) : (
            <CirclePlus className="size-4" />
          )}
          <span>{title}</span>
          {columnFilterValue && (
            <>
              <Separator orientation="vertical" className="mx-0.5 data-[orientation=vertical]:h-4" />
              {fmt(columnFilterValue[0])} - {fmt(columnFilterValue[1])}{unit ? ` ${unit}` : ""}
            </>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="flex w-auto flex-col gap-4">
        <div className="flex flex-col gap-3">
          <p className="font-medium leading-none">{title}</p>
          <div className="flex items-center gap-4">
            <Label htmlFor={`${id}-from`} className="sr-only">From</Label>
            <div className="relative">
              {/* pe-8 is RTL-safe equivalent of pr-8 */}
              <Input id={`${id}-from`} type="number" inputMode="numeric" placeholder={min.toString()}
                min={min} max={max} value={range[0]?.toString()}
                onChange={(e) => { const n = Number(e.target.value); if (!Number.isNaN(n) && n >= min && n <= range[1]) column.setFilterValue([n, range[1]]); }}
                className={cn("h-8 w-24", unit && "pe-8")} />
              {unit && <span className="bg-accent text-muted-foreground absolute top-0 end-0 bottom-0 flex items-center rounded-e-md px-2 text-sm">{unit}</span>}
            </div>
            <Label htmlFor={`${id}-to`} className="sr-only">to</Label>
            <div className="relative">
              <Input id={`${id}-to`} type="number" inputMode="numeric" placeholder={max.toString()}
                min={min} max={max} value={range[1]?.toString()}
                onChange={(e) => { const n = Number(e.target.value); if (!Number.isNaN(n) && n <= max && n >= range[0]) column.setFilterValue([range[0], n]); }}
                className={cn("h-8 w-24", unit && "pe-8")} />
              {unit && <span className="bg-accent text-muted-foreground absolute top-0 end-0 bottom-0 flex items-center rounded-e-md px-2 text-sm">{unit}</span>}
            </div>
          </div>
          <Slider id={`${id}-slider`} min={min} max={max} step={step} value={range}
            onValueChange={(v) => { if (Array.isArray(v) && v.length === 2) column.setFilterValue(v); }} />
        </div>
        <Button variant="outline" size="sm" onClick={onReset}>Clear</Button>
      </PopoverContent>
    </Popover>
  );
}
