# datatable Module (Core)

> Shared data table primitives using @tanstack/react-table. Used by all CRM entity list views.

## Ownership
- **Location**: `core/datatable/`
- **Backend**: None (pure UI primitives)
- **Phase**: 2 | **Status**: NOT_STARTED

## Rules
- [ ] R-DT-01: Table is headless — all rendering done by our shadcn components, not tanstack defaults
- [ ] R-DT-02: Column definitions come from consumer modules — datatable doesn't know about entities
- [ ] R-DT-03: All filtering/sorting state synced to URL params for shareability
- [ ] R-DT-04: Pagination uses cursor-based pagination from Convex (not offset-based)

## Checklist
- [ ] `components/DataTable.tsx` — configurable table shell
- [ ] `components/DataTableToolbar.tsx` — filters, search, view toggle
- [ ] `components/DataTablePagination.tsx` — pagination controls
- [ ] `components/DataTableColumnHeader.tsx` — sortable column headers
- [ ] `components/DataTableFacetedFilter.tsx` — faceted filter dropdowns
- [ ] `hooks/useDataTable.ts` — table state management
- [ ] `types.ts` — generic table column/filter types

## Avoids
- ❌ Never import entity-specific types — table is entity-agnostic
- ❌ Never use offset-based pagination with Convex
- ❌ Never hardcode column definitions in the datatable module

## Cross-Module Dependencies
- **READS FROM**: None (receives data + columns via props)
- **WRITES TO**: None (emits callbacks)
- **CONSUMERS**: All entity list views in `core/entities/`
