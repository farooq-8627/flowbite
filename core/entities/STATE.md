# Entities — State

> Updated: 2026-05-15
> Status: ~99% complete. Forms now match production-grade density. Card +
> drawer + file UX polished across all four entities. Stage filter +
> saved views shipped. Only the AI summary pipeline remains in this lane.

## What's shipped

### The dynamic field system

Every field — `displayName`, `email`, `phone`, `status`, `assignedTo`, `tags`,
`personCode`, plus admin-added custom fields — is a row in `fieldDefinitions`.
A single hook (`useEntityFields`) feeds:

- The table column builder (`useEntityColumns` / cells/cell-dispatcher).
- The generic form (`EntityFieldForm` / inputs/input-dispatcher).
- The view-options menu (per-user toggles).
- The card highlight chips (admin-flagged custom fields).

Adding a field once → it appears in form, table, view options, and (if flagged
in cardFields) the kanban card. Reorder once → everywhere updates. Hide once →
invisible everywhere for everyone (admin) or just one user (per-user toggle).

See `DYNAMIC_FIELDS_BLUEPRINT.md` for the full architecture summary.

### Per-entity views

| Entity | Path | Notes |
|---|---|---|
| Leads | `_entities/leads/views/LeadsView.tsx` | List + board. Single-click convert / double-click "with options". Mark-lost shortcut. First-time coachmarks. Highlight chips for admin-flagged custom fields. |
| Contacts | `_entities/contacts/views/ContactDetailView.tsx` | List + board (assignedTo). |
| Deals | `_entities/deals/views/DealDetailView.tsx` | Pipeline kanban with stage drag, won-confetti. |
| Companies | `_entities/companies/views/CompaniesView.tsx` | List + board (industry). CompanyDrawer with multi-assignee + multi-person picker. |

### Card system (`EntityCard`)

```
┌─────────────────────────────────────────────┐
│ ◎ Name                          [tag][tag]  │  identity + tags
│   email                                     │
├─────────────────────────────────────────────┤
│ AI: Short 1–2 line summary  ▾               │  aiSummary (optional)
├─────────────────────────────────────────────┤
│ [Budget: $1.5M]  [Property: Villa]          │  highlight chips (admin-flagged)
├─────────────────────────────────────────────┤
│ [P-001] ◎asgn        ⋮ [📎3] [+] [🗑]      │  code + assignee · menu + shortcuts
└─────────────────────────────────────────────┘
                                              ↑
                                grip (drag handle on right edge)
```

- Hand-designed slots: avatar/name/email (top-left), tags (top-right),
  personCode + assignee (bottom-left), menu + shortcuts (bottom-right).
- Drag handle is the vertical grip on the right edge — only that triggers
  drag, every other piece of the card behaves as expected (clicks, hovers).
- AI summary expands on click.
- Highlight chips render up to 3 admin-flagged custom fields with a
  bg-primary tint, formatted by kind (currency → USD, date → locale).
- Per-user `cardFields` from ViewOptionsMenu controls visibility of every
  toggleable piece — pinned slots ignore it.
- `displayName` toggle now correctly hides the name (was a bug pre-2026-05-15).

### First-time coachmarks (`<FirstTimeTour>`)

`components/ui/first-time-tour.tsx` — sequential overlay that points at DOM
elements tagged with `data-tour="…"`. Shows once per device (localStorage
under `flowbite:tours:seen`). Three steps live on the leads board:
single/double-click convert, drag-to-status, view-options. See AGENTS.md for
the usage rules.

### Forms (`EntityFieldForm`)

Round 5 redesign — production-grade density inspired by Linear / Attio /
Pipedrive:

- Section bands instead of `<details>` collapsibles: small-caps section
  header + hairline divider. Quieter, denser, more "premium".
- Tight spacing: `gap-2.5` between fields, `gap-1` between label + input,
  11px labels, h-9 inputs, subtle `text-destructive/60` required asterisk.
- Two-column auto-layout for short related fields (email + phone, value +
  assignee, industry + website). Detected by field kind/type.
- Tags + assignees + status / source always span full width.

Inputs come from `inputs/input-dispatcher`. The new MultiSelect (`components/
ui/multi-select.tsx`) drives every multi-pick: TagPicker, CompanyDrawer's
assignee + people pickers, ConvertLeadDrawer's lead picker. Pattern: trigger
shows summary text only (no chips), popover lists rows with left content +
right checkbox. `modal={true}` so it works inside the Sheet's focus trap
(which fixed the "can't select tags in form" bug).

### IdentityBadge

`core/entities/shared/components/IdentityBadge.tsx` — universal "this is a
record" component. Layouts: `code` (just the pill, primary-tinted), `row`
(avatar + name + subtitle), `stack` (avatar + name on row 1, subtitle on
row 2). Replaces PersonCodeBadge across the codebase (kept as deprecated
re-export). Pill colour is `bg-primary/10 text-primary border-primary/30`
so it stands out as a navigable identifier.

### Universal file storage

Round 5 update:

- Files attach only at **org-wide** (`scope="org"`) or **personCode**
  (`scope="person"`) level. No per-entity Files tab.
