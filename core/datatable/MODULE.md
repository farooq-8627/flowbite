# core/datatable — MODULE.md
## Data Table Primitives
> **Phase**: 2 · **Status**: Build this FIRST before kanban and entity scaffolds — everything depends on it
> **Consumers**: `core/entities/scaffolds/EntityListPage.tsx` (all 6 entity list views), `core/settings/pages/MembersPage.tsx`, `features/project-management/` (task lists)

---

## Purpose

This module provides the `@tanstack/react-table` v8 primitives that power every list view in Orbitly. It is a **generic, headless engine** — configured entirely by the caller. The DataTable never knows whether it's showing leads, contacts, or tasks.

**One table engine, used everywhere**:
- All 6 entity list views (leads, contacts, companies, deals, entity5, entity6)
- Members page in Settings
- Activity log full-page view
- Task list in Phase 8 projects

---

## Folder Structure

```
core/datatable/
├── MODULE.md                         # this file
├── index.ts                          # barrel export
│
├── components/
│   ├── DataTable.tsx                 # Root — TanStack Table + virtualization
│   ├── DataTableToolbar.tsx          # Search + filters + view toggle + bulk action bar
│   ├── DataTableColumnHeader.tsx     # Sortable column header with visibility toggle
│   ├── DataTablePagination.tsx       # Page controls + rows-per-page selector
│   ├── DataTableRowActions.tsx       # Row-level action menu (3-dot)
│   ├── DataTableBulkBar.tsx          # Floating bar when rows are selected
│   ├── DataTableFacetFilter.tsx      # Multi-select filter chip (stage, assignee, tag)
│   ├── DataTableDateFilter.tsx       # Date range filter (created, updated)
│   ├── DataTableSkeleton.tsx         # Loading state — matches table dimensions
│   └── DataTableEmpty.tsx            # Empty state — passes through caller's emptyState prop
│
├── hooks/
│   ├── useDataTable.ts               # Initialises TanStack Table instance
│   ├── useColumnVisibility.ts        # Persists hidden columns to localStorage
│   └── useTableFilters.ts            # Syncs filter state to URL search params
│
└── types.ts                          # Shared column + filter type definitions
```

---

## Architecture

### DataTable — The Core Component

