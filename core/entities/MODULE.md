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
