# Entities — State

> Updated: 2026-05-19 (round 3 — DealDetail + CompanyDetail get Timeline/Follow-ups, EntityFilesPanel duplicate row fix)
> Status: ~99% complete. Detail pages for deals + companies now match the profile parity (Timeline + Follow-ups tabs, Overview embeds summary cards). EntityFilesPanel no longer renders a duplicate trash-less row. Forms, cards, and drawer UX remain at production-grade density.
>
> **2026-05-19 round 3 — detail-page parity + Files dedup.**
>
> 1. **DealDetailView gets Timeline + Follow-ups tabs.** Added two new
>    tabs (Timeline, Follow-ups) using `<EntityTimeline entityType="deal">`
>    and `<EntityFollowups entityType="deal">`. Overview tab gets two
>    embedded summary cards (Recent activity + Open follow-ups) with
>    `View all` links that switch tabs. Tabs: Overview / Timeline /
>    Follow-ups / Calendar / Reminders. File: `core/entities/_entities/deals/views/DealDetailView.tsx`.
>
> 2. **CompanyDetailView gets Timeline + Follow-ups tabs.** Same pattern
>    (passes `entityType="company"` + `entityId=company.companyCode`,
>    no `personCode` since companies don't have a primary person).
>    Tabs: Overview / Timeline / Follow-ups / Calendar.
>    File: `core/entities/_entities/companies/views/CompaniesView.tsx`.
>
> 3. **EntityFilesPanel — no more duplicate row.** Previously the panel
>    stacked `<FileUpload>` (which has its own internal `<FileList>`
>    from `useFileAttachments.listByScope`) on top of a separate merged
>    `<FileList>` from `listForEntity`. Direct-scope files appeared
>    twice — once with trash, once without. Refactored to render the
>    dropzone alone (`<FileDropzone>`) + a single merged `<FileList>`
>    wired to `useFileAttachments.remove`, so every row has a trash
>    icon and there are no duplicates. File:
>    `core/entities/shared/components/EntityFilesPanel.tsx`.
>
> **2026-05-19 round 2 — activity logs are now field-level + EntityHoverCard
> delegation.**
>
> 1. New helper `convex/_shared/fieldUpdateLog.ts::logFieldUpdates` diffs
>    the old document against the patch and emits ONE activity log per
>    actually-changed field with `action: "field_updated"` and metadata
>    `{ field, fromValue, toValue }`. `leads.update`,
>    `contacts.update`, `deals.update`, and `companies.update` all use
>    this in place of the old generic "Lead updated: name" entry.
>
> 2. `TimelineBareEntry` now uses `entry.description` as the headline for
>    `field_updated` rows so the user sees "Status: new → qualified"
>    directly instead of a generic "Lead updated" — `extractSubject`
>    skips its colon-split for `field_updated` to avoid mis-rendering
>    the change pair as a subject.
>
> 3. `convex/crm/entities/deals/queries.ts::listByPersonCode` added —
>    used by the new `OverviewCard` to surface the latest 3 deals on a
>    profile page or hover preview.
>
> 4. `EntityHoverCard` now delegates person previews to
>    `<OverviewCard compact />` so hover and the profile Overview tab
>    share one source of truth. Deal/company hover still uses the older
>    `EntityOverview`.
>
> **2026-05-19 — `EntityCard.statusDot` + LeadCard.** Added an optional
> `statusDot` prop on `EntityCard` rendered in the top-right of row 1,
> just before the tags slot. The dot is a small coloured circle with a
> tooltip; it shares row 1's `ms-auto` cluster with the tags so the
> layout is stable whether tags are present or not. `LeadCard` now
> always passes `statusDot` (computed from `item.status` via
> `getStatusColor("lead", status)`), so on the new All-Profiles page
> (which can't groupBy=status because it stacks two boards) every lead
> card still surfaces its lifecycle stage. ContactCard parity is
> automatic — both views render through the SAME `EntityCard`, so
> tags + assignee + AI summary + group-replacement strip all work
> identically on the profiles page.
>
> **2026-05-18 — Task 5 wiring + EntityCodeSelector.** Added
> `core/entities/shared/components/EntityCodeSelector.tsx`: a Combobox-style
> picker that reuses `useEntitySearch` from notes and renders avatar + name
> + code on the selected chip. `ReminderForm` now uses it to attach
> reminders to leads / contacts / deals / companies (replaces the old
> person-only `PersonSelect`). `DealDetailView` and `CompanyDetailView`
> shells now resolve via `getByDealCode` / `getByCompanyCode` and mount
> `EntityCalendarPanel` (deals + companies) and `RemindersPanel` (deals).
> Both views still need full Slice 2/3/4 detail content; the calendar +
> reminders tabs are testable today via the dashboard, the reminders
> page, and the profile route.
>
> **2026-05-18 perf fix #5 — TagsCell `listByOrg` lazy subscription**:
> `TagsCell` was firing `api.crm.shared.tags.queries.listByOrg` on EVERY
> visible board card on mount, even though that query (the org's full
> tag catalogue) is only needed inside the picker popover. Convex
> deduplicates the round-trip but the dashboard's "Function Calls"
> counter records every `useQuery` registration separately — with ~10
> cards on a board, that's 10 extra subscriptions per page mount. Fix:
> gate the subscription on `open && orgId` so it fires once on the first
> tag-edit and stays warm only as long as the user is in pick mode.
> The per-row `getTagsForEntity` was already prefetched via
> `useEntityTagsMap` — that path is unchanged.
>
> **2026-05-18 perf fix #4 — leads optimistic update no longer bumps
> `updatedAt`**: per AGENTS.md "Every list-affecting mutation has
> `withOptimisticUpdate`" rule, the optimistic patch must NOT bump
> `updatedAt: Date.now()` because that changes row identity on every
> render and cascades list invalidations. The leads board was doing
> exactly that. Fixed `LeadsView::updateLead.withOptimisticUpdate` to
> only patch the user-visible fields (`status`, `assignedTo`, `source`,
> `sortOrder`) and leave `updatedAt` to the server. Net effect: drag
> drop = 1 mutation + 1 optimistic patch + 0 list re-subscriptions
> until the server roundtrip lands and reactively refreshes the list.
>
> **2026-05-18 perf fix #3 — single-write drag (the "real" fix)**: the
> previous "one mutation per drop" change still fired ONE mutation per
> *displaced* card, not just the dragged one. So a drop into a column
> with 5 cards still emitted ~6 mutations + ~30 list re-runs. Fix: the
> dnd-kit primitive now passes `draggedItemId` to `onCommit`, and
> `KanbanBoard.onCommit` persists ONLY that card's new (column, index).
> The other cards' `sortOrder` values DO NOT need to change — the
> dragged card's fractional sortOrder slots between two existing
> values, displacing them visually without rewriting them. Net effect:
> N drops = N mutations, regardless of how many cards are in the
> destination column. Test: `convex/crm-hardening.test.ts::"notes.reorder
> (single-write invariant)"` locks this contract by asserting that
> reorder leaves sibling rows untouched.
>
> **2026-05-18 perf fix #2 — visual feedback during drag**: when the
> previous fix removed `onValueChange` as a persistence path, a side
> effect was that visual reorder during drag also stopped working
> (cards no longer made space, cross-column hover bg colour stopped
> changing). Root cause: the kanban primitive stored the in-flight
> layout in a `useRef`, which never triggers re-render. Fix: converted
> to `useState` (`pendingLayout`), exposed via `useKanbanItems()` hook,
> and lifted `<KanbanBoardBody>` / `<NotesSingleBoardCards>` into child
> components that subscribe to it. Drag visual feedback now works
> end-to-end without firing any Convex calls.
>
> **2026-05-18 perf fix — per-card tag subscription elimination**: every
> `EntityCard` rendered on a kanban was firing its own
> `crm.shared.tags.queries.getTagsForEntity` subscription. With ~10
> visible cards on the leads / contacts / deals / companies boards this
> manifested as 100+ Convex calls / minute on a single user's session
> (visible in the dashboard "Function Calls" chart as a tall green spike
> next to `notes:listForOrg`). Fix: added `prefetchedTags` prop to
> `EntityCard` (and the wrapper `LeadCard`), wired it from each board
> view (`LeadsView`, `ContactsView`, `DealDetailView`, `CompaniesView`)
> via `useEntityTagsMap(orgId, slot).tagsByEntityId[item.id]`. When
> provided, `<TagsCell>` reads from the prefetched array and skips the
> per-card `useQuery`. Embedded panels and standalone callers without a
> board-wide map fall back to the legacy per-card path — no breaking
> change for consumers.
>
> **2026-05-18 perf fix — server-side rate limit on drag mutations**:
> `notes.reorder`, `notes.setCategory`, `leads.update`, `contacts.update`,
> `deals.update`, `deals.moveToStage`, `companies.update` all now gate
> on `enforceRateLimit` with a 120/min budget (scoped per
> user+org pair). `notes.reorder` and `notes.setCategory` share the
> same scope so a user can't bypass by alternating across columns.
> `deals.update` and `deals.moveToStage` share scope for the same
> reason. Defensive: catches future regressions early instead of
> burning the free-tier quota.
>
> **2026-05-18 perf fix — kanban drag firing one mutation per frame**:
> the dnd-kit `Kanban` primitive in `components/ui/kanban.tsx` emits
> `onValueChange` on every `onDragOver` event (every time the dragged
> card crosses a sibling). The entity board's `KanbanBoard` consumer
> wired its persistence callback (`onCardMove` → server mutation) to
> `onValueChange`, which meant a single cross-column drag fired N+1
> mutations (one per frame) instead of one per drop. The visible
> symptom was leads/deals cards bouncing through several positions
> before settling on the dropped slot. Fix: added `onCommit` callback
> to the primitive (fires EXACTLY once per drop in `onDragEnd`,
> guaranteed via an internal `pendingLayoutRef` that mirrors the
> as-if-applied layout during drag). `KanbanBoard` now persists from
> `onCommit`, never from `onValueChange`. Same fix for
> `NotesSingleBoard`. `onValueChange` still emits during drag for
> visual reorder feedback but is no longer used for mutations.
>
> **2026-05-18 board UX fixes**:
>   1. `EntityCard` no longer renders an always-on built-in field strip.
>      Instead it surfaces a single `GroupReplacementStrip` (top-right or
>      bottom-left) **only** when the active `groupBy` vacates a layout
>      slot:
>        - `groupBy="tag" | "tags"` → tag chip slot vacated → strip in
>          top-right showing the revealed field (status for leads,
>          industry for companies, companyId for contacts, etc.).
>        - `groupBy="assignedTo"` → assignee avatar slot vacated → strip
>          in bottom-left where the avatar used to be.
>        - `groupBy="status" | "source" | "industry" | "companyId" |
>          "currentStageId"` → no slot vacated → tiny coloured dot
>          appended after the assignee avatar (with a Tooltip that
>          discloses the field name + label).
>      Wired by passing `groupBy` AND `resolveReplacementLabel` (a
>      `useCallback`-stable resolver that turns opaque ids — userId,
>      companyId, stageId — into human labels using the maps each view
>      already maintains: `memberNameById`, `companyNameById`,
>      `stageNameById`). Each view reads only data already in scope; no
>      extra Convex queries are fired from inside `EntityCard`. See
>      `GroupReplacementStrip` + `FIELD_DISPLAY_TITLES` at the bottom of
>      `core/entities/shared/components/EntityCard.tsx` and the reveal
>      matrix in `core/entities/shared/utils/board-grouping.ts`.
>
>      `viewopts:{slot}:cardFields` localStorage keys bumped to `:v2` for
>      all four slots so users with stale cardFields entries (that
>      assumed the always-on strip) get a fresh seed against the current
>      admin-visible field set on next visit.
>   2. `handleCardMove` in all four views (lead/contact/deal/company) now
>      handles `groupBy === "tag" | "tags"` properly. Cross-column tag
>      drops attach the destination tag and detach the source via
>      `tags.attachToEntity` + `tags.detachFromEntity`. Drops onto the
>      `__none__` (NO_GROUP_KEY) column detach the source without
>      attaching anything new (fully removes that tag from the entity).
>   3. `leads.update` / `contacts.update` now propagate `assignedTo`
>      changes to their linked counterpart — a kanban drag on the
>      contacts board updates the source lead too, and vice versa.
>      Idempotent: only fires when the value actually differs.

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
