import type { DataTableConfig } from "./config";
import type { ColumnSort, Row, RowData } from "@tanstack/react-table";

// Augment TanStack Table column meta with our filter variants
declare module "@tanstack/react-table" {
  // biome-ignore lint/correctness/noUnusedVariables: required by @tanstack/react-table augmentation
  interface ColumnMeta<TData extends RowData, TValue> {
    label?: string;
    placeholder?: string;
    variant?: FilterVariant;
    options?: Option[];
    range?: [number, number];
    unit?: string;
    icon?: React.FC<React.SVGProps<SVGSVGElement>>;
  }
}

export interface Option {
  label: string;
  value: string;
  count?: number;
  icon?: React.FC<React.SVGProps<SVGSVGElement>>;
}

export type FilterOperator = DataTableConfig["operators"][number];
export type FilterVariant = DataTableConfig["filterVariants"][number];
export type JoinOperator = DataTableConfig["joinOperators"][number];

export interface ExtendedColumnSort<TData> extends Omit<ColumnSort, "id"> {
  id: Extract<keyof TData, string>;
}

export interface ExtendedColumnFilter<TData> {
  id: Extract<keyof TData, string>;
  value: string | string[];
  variant: FilterVariant;
  operator: FilterOperator;
  filterId: string;
}

export interface DataTableRowAction<TData> {
  row: Row<TData>;
  variant: "update" | "delete";
}
