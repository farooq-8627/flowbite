# Kanban & DataTable — Implementation Plan

> Written: 2026-05-09
> Decision: Logic from `shadcn-dashboard-2` + UI from `shadboard` + our config-driven architecture from MODULE.md
> Status: Ready to implement

---

## Summary

| Module | Logic Source | UI Source | DnD Library |
|--------|-------------|-----------|-------------|
| **Kanban** | `shadcn-dashboard-2` → `components/ui/kanban.tsx` (full primitive) | `shadboard` → Card-based task items with header/content/footer | `@dnd-kit/core` + `@dnd-kit/sortable` |
| **DataTable** | `shadcn-dashboard-2` → `components/ui/table/` (toolbar, filters, meta-driven) | `shadboard` → `data-table-column-header.tsx` (RTL-safe sorting on click) | TanStack Table v8 |

---

## What's Already Done (DO NOT RE-IMPLEMENT)

- ✅ Shell layout (sidebar, TopNav, DashboardLayout)
- ✅ Notification bell dropdown (from shadboard)
- ✅ Fullscreen toggle (from shadboard)
- ✅ Theme system (5 presets)
- ✅ RBAC (PermissionGate + hooks)
- ✅ `core/kanban/MODULE.md` — full architecture spec (config-driven, generic)
- ✅ `core/datatable/MODULE.md` — full architecture spec

---

## PART 1: KANBAN

### Architecture Decision

We use `shadcn-dashboard-2`'s `kanban.tsx` UI primitive because:
1. It uses `@dnd-kit` (modern, maintained, accessible, keyboard support)
2. It's a composable primitive (`Kanban`, `KanbanBoard`, `KanbanColumn`, `KanbanItem`, `KanbanOverlay`)
3. It handles collision detection, cross-column moves, column reordering, and accessibility announcements
4. It does NOT use `@hello-pangea/dnd` (react-beautiful-dnd fork — unmaintained upstream)

But we take the **UI card design** from shadboard because:
1. Richer card layout: header (grip + badge + actions), content (title + desc + media), footer (avatar-stack + comments + attachments)
2. Column headers with grip handle + title + actions dropdown
3. RTL-safe classes (`ms-*`, `me-*`, `ps-*`, `pe-*`)

### Source Files to Copy

#### From `shadcn-dashboard-2` (LOGIC)

| Source File | Target File | What It Does |
|-------------|-------------|--------------|
| `src/components/ui/kanban.tsx` | `components/ui/kanban.tsx` | Core DnD primitive — Kanban, KanbanBoard, KanbanColumn, KanbanColumnHandle, KanbanItem, KanbanItemHandle, KanbanOverlay |
| `src/features/kanban/utils/restrict-to-container.ts` | `core/kanban/utils/restrict-to-container.ts` | Modifier to keep drag within board bounds |
| `src/lib/compose-refs.ts` | `lib/compose-refs.ts` | Utility for composing multiple refs (used by kanban.tsx) |

#### From `shadboard` (UI DESIGN — adapt, don't copy verbatim)

| Source File | Inspiration For | What We Take |
|-------------|-----------------|--------------|
| `apps/kanban/_components/kanban-task-item.tsx` | `core/kanban/components/KanbanCard.tsx` | Card wrapper structure (Card component with header/content/footer) |
| `apps/kanban/_components/kanban-task-item-header.tsx` | `core/kanban/components/KanbanCardHeader.tsx` | Grip handle + badge + actions dropdown layout |
| `apps/kanban/_components/kanban-task-item-content.tsx` | `core/kanban/components/KanbanCardContent.tsx` | Title + description + media grid |
| `apps/kanban/_components/kanban-task-item-footer.tsx` | `core/kanban/components/KanbanCardFooter.tsx` | Avatar stack + comments count + attachments count |
| `apps/kanban/_components/kanban-column-item-header.tsx` | `core/kanban/components/KanbanColumnHeader.tsx` | Grip handle + column title + actions dropdown |
| `apps/kanban/_components/kanban-column-actions.tsx` | `core/kanban/components/KanbanColumnActions.tsx` | Edit/Delete column dropdown |
| `apps/kanban/_components/kanban-task-item-actions.tsx` | `core/kanban/components/KanbanCardActions.tsx` | Edit/Delete task dropdown |