```typescript
// core/datatable/components/DataTable.tsx
import {
  useReactTable, getCoreRowModel, getSortedRowModel,
  getFilteredRowModel, getPaginationRowModel,
  type ColumnDef, type SortingState, type ColumnFiltersState,
  type VisibilityState, type RowSelectionState,
} from "@tanstack/react-table";

interface DataTableProps<TData> {
  // Column definitions — caller defines what to show and how
  columns: ColumnDef<TData, any>[];

  // Paginated data from Convex — NEVER the full table (no .collect())
  data: TData[];

  // Pagination cursor from Convex paginate()
  pageCount?: number;
  onNextPage?: () => void;
  onPrevPage?: () => void;
  hasPrevPage?: boolean;
  hasNextPage?: boolean;

  // Optional: enable row selection for bulk actions
  enableSelection?: boolean;
  onSelectionChange?: (selectedIds: string[]) => void;

  // Toolbar configuration
  searchPlaceholder?: string;          // "Search leads..." — i18n key from caller
  filterableColumns?: FilterableColumn[];
  toolbar?: React.ReactNode;           // extra toolbar content (view toggle, add button)

  // Empty + loading states
  isLoading?: boolean;
  emptyState?: React.ReactNode;        // EmptyState component from caller

  // Row click handler
  onRowClick?: (row: TData) => void;
}

export function DataTable<TData>({
  columns, data, pageCount,
  onNextPage, onPrevPage, hasPrevPage, hasNextPage,
  enableSelection, onSelectionChange,
  searchPlaceholder, filterableColumns, toolbar,
  isLoading, emptyState, onRowClick,
}: DataTableProps<TData>) {
  const [sorting, setSorting]             = useState<SortingState>([]);
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([]);
  const [columnVisibility, setColumnVisibility] = useColumnVisibility(); // persisted
  const [rowSelection, setRowSelection]   = useState<RowSelectionState>({});

  const table = useReactTable({
    data,
    columns,
    getCoreRowModel:       getCoreRowModel(),
    getSortedRowModel:     getSortedRowModel(),
    getFilteredRowModel:   getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    manualPagination: true,   // Convex handles pagination — not client-side
    pageCount,
    onSortingChange:          setSorting,
    onColumnFiltersChange:    setColumnFilters,
    onColumnVisibilityChange: setColumnVisibility,
    onRowSelectionChange:     setRowSelection,
    state: { sorting, columnFilters, columnVisibility, rowSelection },
  });

  // Notify caller when selection changes
  useEffect(() => {
    if (!enableSelection) return;
    const selectedIds = table.getSelectedRowModel().rows
      .map(r => (r.original as any)._id as string);
    onSelectionChange?.(selectedIds);
  }, [rowSelection]);

  if (isLoading) return <DataTableSkeleton columns={columns.length} />;

  return (
    <div className="space-y-2">
      <DataTableToolbar
        table={table}
        searchPlaceholder={searchPlaceholder}
        filterableColumns={filterableColumns}
        toolbar={toolbar}
      />

      {/* Bulk action bar — appears above table when rows selected */}
      {enableSelection && Object.keys(rowSelection).length > 0 && (
        <DataTableBulkBar
          selectedCount={Object.keys(rowSelection).length}
          table={table}
          onClearSelection={() => setRowSelection({})}
        />
      )}

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            {table.getHeaderGroups().map(hg => (
              <TableRow key={hg.id}>
                {hg.headers.map(h => (
                  <TableHead key={h.id} style={{ width: h.getSize() }}>
                    {h.isPlaceholder ? null : flexRender(h.column.columnDef.header, h.getContext())}
                  </TableHead>
                ))}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {table.getRowModel().rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={columns.length} className="h-48">
                  {emptyState ?? <DataTableEmpty />}
                </TableCell>
              </TableRow>
            ) : (
              table.getRowModel().rows.map(row => (
                <TableRow
                  key={row.id}
                  data-state={row.getIsSelected() && "selected"}
                  className={cn("group", onRowClick && "cursor-pointer hover:bg-muted/50")}
                  onClick={() => onRowClick?.(row.original)}
                >
                  {row.getVisibleCells().map(cell => (
                    <TableCell key={cell.id}>
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </TableCell>
                  ))}
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <DataTablePagination
        table={table}
        hasNextPage={hasNextPage}
        hasPrevPage={hasPrevPage}
        onNextPage={onNextPage}
        onPrevPage={onPrevPage}
      />
    </div>
  );
}
```

---

## Column Definitions — Standard Pattern

Every entity module defines its columns in a hook. The columns ALWAYS include `personCode` or the entity's own code badge:

