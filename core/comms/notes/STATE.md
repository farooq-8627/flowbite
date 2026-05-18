# Notes — State

> Updated: 2026-05-18 (afternoon — perf cleanup #3)
> Status: 100 % feature-complete. Two purpose-built boards:
>   • **`/notes` page** → multi-column **category kanban** (drag = recategorize).
>   • **Embeds** (profile/deal/company/project tabs) → **single sticky board**
>     (one canvas, free-position cards, both pickers visible).
>
> **2026-05-18 perf fix #3** (audit pass): the singular `useAttachmentDisplay`
> hook + matching backend `getAttachmentDisplay` query were dead code — the
> only caller (`EntityPickerPopover`) was always invoked through `NoteCard`
> which has always passed `resolvedDisplay` from the batched lookup. The
> singular path's "fallback" branch was unreachable. Removed:
>   - `useAttachmentDisplay` (frontend hook)
>   - `crm.shared.notes.queries.getAttachmentDisplay` (Convex query)
>   - The legacy `resolvedDisplay === undefined` branch in `EntityPickerPopover`
>   - `resolvedAttachmentDisplay?` is now a required `null | object` prop on `NoteCard`
> Net: -1 query identifier, -1 frontend hook, -60 lines, no functional change.
>
> Plus: free-position drag-drop with persisted `sortOrder` across notes +
> all 4 entity boards; column drag-to-reorder for note categories
> (Owner+Admin); per-card "Set reminder" wired to existing
> `useCreateReminder`; `notes.color` / `notes.type` deprecated fields
> dropped from schema; defensive sortOrder rebalance for the notes
> category column.
>
> **2026-05-18 perf fix #2** (driven by Convex insights showing 41 reorder
> mutations in 70 seconds for a single drag — "cards still reordering
> again"): the dnd-kit `Kanban` primitive's `onValueChange` fires on every
> drag-over event (every frame the dragged card crosses a sibling), which
> caused `NotesSingleBoard.handleValueChange` to fire `useReorderNote` per
> frame instead of per drop. Net effect: a drag across N cards emitted
> N+1 mutations, each with a different intermediate `sortOrder`, so the
> card visibly bounced through several positions before the final lay
> settled — matching the reported "reordering again" behaviour. Fix:
> added `onCommit` to the kanban primitive (fires EXACTLY once per drop
> in `onDragEnd`), migrated `NotesSingleBoard` and `KanbanBoard`
> (entity boards) to use it for all mutation calls. `onValueChange` is
> still emitted for visual reorder during drag, but consumers no longer
> persist from there.
>
> **2026-05-18 perf fixes** (driven by Convex insights showing 195 calls/min on
>   `listForOrg` and 90 calls/min on `reorder` for a single user):
>   1. `MIN_GAP` rebalance threshold raised from `1` to `2 ** -10` (≈ 0.001).
>      Previously rebalanced after ~10 midpoint inserts, patching every row
>      in the column → cascade of subscriptions firing. Now fires only when
>      float-precision is at risk (~20+ consecutive midpoints in the same gap).
>   2. Optimistic updates in `useReorderNote` + `useSetNoteCategory` no longer
>      bump `updatedAt: Date.now()` — that changed the row identity on every
>      render and cascaded list invalidations. Server stamp is authoritative
>      when the mutation lands.
>   3. New batched query `listAttachmentDisplaysForOrg` replaces 50+ per-card
>      `useAttachmentDisplay` subscriptions with a single round trip.
>      `NotesView` resolves all visible attachments once and threads them
>      through `NotesCategoryKanban` / `NotesSingleBoard` / `NoteCard` /
>      `EntityPickerPopover` via a new `resolvedDisplay` prop.

## ✅ Completed

### Schema + migration
| Component | File | Notes |
|---|---|---|
| `noteCategories` table | `convex/schema/crmShared.ts` | NEW. Indexed by `orgId`, `position`, `name`, `isDefault`. |
| `notes.categoryId` | `convex/schema/crmShared.ts` | NEW reference into `noteCategories`. Optional in schema (legacy rows pass), populated by migration. |
| Legacy `notes.color` + `notes.type` | `convex/schema/crmShared.ts` | DEPRECATED — flipped to optional. Schema retains them so existing rows validate; consumers must NOT read them. |
| Index swap | `convex/schema/crmShared.ts` | Removed `by_org_and_color` + `by_org_and_type`. Added `by_org_and_category`. |
| Migration | `convex/_migrations/seedNoteCategories.ts` | Idempotent + paginated. Seeds 6 defaults per org, backfills `categoryId` from legacy `color`, optional `clearLegacyFields` arg to nuke deprecated columns. |
| Org-creation seed | `convex/orgs/mutations.ts` | New orgs get the 6 defaults inserted via `seedNoteCategoriesForOrg` right after `seedSystemRoles`. |

### Backend (Convex)
| Module | File | Exports |
|---|---|---|
| Internal helpers | `convex/crm/shared/noteCategories/internal.ts` | `DEFAULT_NOTE_CATEGORIES`, `seedNoteCategoriesForOrg`, `lookupCategoryByLegacyColor`, `getDefaultCategoryForOrg`. |
| Public queries | `convex/crm/shared/noteCategories/queries.ts` | `listForOrg`, `getDefault`. |
| Public mutations | `convex/crm/shared/noteCategories/mutations.ts` | `ensureForOrg`, `create`, `update`, `setArchived`, `reorder`, `setDefault`, `remove`. |
| Notes mutations rewrite | `convex/crm/shared/notes/mutations.ts` | `create` accepts `categoryId` (optional → falls back to org default + lazy seed). New `setCategory` (replaces `setColor`). New `setEntity` (re-attach to a different entity from the per-card popover). `setType` removed. |
| Notes queries rewrite | `convex/crm/shared/notes/queries.ts` | `listForOrg` filters by `categoryId` instead of color/type. New `searchEntities` for the per-card +-button popover (typeahead across leads/contacts/deals/companies). |

### Permissions (catalog SSOT)
| Key | Default roles |
|---|---|
| `notes.categories.view` | Owner, Admin, Member, Viewer |
| `notes.categories.manage` | Owner, Admin |

### Hooks
| Hook | File |
|---|---|
| `useNotesForEntity / Person / Org`, `useNoteAuthors` | `core/comms/notes/hooks/index.ts` |
| `useNoteCategories`, `useDefaultNoteCategory`, `useEnsureNoteCategories` | same |
| `useEntitySearch` (typeahead) | same |
| `useCreateNote / Update / TogglePin / SetCategory / SetEntity / Delete` | same |
| `useCreateNoteCategory / Update / Archive / Reorder / SetDefault / Delete` | same |

### UI components
| Component | File | Role |
|---|---|---|
| `note-color-utils.ts` | `core/comms/notes/components/` | Luminance-based text-color picker, hex helpers. Pure functions. |
| `CategoryDotPicker` | same dir | Circular swatch + popover listing every category. Used in card corner. |
| `EntityPickerPopover` | same dir | `+` button popover. Live typeahead via `searchEntities`. Picks an entity + sets the note's attachment via `useSetNoteEntity`. Has "Detach (org-wide)" escape hatch. |
| `NoteCard` | same dir | Single sticky tile. Bg = category.bgColor; text = `resolveTextColor`. Top-right corner: dot picker + `+` button + ⋮ menu (pin / internal / delete). Body is click-to-edit textarea. |
| `InlineNoteCard` | same dir | Editable empty card spawned by per-column `+`. Auto-focused, save on blur or Cmd-Enter, discard on Esc/blank. |
| `NotesCategoryKanban` | same dir | Single Kanban grouped by category. Plain column headers (label + count + per-column `+`). Drag → `setCategory`. |
| `NotesPanel` | same dir | Entity-tab embed. Forwards entity attachment defaults so notes typed inside a profile/deal/company tab auto-attach. |
| `NotesView` | `core/comms/notes/views/` | Org-wide page. Uses shared `EntityPageLayout` — slim toolbar with search + view-options (hide/show category columns). |

### Settings UI
| Component | File |
|---|---|
| `NoteCategoriesSection` | `core/platform/settings/components/groups/crm/NoteCategoriesSection.tsx` |
| Mounted in `CRMGroup` | `core/platform/settings/components/groups/CRMGroup.tsx` |
| Sub-nav + search registry | `core/platform/settings/config/settings-sections.ts` (id `crm.noteCategories`) |

### Folder regroup (PR 1, included in this work)
| Move | From → To |
|---|---|
| `EntityPageLayout` | `core/entities/scaffolds/` → `core/shell/shared/entity-layout/` |
| `ViewToggleIcons` | `core/entities/shared/components/` → `core/shell/shared/entity-layout/` |
| `EmptyState` | `core/entities/shared/components/` → `core/shell/shared/entity-layout/` |
| `ViewKind` type | `core/entities/shared/types.ts` → `core/shell/shared/entity-layout/types.ts` (re-export back-compat in old location) |

### Verification
- `pnpm typecheck` → **0 errors**.
- `pnpm exec biome check core/comms/notes core/platform/settings convex` → **0 errors**.
- `pnpm exec convex dev --once` → schema accepted, migration + new modules deployed.
- `npx convex run _migrations/seedNoteCategories:run` → dev org seeded (6 categories, Yellow default), 0 legacy notes existed.

## Architecture Notes

### One source of truth — the Convex `notes` table
A note belongs to one (entityType, entityId) tuple plus an optional
`personCode`. The same row appears:
- on the entity's panel (queried via `listForEntity`),
- on the org-wide `/{orgSlug}/notes` page (queried via `listForOrg`),
- on the person's notes if `personCode` is set (queried via `listForPerson`).

There is no fan-out / no sync. Adding a note inside a Profile tab automatically appears on the master Notes page because both views read the same table.

### Visuals are driven by category, not Tailwind classes
`note-color-classes.ts` (the legacy file) is gone. Cards apply `style={{ backgroundColor }}` from the category row, and use `resolveTextColor(bgHex, override?)` to pick a readable foreground. This lets categories be ANY hex value the org defines — not just 6 fixed Tailwind shades.

### Per-card pickers (top-right corner)
Each card has TWO controls in the top-right:
1. **Colour dot** — `CategoryDotPicker`. Click → popover with all non-archived categories. Picking fires `useSetNoteCategory`. The card visually re-colours and (if the Kanban is grouped by category) moves to the matching column.
2. **`+` button** — `EntityPickerPopover`. Click → popover with a search input + grouped results (Leads / Contacts / Deals / Companies). Typing fires `searchEntities` server-side. Picking fires `useSetNoteEntity`. A "Detach (org-wide)" button at the bottom is shown when the note is currently attached.

### Inline create — no modals
Each column header has a `+` icon. Click → an `InlineNoteCard` mounts at the top of the column. The textarea is auto-focused; the user just starts typing. Cmd-Enter (or blur with content) saves; Esc (or blur with empty body) discards. The new note's `categoryId` is the column's category; default attachment comes from the parent (`org` / orgSlug for the org-wide view, the entity for a panel embed).

### Drag is the highlight
Dropping a card from one column to another fires `useSetNoteCategory`. The DnD primitive (`@dnd-kit` via `components/ui/kanban.tsx`) is shared with the Deals/Leads boards.

### RBAC
Every mutation gates on the canonical permission keys. UI mirrors them for affordance; server is the source of truth.

## ⬜ Future enhancements (low priority)

| Task | Notes |
|---|---|
| `RecentNotesWidget.tsx` | Dashboard card. Reuses `useNotesForOrg({ limit: 5 })`. |
| `AIBriefingCard` | Sticky top of `NotesPanel` for persons. Phase 3 fills it via AI summary. |
| Drag-to-reorder categories in Settings | Currently chevron buttons; `@dnd-kit` Sortable would be nicer. |
| Entity-board sortOrder rebalance | Notes have one; entity boards (leads/deals/contacts/companies) skip it because the groupBy axis is dynamic. Add a per-axis rebalancer when precision issues actually surface. |

## 2026-05-17 — Sticky-board variant + cleanup

| Component | File | Notes |
|---|---|---|
| `NotesSingleBoard` | `core/comms/notes/components/NotesSingleBoard.tsx` | Single-canvas sticky board (one column, no header). Used by every embed: profile / deal / company / project tabs. Cards: `pickers="both"`. |
| `NotesPanel` rewritten | `core/comms/notes/components/NotesPanel.tsx` | Now mounts `NotesSingleBoard` instead of the multi-column kanban. Same hooks; entity attachment forwarded as default for new cards. |
| `NotesView` simplification | `core/comms/notes/views/NotesView.tsx` | Single-view (board only). Passes `pickers="entity"` to `NotesCategoryKanban` so the category dot is hidden — drag is the canonical recategorize action there. |
| `NotesList` deletion | (removed) | The list view never matched the user's intent ("single board" was the sticky-board UX, not a tabular list). |
| `rebalanceCategoryIfTight` | `convex/crm/shared/notes/mutations.ts` | Defensive renumber when a drop creates a gap < 1. Wired into `setCategory` and `reorder`. Idempotent. |
| Schema: dropped `notes.color` / `notes.type` | `convex/schema/crmShared.ts` | Deprecated since the categories migration. Cleanup migration confirmed no row carried legacy data. Schema push validated cleanly. |
| Contacts + Companies drag-persist | `core/entities/_entities/{contacts,companies}/views/*.tsx` | `handleCardMove` no longer no-ops; computes midpoint via `computeSortOrderForDrop` + writes `sortOrder` (and the column-field for assignedTo / industry / size cross-column moves). |

## 2026-05-17 (later) — Notes view: icon-toggle for Category vs Board

| Component | File | Notes |
|---|---|---|
| `NotesViewToggle` (replaces `NotesViewTabs`) | `core/comms/notes/views/NotesView.tsx` | Two-icon pill (`Columns3Icon` for Category, `LayoutGridIcon` for Board) that mirrors the visual language of `core/shell/shared/entity-layout/ViewToggleIcons` — same height / radius / `aria-pressed` semantics. Replaces the previous text "Category | Board" pill. Why icons-only: the screenshot UI was carrying both a text pill AND a redundant grid-icon pill (the entity-layout view-toggle); collapsing them into one icon-pair pill matches the rest of the app's view-switcher language and stops the duplicated control. |
| `EntityPageLayout` view-toggle | `core/shell/shared/entity-layout/EntityPageLayout.tsx` | Now skips rendering `<ViewToggleIcons>` when `views.length === 0`. This lets NotesView own its own toggle without producing a stray empty pill. All other consumers default to `["list", "board"]` so behaviour is unchanged for them. |

## 2026-05-17 (later, take 2) — Inclusive filter + pinned-only

| Component | File | Notes |
|---|---|---|
| `NotesFilterPopover` (replaces `NotesCategoryViewOptions` + `NotesCategoryFilter`) | `core/comms/notes/views/NotesView.tsx` | One popover handles BOTH tabs (Category kanban and Sticky board). Model flipped from EXCLUSIVE-hidden ("uncheck to hide") to INCLUSIVE-selection ("check to show"). Empty selection = show all (default). Pick one or more to scope the view. URL params: `?cats=` (Category tab) and `?sticky-cats=` (Sticky tab) replace the legacy `?hide=` / `?sticky-hide=`. |
| `?pinned=1` filter | `core/comms/notes/views/NotesView.tsx` + both boards | New URL param. When true, only `note.isPinned === true` cards render. Lives at the top of the filter popover as a `<Switch>` (label "Show only pinned"). Filters compose AND: `?cats=A&pinned=1` → only pinned cards in category A. |
| `pinnedOnly` prop | `NotesCategoryKanban.tsx` + `NotesSingleBoard.tsx` | New optional boolean prop. Applied in the same useMemo that already filters hidden categories so there's only ONE filter pass per render. Default false. The boards keep their existing `hiddenCategoryIds` contract — the View translates inclusive selection → hidden set so the kanban primitive doesn't need to know about the new model. |
| Trigger pill UX | `NotesView.tsx::NotesFilterPopover` | Renders a numeric badge counting active filter dimensions: `1` for "categories selected", `1` for "pinned only", `2` for both. Single "Clear all filters" footer button when at least one is active. |