### Target Folder Structure

```
core/kanban/
├── MODULE.md                          # Already exists
├── index.ts                           # Barrel export
├── components/
│   ├── KanbanBoard.tsx                # Wraps <Kanban> + <KanbanBoard> + <ScrollArea> + <KanbanOverlay>
│   ├── KanbanColumn.tsx               # Wraps <KanbanColumn> with our column header UI
│   ├── KanbanColumnHeader.tsx         # Shadboard-style: color dot + title + count + value + actions
│   ├── KanbanCard.tsx                 # Base card — shadboard Card structure with KanbanItem
│   ├── KanbanCardHeader.tsx           # Badge + grip (via KanbanItemHandle) + actions
│   ├── KanbanCardContent.tsx          # Title + description slot
│   ├── KanbanCardFooter.tsx           # Avatar stack + metadata slot
│   ├── KanbanCardActions.tsx          # Dropdown: Edit, Move to stage, Delete
│   ├── KanbanColumnActions.tsx        # Dropdown: Edit column, Delete column
│   ├── KanbanAddCardButton.tsx        # "+" button at column bottom (conditional per entity)
│   ├── KanbanDragOverlay.tsx          # Ghost card while dragging
│   ├── KanbanEmptyColumn.tsx          # Empty state for columns with 0 items
│   └── KanbanCardSkeleton.tsx         # Loading skeleton
├── hooks/
│   └── useKanbanBoard.ts             # Derives columns from pipeline stages + items
└── utils/
    └── restrict-to-container.ts       # From shadcn-dashboard-2
```

### Also needed at UI primitive level:

```
components/ui/kanban.tsx               # From shadcn-dashboard-2 (copy as-is, RTL-adapt)
lib/compose-refs.ts                    # From shadcn-dashboard-2 (utility)
```

### Key Changes When Adapting

#### From `shadcn-dashboard-2` kanban.tsx:
1. Replace `ml-*` → `ms-*`, `mr-*` → `me-*`, `pl-*` → `ps-*`, `pr-*` → `pe-*`
2. Replace `rounded-md/lg` → `rounded-[--radius]`
3. Keep all DnD logic exactly as-is (collision detection, keyboard nav, announcements)
4. The `Kanban` component accepts `value` (Record<columnId, items[]>) and `onValueChange` — this maps perfectly to our config-driven approach