```typescript
// core/entities/leads/hooks/useLeadColumns.ts
import { type ColumnDef } from "@tanstack/react-table";
import { DataTableColumnHeader } from "@/core/datatable";

export function useLeadColumns(): ColumnDef<Lead>[] {
  const labels   = useQuery(api.orgs.getEntityLabels);

  return [
    // Checkbox column — always first when selection is enabled
    {
      id: "select",
      header: ({ table }) => (
        <Checkbox
          checked={table.getIsAllPageRowsSelected()}
          onCheckedChange={v => table.toggleAllPageRowsSelected(!!v)}
        />
      ),
      cell: ({ row }) => (
        <Checkbox
          checked={row.getIsSelected()}
          onCheckedChange={v => row.toggleSelected(!!v)}
          onClick={e => e.stopPropagation()}   // don't trigger row click
        />
      ),
      size: 40,
      enableSorting: false,
    },

    // personCode badge — ALWAYS show, agents reference these codes daily
    {
      accessorKey: "personCode",
      header: "Code",
      cell: ({ row }) => (
        <span className="font-mono text-xs text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
          {row.getValue("personCode")}
        </span>
      ),
      size: 80,
      enableHiding: false,   // code column is always visible — cannot be hidden
    },

    // Display name — links to detail page
    {
      accessorKey: "displayName",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title={labels?.lead.singular ?? "Lead"} />
      ),
      cell: ({ row }) => (
        <div className="font-medium">{row.getValue("displayName")}</div>
      ),
    },

    // Pipeline stage — from pipeline.stages (never hardcoded)
    {
      accessorKey: "currentStageId",
      header: "Stage",
      cell: ({ row }) => {
        const stageLabel = useStageName(row.getValue("currentStageId")); // resolves from pipeline
        return <Badge variant="outline">{stageLabel}</Badge>;
      },
      enableSorting: false,
    },

    // Assignee
    {
      accessorKey: "assignedTo",
      header: "Assignee",
      cell: ({ row }) => <AssigneeCell userId={row.getValue("assignedTo")} />,
      enableSorting: false,
    },

    // Source — "manual" | "ai" | "whatsapp" | "csv" | "mcp"
    {
      accessorKey: "source",
      header: "Source",
      cell: ({ row }) => <SourceBadge source={row.getValue("source")} />,
    },

    // Created date
    {
      accessorKey: "createdAt",
      header: ({ column }) => <DataTableColumnHeader column={column} title="Created" />,
      cell: ({ row }) => <RelativeTime timestamp={row.getValue("createdAt")} />,
    },

    // Row actions — 3-dot menu
    {
      id: "actions",
      cell: ({ row }) => <DataTableRowActions row={row} />,
      size: 40,
      enableHiding: false,
    },
  ];
}
```

---

## Toolbar — Search, Filters, View Toggle

```typescript
// core/datatable/components/DataTableToolbar.tsx
interface DataTableToolbarProps<TData> {
  table: Table<TData>;
  searchPlaceholder?: string;
  filterableColumns?: FilterableColumn[];
  toolbar?: React.ReactNode;   // extra content from caller (Add button, view toggle, etc.)
}

export type FilterableColumn = {
  id: string;                  // column accessorKey
  title: string;               // display label
  options: { value: string; label: string; icon?: LucideIcon }[];
  type?: "facet" | "date";
};

export function DataTableToolbar<TData>({ table, searchPlaceholder, filterableColumns, toolbar }: DataTableToolbarProps<TData>) {
  const isFiltered = table.getState().columnFilters.length > 0;

  return (
    <div className="flex items-center justify-between gap-2">
      <div className="flex items-center gap-2 flex-1">
        {/* Global search */}
        <Input
          placeholder={searchPlaceholder ?? "Search..."}
          value={(table.getColumn("displayName")?.getFilterValue() as string) ?? ""}
          onChange={e => table.getColumn("displayName")?.setFilterValue(e.target.value)}
          className="h-8 w-[200px] lg:w-[280px]"
        />

        {/* Facet filters */}
        {filterableColumns?.map(col => (
          table.getColumn(col.id) && (
            <DataTableFacetFilter
              key={col.id}
              column={table.getColumn(col.id)!}
              title={col.title}
              options={col.options}
            />
          )
        ))}

        {/* Reset filters button */}
        {isFiltered && (
          <Button variant="ghost" size="sm" onClick={() => table.resetColumnFilters()}>
            Reset
            <X className="ms-1 size-3.5" />
          </Button>
        )}
      </div>

      <div className="flex items-center gap-2">
        {/* Caller's extra toolbar content (view toggle, Add button) */}
        {toolbar}

        {/* Column visibility toggle */}
        <DataTableViewOptions table={table} />
      </div>
    </div>
  );
}
```

---

## Bulk Action Bar

