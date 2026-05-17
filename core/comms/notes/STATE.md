# Notes — State

> Updated: 2026-05-17
> Status: 100 % feature-complete. Sticky-note Kanban grouped by user-managed
> categories; per-column `+` button for inline create; org-toolbar `+ Add
> Note` quick-action; per-card colour dot + entity-attach `+` popover;
> Settings → CRM → Note Categories editor; column drag-to-reorder for
> Owners + Admins; full migration shipped.

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
| Note-to-reminder promotion | Checkbox on the inline card → `useCreateReminder`. |
| Drag-to-reorder categories in Settings | Currently chevron buttons; `@dnd-kit` Sortable would be nicer. |
| Free-position drag inside a column | Add `sortOrder: number` field + dnd-kit Sortable. |
| Final cleanup migration | Run `seedNoteCategories:run` with `clearLegacyFields=true` once we're confident no AI tool / external integration reads the deprecated `color`/`type` columns. |
