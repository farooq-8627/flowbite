# Entities — State

> Updated: 2026-05-14
> Status: 95% Complete — All 4 entity views scaffold-driven with list + board, universal ViewOptionsMenu, dynamic board grouping across every slot, custom-field sync, and instant/double-click convert flow. Remaining: AddCompanyDrawer restructure, tag-axis grouping, Files tab per entity.

## 🆕 2026-05-14 additions

| Component | File | Notes |
|---|---|---|
| ViewOptionsMenu | `core/entities/shared/components/ViewOptionsMenu.tsx` | Universal "View" popover — field visibility + group-by + hidden-status reveal. Replaces lead-only BoardOptionsMenu. Accepts `extraFields` from `useCustomFields`. |
| board-grouping helper | `core/entities/shared/utils/board-grouping.ts` | `getHiddenCardFieldsForGrouping` + `getRevealedCardFieldForGrouping` — auto-hide grouped-by field + reveal complementary. `NO_GROUP_KEY` sentinel. |
| useCustomFields | `core/entities/shared/hooks/useCustomFields.ts` | Reads `fieldDefinitions` per slot for ViewOptionsMenu.extraFields. |
| FieldValueRenderer kinds | `core/entities/shared/components/FieldValueRenderer.tsx` | Added `file`, `files`, `date`, `number`, `checkbox` render kinds for dynamic custom fields. |
| LeadCard convert flow | `core/entities/leads/components/LeadCard.tsx` | Single-click = instant convert, double-click = open drawer with deal option. Trash icon = mark lost. |
| AddLeadDrawer company section | `core/entities/leads/components/AddLeadDrawer.tsx` | Skip/Existing/New toggle; "New" renders inline company form + creates it alongside the lead. |
| Leads status table column | `core/entities/leads/hooks/useLeadColumns.tsx` | Colored pill matching the kanban column colour (via `getStatusColor`). |
| revertToLead mutation | `convex/crm/entities/contacts/mutations.ts` | Soft-deletes the contact + flips origin lead back to status="new". Surfaced in Contacts row actions. |
| Pipeline fallback | `convex/crm/fields/pipelines/queries.ts` | `getDefault` returns first pipeline for the entity if no `isDefault`. |

## ✅ Completed — Backend

| Module | File | Notes |
|---|---|---|
| Schema (all CRM tables) | `convex/schema.ts` | leads, contacts, companies, deals + modules[] extended with defaultView/cardFields/listColumns/boardGroupBy/defaultFilters/meta + users.preferences.entityDefaultView |
| Leads | `convex/crm/entities/leads/` | queries + mutations, canonical pattern complete |
| Contacts | `convex/crm/entities/contacts/` | personCode inherited from lead on conversion |
| Companies | `convex/crm/entities/companies/` | queries + mutations |
| Deals | `convex/crm/entities/deals/` | moveToStage + closeAsDone |
| Pipelines | `convex/crm/fields/pipelines/` | stages + stale config |
| Dedup engine | `convex/crm/fields/dedup/helpers.ts` | email/phone/name |
| People resolver | `convex/crm/people/queries.ts::getByPersonCode` | returns lead OR contact |
| Org mutations | `convex/orgs/mutations.ts` | update validator accepts new modules[] shape |

## ✅ Completed — Infrastructure

| Item | File | Notes |
|---|---|---|
| NuqsAdapter | `app/[locale]/layout.tsx` | Wraps app tree — required for nuqs URL state (useViewToggle + useDataTable) |
| DataTablePagination | `core/datatable/components/DataTablePagination.tsx` | Default pageSizeOptions [10,25,50,100], "Showing A–B of C" format |
| canvas-confetti | `package.json` | Installed for deal-won celebration |

## ✅ Completed — Frontend Scaffolds + Shared

