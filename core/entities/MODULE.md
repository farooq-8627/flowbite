# entities Module (Core)

> All CRM entities: leads, contacts, deals, companies + 2 optional vertical
> slots (`entity5`, `entity6`). Shared scaffolds drive every entity through the
> same patterns — new entity = ~5 files, 1-2 days.

## Where things live

```
core/entities/
├── _entities/              ← per-entity views, drawers, hooks
│   ├── leads/
│   ├── contacts/
│   ├── deals/
│   ├── companies/
│   ├── entity5/
│   └── entity6/
├── shared/                 ← scaffolds + components used across all 4 entities
│   ├── components/
│   │   ├── EntityCard.tsx          (the ONE card every entity renders)
│   │   ├── EntityFieldForm.tsx     (the ONE form every entity renders)
│   │   ├── ViewOptionsMenu.tsx     (per-user toggles)
│   │   ├── PersonDisplay.tsx       (avatar + sections, links to /profile/<personCode>)
│   │   ├── PersonSelect.tsx        (combobox returning full PersonRef)
│   │   ├── TagPicker.tsx           (popover dropdown w/ create-on-the-fly)
│   │   ├── inputs/input-dispatcher.tsx
│   │   └── cells/cell-dispatcher.tsx
│   ├── hooks/
│   │   ├── useEntityFields.ts      (single source of field metadata)
│   │   ├── useEntityColumns.tsx    (table column builder)
│   │   └── useModuleDisplay.ts     (board groupBy)
│   └── config/defaults.ts
├── scaffolds/                      (EntityListPage, EntityPageLayout, EntityFormDrawer)
└── views/EntitySlugView.tsx        (route resolver)
```

## The personCode invariant

Every person enters as a `Lead`. At that moment, `personCode` is generated
(`P-001`). It NEVER changes and travels to every related record:

```
Lead    → personCode "P-001" (generated here)
Contact → personCode "P-001" (inherited on conversion)
Deal    → personCode "P-001" (direct field)
Follow-up / file / message → personCode "P-001"
```

The unified profile page at `/profile/[personCode]` aggregates EVERY record
that belongs to that person — leads, contacts, deals, follow-ups, files,
messages — across the entity boundary.

## What the system can do today

| Capability | Mechanism | Read more |
|---|---|---|
| Add a field once → it appears everywhere | `fieldDefinitions` table + `useEntityFields` | `DYNAMIC_FIELDS_BLUEPRINT.md` |
| Reorder, hide, edit, delete fields | Drag-reorder list in Settings → Modules → \[Entity\] → Fields | `core/settings/components/groups/modules/SlotFieldsSection.tsx` |
| Per-user view toggles (table cols, card fields) | `ViewOptionsMenu` writes to `users.preferences` | `core/entities/shared/components/ViewOptionsMenu.tsx` |
| Rename "Lead" → "Inquiry" | `org.entityLabels`; `useEntityLabels()` reactive hook | `core/shared/hooks/useEntityLabels.ts` |
| Single-click instant convert | `LeadCard` event-stop wrapper + 240ms double-click guard | `_entities/leads/components/LeadCard.tsx` |
| First-time gesture coachmarks | `<FirstTimeTour>` with `data-tour` targeting | `components/ui/first-time-tour.tsx` |
| Dynamic kanban grouping | Switch `groupBy` between status / assignee / source / tag | `_entities/leads/views/LeadsView.tsx` |
| Card highlight slot for "important" custom fields | `EntityCard.highlightFieldDefs` filtered by cardFields | `core/entities/shared/components/EntityCard.tsx` |
| AI summary on cards | `item.aiSummary` rendered in middle row when present | (generator pending) |
| Universal file storage | `core/files/components/FileUpload`, scope-aware | `core/files/` |
| Industry presets seed fields on org creation | `convex/orgs/templates/fields.ts` + `ensureForOrg` mutation | `convex/crm/fields/fieldDefinitions/internal.ts` |

## Conversion flows

```
Lead ─[convert]→ Contact (personCode preserved)
                   │
                   └─[also create deal? optional]─→ Deal (linked back to contact + personCode)
```

- Single-click on the card's `+` shortcut = instant convert (no form).
- Double-click = open the convert drawer (with the "Also create a deal?"
  toggle).
- Bulk select rows → "Convert N" toolbar button (single drawer, all at once).

```
Contact ─[revertToLead]→ Lead (back to status="new")
```

## What's marketing-worthy

See `DYNAMIC_FIELDS_BLUEPRINT.md` §7 for the full pitch list. Highlights:

- "Pick your industry. We do the rest."
- "One field. Every screen."
- "Click to convert. Double-click for options."
- "Drag to change status."
- "Your view, your rules."
- "We teach the gesture. Once."

## Pending — see `STATE.md` §Pending

- Stage filter UI on tables.
- Saved views per user.
- Files tab on entity detail views.
- AI summary generator (the slot exists; the writer is missing).
- "Replay tutorials" button in Appearance settings.


## 2026-05-17 — Per-user persisted column order

| # | Decision | Outcome |
|---|---|---|
| 1 | LeadsView / ContactDetailView (the contacts list view) / CompaniesView all wire `usePersistedColumnOrder(slot, boardColumns)` and pass the resulting `onColumnReorder` to `EntityListPage`. | Column drag now sticks across reloads. Slot keys include the active `groupBy` so swapping groupings doesn't carry stale orderings (`lead:status` vs `lead:assignedTo` vs `lead:tag`). |
| 2 | Deals board is intentionally NOT wired in this pass. | Pipeline stages are an org-wide doc gated on `pipelines.manage`. The follow-up adds a server reorder call, an early-return when the user lacks the perm, and an optimistic local update. Tracked in `core/entities/_entities/deals/MODULE.md`. |