```typescript
// core/datatable/components/DataTableBulkBar.tsx
// Floats above table when rows are selected. Caller-configurable actions.

interface DataTableBulkBarProps {
  selectedCount: number;
  onClearSelection: () => void;
  // Bulk actions — defined by entity module, not by datatable
  actions?: BulkAction[];
}

export type BulkAction = {
  label: string;
  icon: LucideIcon;
  variant?: "default" | "destructive";
  onClick: (selectedIds: string[]) => void;
  permission?: string;   // if set, action hidden if user lacks permission
  requiresPlan?: string; // if set, action shows upgrade prompt instead
};

// Usage in LeadList:
const bulkActions: BulkAction[] = [
  {
    label: "Assign",
    icon: UserCheck,
    permission: "leads.editAny",
    onClick: (ids) => setBulkAssignOpen(true),
  },
  {
    label: "Move Stage",
    icon: ArrowRight,
    permission: "leads.editAny",
    onClick: (ids) => setBulkMoveStageOpen(true),
  },
  {
    label: "Add Tag",
    icon: Tag,
    onClick: (ids) => setBulkTagOpen(true),
  },
  {
    label: "Delete",
    icon: Trash2,
    variant: "destructive",
    permission: "leads.delete",
    onClick: (ids) => setBulkDeleteConfirmOpen(true),
  },
];
```

---

## Column Persistence

Column visibility is persisted in localStorage, keyed by entity type:

```typescript
// core/datatable/hooks/useColumnVisibility.ts
export function useColumnVisibility(entityType: string) {
  const key = `orbitly:col-visibility:${entityType}`;
  const [visibility, setVisibility] = useState<VisibilityState>(() => {
    try {
      return JSON.parse(localStorage.getItem(key) ?? "{}");
    } catch {
      return {};
    }
  });

  const persist = useCallback((v: VisibilityState) => {
    setVisibility(v);
    localStorage.setItem(key, JSON.stringify(v));
  }, [key]);

  return [visibility, persist] as const;
}
```

---

## Filter State — Synced to URL

Filter state lives in the URL as query params so filters are preserved on refresh and can be shared:

```typescript
// core/datatable/hooks/useTableFilters.ts
// Syncs ColumnFiltersState <-> URL search params
// e.g. ?stage=offer_mou&assignedTo=user_abc&createdAfter=2026-01-01
// Uses useSearchParams + router.replace to update without navigation push
```

---

## Pagination — Convex Cursor-Based

```typescript
// core/datatable/components/DataTablePagination.tsx
// Does NOT show page numbers — Convex uses cursor-based pagination, not offset
// Shows: "Showing X records" + [← Previous] [Next →] buttons
// hasNextPage / hasPrevPage come from Convex paginate() result
// Rows-per-page selector: 25 | 50 | 100 (default 50)
```

---

## Package Dependencies

```bash
pnpm add @tanstack/react-table
# No separate virtual list — standard table is sufficient for 50-100 rows per page
# If > 10k rows needed (Phase 7 bulk imports), add @tanstack/react-virtual
```

---

## Never-Do List for This Module

```typescript
// ❌ Never use .collect() to fetch all rows — always paginate
// ❌ Never do client-side sorting on paginated data — sort in Convex query
// ❌ Never hide the personCode/entityCode column — it must always be visible
// ❌ Never render bulk actions without checking permission — BulkAction.permission
// ❌ Never store filter state in useState only — sync to URL params
// ❌ Never build entity-specific table from scratch — always use this DataTable
// ❌ Never put business logic in column cell renderers — cells are display-only
```

---

## Standard Filterable Columns by Entity

| Entity | Filterable Columns |
|---|---|
| Leads | Stage (from pipeline), Assignee, Source, Tags, Date created |
| Contacts | Stage (lead status), Assignee, Company, Tags, Date created |
| Companies | Industry, Tags, Date created |
| Deals | Stage (pipeline), Assignee, Value range, Tags, Date created, Won/Lost |
| Tasks (Phase 8) | Status, Assignee, Priority, Project, Due date |

All filter options are **loaded from Convex**, not hardcoded. Stage options come from the pipeline query. Assignee options come from orgMembers query.