| Component | File | Notes |
|---|---|---|
| EntityCard | `core/entities/scaffolds/EntityCard.tsx` | Generic card iterating cardFields via FieldValueRenderer |
| EntityPageLayout | `core/entities/scaffolds/EntityPageLayout.tsx` | Dedicated toolbar with split button + view toggle |
| EntityFormDrawer | `core/entities/scaffolds/EntityFormDrawer.tsx` | FormDrawer + dedup banner |
| EntityListPage | `core/entities/scaffolds/EntityListPage.tsx` | Wraps DataTable or KanbanBoard based on view state |
| FormDrawer | `core/entities/shared/components/FormDrawer.tsx` | Reusable right-side drawer |
| PersonDisplay | `core/entities/shared/components/PersonDisplay.tsx` | System component for rendering people (D8) |
| PersonSelect | `core/entities/shared/components/PersonSelect.tsx` | Combobox picker returning PersonRef (D7) |
| EntityHoverCard | `core/entities/shared/components/EntityHoverCard.tsx` | Hover → quick-view (D9) |
| EntityOverview | `core/entities/shared/components/EntityOverview.tsx` | Skeleton content (real content Slice 2) |
| FieldValueRenderer | `core/entities/shared/components/FieldValueRenderer.tsx` | Switch over render kinds → JSX |
| ViewToggleIcons | `core/entities/shared/components/ViewToggleIcons.tsx` | Two independent icon buttons (D3) |
| EmptyState | `core/entities/shared/components/EmptyState.tsx` | Shared empty state with CTA |
| StaleIndicator | `core/entities/shared/components/StaleIndicator.tsx` | Reads stage stale config (never hardcoded colors) |
| DedupBanner | `core/entities/shared/components/DedupBanner.tsx` | Edit fields + link to existing (D10) |
| field-catalog | `core/entities/shared/config/field-catalog.ts` | FIELD_CATALOG per entity |
| defaults | `core/entities/shared/config/defaults.ts` | Fallback defaults for all config (D11) |
| useViewToggle | `core/entities/shared/hooks/useViewToggle.ts` | URL → workspace → fallback (D6) |
| useModuleDisplay | `core/entities/shared/hooks/useModuleDisplay.ts` | cardFields/listColumns/boardGroupBy |
| useDedup | `core/entities/shared/hooks/useDedup.ts` | ConvexError DUPLICATE handler |
| useBulkActions | `core/entities/shared/hooks/useBulkActions.ts` | Row selection state |
| usePerson | `core/entities/shared/hooks/usePerson.ts` | Resolves personCode → PersonRef |
| Shared types | `core/entities/shared/types.ts` | EntitySlot, PersonRef, ViewKind, FieldSpec |

## ✅ Completed — Per-Entity Views (all 4)

| Entity | View File | Features |
|---|---|---|
| Leads | `core/entities/leads/views/LeadsView.tsx` | List + board (grouped by status), Add Lead drawer with dedup, Convert Lead drawer (single + bulk), split button (D4) |
| Contacts | `core/entities/contacts/views/ContactDetailView.tsx` | List + board (grouped by assignedTo), primary = Convert Lead (hidden if no permission per Q-v3.2 option A) |
| Deals | `core/entities/deals/views/DealDetailView.tsx` | List + board (pipeline stages), moveToStage on drag, confetti on won, value hidden from member role |
| Companies | `core/entities/companies/views/CompaniesView.tsx` | List + board (grouped by industry, fallback "Uncategorized"), Add Company drawer |

## ✅ Completed — Gap Module Stubs

| Module | File | Notes |
|---|---|---|
| Catalog | `features/catalog/MODULE.md` | Schema sketches for catalogItems + dealLineItems |
| Documents | `features/documents/MODULE.md` | Schema sketches for documents + documentTemplates |
| Workflows | `features/workflows/MODULE.md` | Schema sketches for workflows + workflowRuns |

## ⬜ Pending

| Task | Priority | Notes |
|---|---|---|
| BoardCardFieldsMenu | LOW | Per-session show/hide card fields + "Save as default" |
| DynamicFieldRenderer | LOW | Renders fieldDefinitions (Phase 2 Slice 6) |
| Entity detail pages (real content) | MEDIUM | Profile tabs, company tabs, deal detail |

## Architecture Notes (2026-05-12)

- All 4 entities render through the same 4 scaffolds (EntityListPage, EntityPageLayout, EntityCard, EntityFormDrawer). Zero custom layout per entity.
- View toggle uses nuqs for URL state (`?view=list|board`). NuqsAdapter wraps the app tree in layout.tsx. Precedence: URL → workspace default → fallback constant.
- Card fields, list columns, and board groupBy are DB-configurable from day 1. Hardcoded constants in `defaults.ts` serve as fallback only.
- PersonSelect returns full PersonRef (never just an id). Search built-in via Combobox.
- Contacts page primary action = Convert Lead (hidden if user lacks `leads.convert` permission).
- Deal kanban uses `listGroupedByStage` query (server-side grouping with daysInStage + isStale).
- canvas-confetti fires on positive final stage drop.
- DataTablePagination defaults updated to [10,25,50,100] with "Showing A–B of C" format.
- All new code uses RTL-safe classes, dynamic radius, no hardcoded entity labels.