## 2026-05-17 — EntityCard drag smoothness

| # | Decision | Outcome |
|---|---|---|
| 1 | EntityCard now uses `transition-shadow` (not `transition-all`) and drops `opacity-60` while dragging. | Aligns the drag-overlay clone with the notes board's smoother feel. Tailwind's `transition-all` was animating the dnd-kit transform, fighting the primitive's own transition string and looking janky. The card-flash border animation is a `@keyframes` so it still works without `transition-all`. The hover affordances now only apply when not dragging. |


## 2026-05-21 — Tables unified through `useEntityColumns`; deals tables become stage-aware

| # | Decision | Outcome |
|---|---|---|
| 1 | Contacts, Companies, Deals tables all flow through `useEntityColumns` (same path leads has used since the dispatcher landed). The hand-rolled `useMemo<ColumnDef>` blocks in those views are gone, and `core/entities/_entities/deals/hooks/useDealsListColumns.tsx` is deleted. | One column factory drives every table. Sortable headers (via `<DataTableColumnHeader>`), batched tags via `tagsByEntityId`, batched companies via `companiesByPersonCode`, dispatcher-rendered cells (proper labels, currency from org settings, `+` inline-edit button on every empty cell) — all consistent across entities. The kanban side is untouched; only the list path changed. |
| 2 | Tables remain "render every visible field" for leads, contacts, companies. For deals, when the toolbar `StageFilter` is set, the table narrows to *Default-stage pinned* fields (the admin-curated always-on set: dealCode, title, value, assignee, etc.) PLUS the *active stage's* pinned fields. No filter → every visible field, same as before. The `deals.viewValues` permission still gates the `value` column on top of stage logic. | Admin-driven, no hardcoded "default" lists. The pipeline's Default stage (stage with `isDefaultStage: true`) is the SSOT for "always-on" deal fields, matching locked rule 11. The narrowing is implemented in `DealsView` by computing `hiddenColumnIds: Set<string>` and forwarding it to `useEntityColumns` — the factory itself stays renderer-agnostic. The doc-comment in `useEntityFields.ts` was updated to make this contract explicit (tables for stage-aware entities can be narrowed at the view layer; the hook does not pre-filter `tableFields` by `showInStages`). |
| 3 | Removed direct `<AssigneeCell>`, `<CompanyCell>`, `<TagsCell>`, `<PersonCodeBadge>`, `<DataTableRowActions>`, `<Checkbox>` imports from ContactsView and CompaniesView (and the AssigneeCell/Badge imports from the deleted dealsListColumns). The components stay — they're rendered by the cell-dispatcher. | Eliminates the contacts table's per-row `getByPersonCode` storm (every row had its own subscription, and any mutation invalidated the lot — the "company keeps refetching for every operation" symptom). Eliminates the companies table's missing tags column (no `tags` case existed in the hand-rolled switch). Cards and tables now read tags from the same `useEntityTagsMap` batch — no more "out of sync with cards". |


## 2026-05-21 — Companies form joins the dynamic-fields family + FormDrawer mobile fix

| # | Decision | Outcome |
|---|---|---|
| 1 | `CompanyDrawer` (add + edit) now renders `<EntityFieldForm slot="company" />` for the body, exactly like `AddDealDrawer`. The hardcoded `<Input>`s for Name/Industry/Website and the `<MultiSelect>` for assignees are gone. The custom `personCodes[]` "people who work here" join is preserved as its own section because it's a company-only n:m relationship that doesn't fit the standard column/fieldValues/join field model. | Adding a custom company field in Settings → Modules → Company → Fields now actually shows up in the create + edit drawers. The form is consistent with deals/leads/contacts. Industry-overlay fields (e.g. `rera_orn`, `trade_license` for real-estate) flow through automatically. |
| 2 | Seed for the company `assignedTo` field had `columnKey: "assignees"` (the *array* column). EntityFieldForm reads `entity[columnKey]` to bootstrap the form — that returned an array and the assignee picker (single user-id) broke silently. Fixed seed → `columnKey: "assignedTo"`. Migration `_migrations/fixCompanyAssignedToColumnKey.ts` patches existing org rows in place (idempotent, ran on dev — 2 orgs updated). On submit we still write `{ assignedTo, assignees: [assignedTo] }` so the multi-assignee badge code paths keep working. | Company assignee picker now shows the current owner correctly in edit mode and persists on save. The migration ran the same message as the seed change, per the AGENTS.md "migrate IN THE SAME MESSAGE" rule. |
| 3 | Marked the company `name` seed as `required: true`. New orgs get the asterisk + post-submit validation styling automatically. Existing orgs are unaffected (the form still validates `name` in the submit handler regardless of the flag). | Asterisk now appears next to "Name" in fresh dev orgs. Existing orgs get the same toast-on-empty validation they had before. |

## 2026-05-21 — FormDrawer is mobile-safe by default

| # | Decision | Outcome |
|---|---|---|
| 1 | `FormDrawer` width is now `min(SIZE_MAP[size], 100vw)` with `maxWidth: 100vw` and `w-full sm:max-w-none` on the SheetContent. Padding shrinks from `px-6` to `px-4` below the `sm` breakpoint. | Every entity form (Add/Edit Lead, Contact, Deal, Company + Reminder + Follow-up) now caps at the viewport width on phones instead of overflowing horizontally. Desktop is unchanged because the configured size always wins when the viewport is wider. |