- Cross-entity attribution via `tags?: string[]` on the file row. Example:
  a contract uploaded "for deal D-001" lives at the personCode level with
  tags=`["deal:D-001"]`. The deal detail view (when wired) reads files via
  `files.queries.listByTag({ tag: "deal:D-001" })`.
- Org-level admin policy in **Settings → Workspace → File Policy**: pick
  allowed file categories (Image / PDF / Document / Spreadsheet / Video /
  Audio / Archive / Other) + max size MB. `core/files/file-categories.ts` is
  the single source of MIME mappings.
- **Create-mode uploads**: `useFileBuffer` hook + `<FileBufferProvider>`
  wraps the form drawer, `<CreateModeFileField>` is the buffered renderer
  used by the input dispatcher. Bytes upload to storage immediately; the
  `files` table row is recorded after entity creation by calling
  `fileBuffer.commitAll({scope, scopeId})`. AddLeadDrawer wires this with
  scope=`"person"`, scopeId=personCode.

### Stage-aware tables

Two new toolbar widgets:

- `<StageFilter>` — dropdown that scopes the deals table to a specific
  pipeline stage. Board view stays grouped by stage so the filter is
  list-only.
- `<SavedViewsMenu>` — per-user named column-set switcher. Persists to
  `users.preferences.savedViews[slot]` (schema + updatePreferences mutation
  extended in Round 5). Includes "Save current view…" and "Delete" actions.

### First-time coachmarks (`<FirstTimeTour>`)

Round 5 expansion: tours wired to leads board, contacts board, deals board,
companies board, AND the dashboard (highlights the QuickAdd + button). Per-
device localStorage gate per tour id. The grip + convert buttons no longer
show tooltips — the tour explains the gesture once.

## Pending

| Task | Priority | Notes |
|---|---|---|
| AI summary generator | MEDIUM | Card already shows `item.aiSummary` if present. Need the cron / on-update generator. **Deferred to AI phase.** |
| "Replay tutorials" button | LOW | Surface `resetAllTours()` in Appearance settings. |
| Card highlight admin picker | LOW | Today driven by cardFields. Later: dedicated "show on card" toggle in Fields manager. |
| Stage filter for non-deal entities | OPTIONAL | Only deals have stages today; contacts/leads use status. The current filter is deal-only by design. |

## Recent history

- 2026-05-15 — Round 5 redesign: production-grade form density, MultiSelect
  primitive (no pills, left-content + right-checkbox), IdentityBadge
  replaces PersonCodeBadge with primary-coloured pill, EntityCard supports
  company + deal slots with industry/value subtitles, avatar bug fixed,
  ConvertLeadDrawer rewritten as multi-select of unconverted leads,
  AddDealDrawer redesigned with empty-state CTA when no pipelines,
  CompanyDrawer redesigned, file upload system overhauled (org-wide +
  personCode-only scope, tag-based attribution, create-mode buffer,
  admin file-type policy), tooltips removed on tour-tagged buttons,
  FirstTimeTour expanded to dashboard + contacts + deals + companies,
  StageFilter + SavedViewsMenu shipped for table toolbars.
- 2026-05-15 — Round 4 polish: name-hide bug fixed, ModuleDisplay layout
  aligned to Settings style, ViewOptionsMenu strips protected fields,
  TagPicker switched to popover dropdown, PersonSelect resolves stubs, file
  field placeholder polished, EntityFieldForm switched to stacked layout,
  card highlight slot shipped, FirstTimeTour added.
- 2026-05-14 — Phases 0→9 of dynamic fields shipped. `useLeadColumns`,
  `FIELD_CATALOG`, `DEFAULT_LIST_COLUMNS`, `DEFAULT_CARD_FIELDS`,
  `BoardOptionsMenu`, `useCustomFields`, workspace `ModuleDisplaySection` all
  deleted. `useModuleDisplay` trimmed to `boardGroupBy` only.
- 2026-05-12 — Universal `ViewOptionsMenu`, dynamic board grouping across all
  slots, single-click instant convert, drag-and-drop status update, mark-lost
  shortcut.

## Architecture invariants

- All four entities render through the same scaffolds (EntityListPage,
  EntityFormDrawer, EntityCard). The toolbar chrome (`EntityPageLayout`,
  `ViewToggleIcons`, `EmptyState`, `ViewKind`) was lifted to
  `core/shell/shared/entity-layout/` on 2026-05-17 so Notes (and future
  shared views) reuse the exact same 40px toolbar. Import them via the
  barrel: `@/core/shell/shared/entity-layout`. `EntityListPage` +
  `EntityFormDrawer` stay here because they depend on entity-specific
  helpers (DataTable + Kanban entity-card rendering, dedup banner).
- View toggle uses nuqs (`?view=list|board`). Precedence: URL → workspace
  default → fallback constant.
- `fieldDefinitions` is the single source of metadata.
- All visible entity labels go through `useEntityLabels()` so renames flow
  through the UI live.
- RTL-safe classes (`me-*`/`ms-*`/`pe-*`/`ps-*`) and dynamic radius
  (`rounded-[var(--radius)]`) everywhere.
- One drag handle per card (right-edge grip). Every other interactive
  element is wrapped in an event-stop container so dnd-kit doesn't eat its
  click.