#### From `shadboard` UI:
1. Replace `@hello-pangea/dnd` Draggable/Droppable → `KanbanItem`/`KanbanColumn` from our primitive
2. Replace `provided.dragHandleProps` → `KanbanItemHandle` / `KanbanColumnHandle`
3. Keep the Card-based visual structure (CardHeader, CardContent, CardFooter)
4. Keep avatar-stack, badge, grip-vertical icon patterns
5. Remove all Context+Reducer state management (we use the primitive's `onValueChange` + Convex mutations)

### How the Board Connects to Entities

```typescript
// core/entities/leads/views/LeadsBoardView.tsx
import { KanbanBoard } from "@/core/kanban"

export function LeadsBoardView() {
  const pipeline = useQuery(api.pipelines.getDefault, { entityType: "lead" })
  const leadsByStage = useQuery(api.leads.listGroupedByStage)
  const moveStage = useMutation(api.leads.moveToStage)

  // Transform pipeline stages → kanban columns format
  // Transform leads → Record<stageId, Lead[]>
  // Pass renderCard prop with LeadCard component
  // onCardMove → fires moveStage mutation
}
```

### Business Rules for "Add Card" Button

| Entity | Rule | Implementation |
|--------|------|----------------|
| **Leads** | Only allow adding new leads to Stage 1 (first/new stage) | `onAddToColumn` only rendered for `columns[0]` |
| **Deals** | Only allow adding new deals to Stage 1 (first stage) | `onAddToColumn` only rendered for `columns[0]` |
| **Tasks** (Phase 8) | Allow adding to any column | `onAddToColumn` rendered for all columns |

This is controlled by a prop on `KanbanBoard`:

```typescript
interface KanbanBoardProps<T> {
  // ... existing props from MODULE.md
  addCardAllowedColumns?: "first-only" | "all" | string[]  // default: "first-only"
}
```

### Packages to Install

```bash
pnpm add @dnd-kit/core@6.3.1 @dnd-kit/sortable@10.0.0 @dnd-kit/utilities@3.2.2
```

> NOTE: Do NOT install `@hello-pangea/dnd` — we use `@dnd-kit` exclusively.

---

## PART 2: DATATABLE

### Architecture Decision

We combine:
1. **shadcn-dashboard-2** `data-table-toolbar.tsx` — auto-renders filters based on column `meta.variant` (text, number, range, date, dateRange, select, multiSelect)
2. **shadboard** `data-table-column-header.tsx` — RTL-safe sorting with `ms-*`/`me-*` classes, click-to-sort dropdown
3. **shadcn-dashboard-2** `data-table.tsx` — main table with pinning styles, scroll area, sticky headers
4. **shadboard** `data-table-pagination.tsx` — RTL-safe pagination with `rtl:[&>button>svg]:-scale-100`

### Source Files to Copy

#### From `shadcn-dashboard-2` (LOGIC + FILTERS)

| Source File | Target File | What It Does |
|-------------|-------------|--------------|
| `src/components/ui/table/data-table.tsx` | `core/datatable/components/DataTable.tsx` | Main table wrapper with scroll, sticky headers, pinning |
| `src/components/ui/table/data-table-toolbar.tsx` | `core/datatable/components/DataTableToolbar.tsx` | Auto-renders filters from column meta |
| `src/components/ui/table/data-table-faceted-filter.tsx` | `core/datatable/components/DataTableFacetedFilter.tsx` | Multi-select filter popover |
| `src/components/ui/table/data-table-date-filter.tsx` | `core/datatable/components/DataTableDateFilter.tsx` | Date/date-range picker filter |
| `src/components/ui/table/data-table-slider-filter.tsx` | `core/datatable/components/DataTableSliderFilter.tsx` | Range slider filter |
| `src/components/ui/table/data-table-view-options.tsx` | `core/datatable/components/DataTableViewOptions.tsx` | Column visibility toggle |
| `src/components/ui/table/data-table-skeleton.tsx` | `core/datatable/components/DataTableSkeleton.tsx` | Loading skeleton |
| `src/hooks/use-data-table.ts` | `core/datatable/hooks/useDataTable.ts` | Table state management hook |
| `src/lib/data-table.ts` | `core/datatable/utils/data-table.ts` | Pinning styles utility |
| `src/types/data-table.ts` | `core/datatable/types.ts` | Column meta types |
| `src/config/data-table.ts` | `core/datatable/config.ts` | Default config (page sizes etc) |

#### From `shadboard` (RTL-SAFE UI)

| Source File | Target File | What We Take |
|-------------|-------------|--------------|
| `src/components/ui/data-table/data-table-column-header.tsx` | `core/datatable/components/DataTableColumnHeader.tsx` | RTL-safe sorting header with `ms-*`/`me-*` classes |
| `src/components/ui/data-table/data-table-pagination.tsx` | `core/datatable/components/DataTablePagination.tsx` | RTL-safe pagination with icon flipping |
| `src/components/ui/data-table/data-table-column-toggle.tsx` | `core/datatable/components/DataTableColumnToggle.tsx` | Column visibility dropdown |

### Target Folder Structure

```
core/datatable/
├── MODULE.md                          # Already exists
├── index.ts                           # Barrel export
├── types.ts                           # Column meta types (variant, options, etc.)
├── config.ts                          # Default page sizes, etc.
├── components/
│   ├── DataTable.tsx                  # Main table with scroll, sticky headers
│   ├── DataTableToolbar.tsx           # Auto-renders filters from column meta
│   ├── DataTableColumnHeader.tsx      # RTL-safe sorting (from shadboard, enhanced)
│   ├── DataTablePagination.tsx        # RTL-safe pagination
│   ├── DataTableFacetedFilter.tsx     # Multi-select filter
│   ├── DataTableDateFilter.tsx        # Date picker filter
│   ├── DataTableSliderFilter.tsx      # Range slider filter
│   ├── DataTableViewOptions.tsx       # Column visibility toggle
│   ├── DataTableSkeleton.tsx          # Loading state
│   └── DataTableRowActions.tsx        # Per-row action dropdown (Edit, Delete, etc.)
├── hooks/
│   └── useDataTable.ts               # Table state, sorting, filtering, pagination
└── utils/
    └── data-table.ts                  # Pinning styles, helpers
```

### Column Header — Merge Strategy

The final `DataTableColumnHeader.tsx` merges both templates:

**From shadboard:** RTL-safe classes (`-ms-3`, `ms-2`, `me-2`)
**From shadcn-dashboard-2:** Reset sorting option, checkbox-style indicators for active sort

```typescript
// core/datatable/components/DataTableColumnHeader.tsx
// Merged: shadboard RTL classes + shadcn-dashboard-2 sort indicators
export function DataTableColumnHeader<TData, TValue>({
  column, title, className
}: DataTableColumnHeaderProps<TData, TValue>) {
  if (!column.getCanSort()) return <div className={cn(className)}>{title}</div>

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="sm" className="-ms-3 h-8 data-[state=open]:bg-accent">
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
          <ArrowUp className="me-2 size-4 text-muted-foreground/70" /> Asc
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => column.toggleSorting(true)}>
          <ArrowDown className="me-2 size-4 text-muted-foreground/70" /> Desc
        </DropdownMenuItem>
        {column.getIsSorted() && (
          <DropdownMenuItem onClick={() => column.clearSorting()}>
            <X className="me-2 size-4 text-muted-foreground/70" /> Reset
          </DropdownMenuItem>
        )}
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => column.toggleVisibility(false)}>
          <EyeOff className="me-2 size-4 text-muted-foreground/70" /> Hide
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
```

### Packages to Install

```bash
pnpm add @tanstack/react-table@8.21.2
```

> TanStack Table is likely already installed. Verify in package.json first.

---

## PART 3: IMPLEMENTATION ORDER

### Step 1: Install Dependencies
```bash
pnpm add @dnd-kit/core@6.3.1 @dnd-kit/sortable@10.0.0 @dnd-kit/utilities@3.2.2
pnpm add @tanstack/react-table@8.21.2
```

### Step 2: Copy UI Primitive (kanban.tsx)
1. Copy `shadcn-dashboard-2/src/components/ui/kanban.tsx` → `components/ui/kanban.tsx`
2. Copy `shadcn-dashboard-2/src/lib/compose-refs.ts` → `lib/compose-refs.ts`
3. RTL-adapt: replace all `ml-*`→`ms-*`, `mr-*`→`me-*`, `pl-*`→`ps-*`, `pr-*`→`pe-*`
4. Replace `rounded-lg` → `rounded-[--radius]` in column styles
5. Verify imports resolve (cn, Slot from radix-ui, etc.)

### Step 3: Build `core/kanban/` Components
1. `utils/restrict-to-container.ts` — copy from shadcn-dashboard-2
2. `components/KanbanColumnHeader.tsx` — shadboard style (color dot + title + count + value + actions)
3. `components/KanbanColumnActions.tsx` — dropdown with Edit/Delete
4. `components/KanbanCard.tsx` — shadboard Card structure wrapped in `<KanbanItem>`
5. `components/KanbanCardHeader.tsx` — `<KanbanItemHandle>` + badge + actions
6. `components/KanbanCardContent.tsx` — title + description + children slot
7. `components/KanbanCardFooter.tsx` — avatar stack + metadata
8. `components/KanbanCardActions.tsx` — dropdown with Edit/Move/Delete
9. `components/KanbanAddCardButton.tsx` — "+" button (conditional)
10. `components/KanbanBoard.tsx` — main wrapper using `<Kanban>` + `<KanbanBoard>` + `<ScrollArea>`
11. `components/KanbanEmptyColumn.tsx` — empty state
12. `components/KanbanDragOverlay.tsx` — ghost card
13. `components/KanbanCardSkeleton.tsx` — loading
14. `hooks/useKanbanBoard.ts` — derives columns from pipeline stages
15. `index.ts` — barrel export

### Step 4: Build `core/datatable/` Components
1. `types.ts` — column meta types from shadcn-dashboard-2
2. `config.ts` — default page sizes
3. `utils/data-table.ts` — pinning styles helper
4. `components/DataTableColumnHeader.tsx` — merged (shadboard RTL + shadcn-dashboard-2 features)
5. `components/DataTablePagination.tsx` — from shadboard (RTL-safe)
6. `components/DataTableToolbar.tsx` — from shadcn-dashboard-2 (auto-filter rendering)
7. `components/DataTableFacetedFilter.tsx` — from shadcn-dashboard-2
8. `components/DataTableDateFilter.tsx` — from shadcn-dashboard-2
9. `components/DataTableSliderFilter.tsx` — from shadcn-dashboard-2
10. `components/DataTableViewOptions.tsx` — from shadcn-dashboard-2
11. `components/DataTable.tsx` — main table from shadcn-dashboard-2
12. `components/DataTableSkeleton.tsx` — loading state
13. `components/DataTableRowActions.tsx` — per-row actions
14. `hooks/useDataTable.ts` — from shadcn-dashboard-2
15. `index.ts` — barrel export

### Step 5: Wire Entity Views
1. `core/entities/leads/views/LeadsBoardView.tsx` — uses KanbanBoard
2. `core/entities/leads/views/LeadsListView.tsx` — uses DataTable
3. `core/entities/deals/views/DealsBoardView.tsx` — uses KanbanBoard
4. `core/entities/deals/views/DealsListView.tsx` — uses DataTable
5. `core/entities/contacts/views/ContactsListView.tsx` — uses DataTable
6. `core/entities/companies/views/CompaniesListView.tsx` — uses DataTable

---

## PART 4: ENTITY LIST PAGE LAYOUT

Each entity page has a toolbar with view toggles:

```
┌─────────────────────────────────────────────────────────────────┐
│ [Leads ▾]  [+ New Lead]          [🔍 Search] [Board | List] [⚙] │
├─────────────────────────────────────────────────────────────────┤
│                                                                   │
│  Board View (Kanban)  OR  List View (DataTable)                  │
│                                                                   │
└─────────────────────────────────────────────────────────────────┘
```

- **Board | List** toggle: switches between KanbanBoard and DataTable
- **+ New Lead/Deal**: opens create dialog (only in first stage for board view)
- **Search**: filters both views
- **⚙**: column settings (DataTable), pipeline settings (Board)

---

## PART 5: RTL ADAPTATION CHECKLIST

Every file copied must pass this checklist:

- [ ] `ml-*` → `ms-*`
- [ ] `mr-*` → `me-*`
- [ ] `pl-*` → `ps-*`
- [ ] `pr-*` → `pe-*`
- [ ] `left-*` → `start-*`
- [ ] `right-*` → `end-*`
- [ ] `border-l` → `border-s`
- [ ] `border-r` → `border-e`
- [ ] `rounded-l-*` → `rounded-s-*`
- [ ] `rounded-r-*` → `rounded-e-*`
- [ ] `text-left` → `text-start`
- [ ] `text-right` → `text-end`
- [ ] `rounded-md/lg/xl` → `rounded-[--radius]` (except `rounded-full` for avatars)
- [ ] No hardcoded app strings
- [ ] No `ml-auto` → use `ms-auto`

---

## PART 6: WHAT NOT TO COPY

| Template File | Reason to Skip |
|---------------|----------------|
| shadboard `_contexts/kanban-context.tsx` | We don't use Context+Reducer — our primitive handles state |
| shadboard `_reducers/kanban-reducer.ts` | Same — not needed with @dnd-kit primitive |
| shadboard `@hello-pangea/dnd` imports | We use @dnd-kit exclusively |
| shadcn-dashboard-2 `features/kanban/utils/store.ts` | We use Convex queries, not Zustand for kanban data |
| shadcn-dashboard-2 `COLUMN_TITLES` hardcoded map | Our columns come from DB pipeline stages |
| Any mock data files | We use Convex queries |
| Any auth-related imports (Clerk, NextAuth) | We use Convex Auth |

---

## PART 7: DEPENDENCIES MAP

```
components/ui/kanban.tsx
  └── depends on: @dnd-kit/core, @dnd-kit/sortable, @dnd-kit/utilities, radix-ui (Slot), lib/compose-refs.ts

core/kanban/
  └── depends on: components/ui/kanban.tsx, components/ui/card.tsx, components/ui/badge.tsx,
                   components/ui/button.tsx, components/ui/dropdown-menu.tsx, components/ui/scroll-area.tsx

core/datatable/
  └── depends on: @tanstack/react-table, components/ui/table.tsx, components/ui/button.tsx,
                   components/ui/dropdown-menu.tsx, components/ui/input.tsx, components/ui/select.tsx,
                   components/ui/popover.tsx, components/ui/scroll-area.tsx

core/entities/*/views/
  └── depends on: core/kanban/, core/datatable/, convex queries/mutations
```

---

## Quick Reference: Template Paths

```
KANBAN LOGIC:
/Users/shaikumarfarooq/Clones/Orbitly/shadcn-dashboard-2/src/components/ui/kanban.tsx
/Users/shaikumarfarooq/Clones/Orbitly/shadcn-dashboard-2/src/features/kanban/utils/restrict-to-container.ts
/Users/shaikumarfarooq/Clones/Orbitly/shadcn-dashboard-2/src/features/kanban/components/kanban-board.tsx
/Users/shaikumarfarooq/Clones/Orbitly/shadcn-dashboard-2/src/lib/compose-refs.ts

KANBAN UI:
/Users/shaikumarfarooq/Clones/Orbitly/shadboard/full-kit/src/app/[lang]/(dashboard-layout)/apps/kanban/_components/kanban-task-item.tsx
/Users/shaikumarfarooq/Clones/Orbitly/shadboard/full-kit/src/app/[lang]/(dashboard-layout)/apps/kanban/_components/kanban-task-item-header.tsx
/Users/shaikumarfarooq/Clones/Orbitly/shadboard/full-kit/src/app/[lang]/(dashboard-layout)/apps/kanban/_components/kanban-task-item-content.tsx
/Users/shaikumarfarooq/Clones/Orbitly/shadboard/full-kit/src/app/[lang]/(dashboard-layout)/apps/kanban/_components/kanban-task-item-footer.tsx
/Users/shaikumarfarooq/Clones/Orbitly/shadboard/full-kit/src/app/[lang]/(dashboard-layout)/apps/kanban/_components/kanban-column-item-header.tsx
/Users/shaikumarfarooq/Clones/Orbitly/shadboard/full-kit/src/app/[lang]/(dashboard-layout)/apps/kanban/_components/kanban-column-actions.tsx
/Users/shaikumarfarooq/Clones/Orbitly/shadboard/full-kit/src/app/[lang]/(dashboard-layout)/apps/kanban/_components/kanban-task-item-actions.tsx

DATATABLE LOGIC:
/Users/shaikumarfarooq/Clones/Orbitly/shadcn-dashboard-2/src/components/ui/table/data-table.tsx
/Users/shaikumarfarooq/Clones/Orbitly/shadcn-dashboard-2/src/components/ui/table/data-table-toolbar.tsx
/Users/shaikumarfarooq/Clones/Orbitly/shadcn-dashboard-2/src/components/ui/table/data-table-faceted-filter.tsx
/Users/shaikumarfarooq/Clones/Orbitly/shadcn-dashboard-2/src/components/ui/table/data-table-date-filter.tsx
/Users/shaikumarfarooq/Clones/Orbitly/shadcn-dashboard-2/src/components/ui/table/data-table-slider-filter.tsx
/Users/shaikumarfarooq/Clones/Orbitly/shadcn-dashboard-2/src/components/ui/table/data-table-view-options.tsx
/Users/shaikumarfarooq/Clones/Orbitly/shadcn-dashboard-2/src/components/ui/table/data-table-pagination.tsx
/Users/shaikumarfarooq/Clones/Orbitly/shadcn-dashboard-2/src/hooks/use-data-table.ts
/Users/shaikumarfarooq/Clones/Orbitly/shadcn-dashboard-2/src/lib/data-table.ts
/Users/shaikumarfarooq/Clones/Orbitly/shadcn-dashboard-2/src/types/data-table.ts
/Users/shaikumarfarooq/Clones/Orbitly/shadcn-dashboard-2/src/config/data-table.ts

DATATABLE UI (RTL):
/Users/shaikumarfarooq/Clones/Orbitly/shadboard/full-kit/src/components/ui/data-table/data-table-column-header.tsx
/Users/shaikumarfarooq/Clones/Orbitly/shadboard/full-kit/src/components/ui/data-table/data-table-pagination.tsx
/Users/shaikumarfarooq/Clones/Orbitly/shadboard/full-kit/src/components/ui/data-table/data-table-column-toggle.tsx
```
