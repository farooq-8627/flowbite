# Notes Module

> Agent-written annotations on entities. Each note belongs to a user-defined
> **category** (Urgent, Today, Demo Scheduled, …). Distinct from `messages`
> (chat) — see FRONTEND-DECISIONS Rule 11.

## Owned tables / data sources

| Source | Purpose |
|---|---|
| `notes` (Convex) | Indexes: `by_entity`, `by_entity_and_pinned`, `by_org_and_category`, `by_org_and_author`, `by_org_and_personCode`, `by_org_and_created`, vectorIndex `by_embedding`. |
| `noteCategories` (Convex, NEW 2026-05-17) | User-managed buckets. Indexes: `by_org`, `by_org_and_position`, `by_org_and_name`, `by_org_and_default`. Replaces the legacy `notes.color` enum. |

## Owned routes

| Route | View |
|---|---|
| `/{orgSlug}/notes` | `core/comms/notes/views/NotesView.tsx` (org-wide category Kanban) |

## Layers

| Layer | Component |
|---|---|
| `views/` | `NotesView` (org-wide page; uses shared `EntityPageLayout`). |
| `components/` | `NotesPanel` (entity-tab embed), `NotesCategoryKanban`, `NoteCard`, `InlineNoteCard`, `CategoryDotPicker`, `EntityPickerPopover`. |
| `components/` (utils) | `note-color-utils.ts` (luminance-based text-color helper). |
| `hooks/` | `useNotesForEntity`, `useNotesForPerson`, `useNotesForOrg`, `useNoteAuthors`, `useNoteCategories`, `useDefaultNoteCategory`, `useEntitySearch`, `useCreateNote`, `useUpdateNote`, `useToggleNotePin`, `useSetNoteCategory`, `useSetNoteEntity`, `useDeleteNote`, plus six category mutations. |

## Permissions

| Action | Permission key |
|---|---|
| View | `notes.view` |
| View internal | `notes.viewInternal` |
| Create | `notes.create` |
| Update own | `notes.updateOwn` |
| Delete own | `notes.deleteOwn` |
| Delete any | `notes.deleteAny` |
| Pin | `notes.pin` |
| **View categories** | `notes.categories.view` |
| **Manage categories** | `notes.categories.manage` |

## Decisions

| # | Decision | Outcome |
|---|---|---|
| 1 | Notes is its own tab on the profile page (not folded into Timeline). | Supersedes the previous Rule 14 in FRONTEND-DECISIONS. Notes still appear in the timeline as read-only entries. |
| 2 | Notes UI is a **sticky-note Kanban grouped by user-managed category** — not the legacy fixed-color board. (2026-05-17) | One column per category, plain headers (no fill colour), per-card colour driven by category. See CORE-FEATURES-ARCHITECTURE.md §6b.1. |
| 3 | **Category replaces both `color` and `type`.** (2026-05-17, supersedes #3) | Single-axis taxonomy. The legacy `color` + `type` enums were dropped from the public API; schema keeps them optional for legacy rows. Migration: `_migrations/seedNoteCategories.ts`. |
| 4 | No drag-to-reorder for v1. | `isPinned` is the only ordering signal inside a column. |
| 5 | `notes.isActivityChat` field removed (2026-05-16). | Was used to distinguish messages from notes; messages now have their own table. |
| 6 | **Boards (column headers) are NOT coloured.** (2026-05-17) | Only cards carry the category bg colour. Headers stay plain — clearer hierarchy. |
| 7 | **Inline create per column.** (2026-05-17) | Each column has a `+` button. Click → empty card with default category, body textarea autofocused. No modal. |
| 8 | **Per-card `+` button for entity attach.** (2026-05-17) | Top-right of every card. Opens a typeahead popover (`api.crm.shared.notes.queries.searchEntities`) that searches across leads, contacts, deals, companies. Picking sets the note's `entityType`/`entityId`/`personCode` atomically. |
| 9 | **Per-card colour-dot picker.** (2026-05-17) | Top-right circular swatch (next to the `+` button). Click → popover lists every non-archived category. Picking fires `setCategory`. |
| 10 | **Text colour is luminance-derived by default.** (2026-05-17) | `note-color-utils.ts::resolveTextColor` returns the explicit `textColor` if set, else `#000` / `#fff` based on bg luminance. Override per category in Settings. |

## Avoids

- ❌ Don't read `notes.color` or `notes.type` — both are deprecated. Use `notes.categoryId` and resolve via `useNoteCategories(...)`.
- ❌ Don't store messages here — `messages` table is dedicated for that.
- ❌ Don't fill column headers with the category colour. Cards only.
- ❌ Don't open a modal for note creation. Inline-only.

## Migration history

| Date | Migration | Effect |
|---|---|---|
| 2026-05-17 | `_migrations/addNotesColorAndType.ts` | (Superseded) Added `color`/`type` defaults to legacy rows. Kept for back-compat reads. |
| 2026-05-17 | `_migrations/seedNoteCategories.ts` | Seeds 6 default categories per org (Yellow / Blue / Green / Pink / Purple / Gray, Yellow as default). Backfills `notes.categoryId` from the legacy `color`. Idempotent; safe to re-run. Optional `clearLegacyFields: true` arg also nukes the deprecated `color`/`type` columns once you're sure no consumer reads them. |


## 2026-05-17 — Toolbar quick-add + column drag-to-reorder

| # | Decision | Outcome |
|---|---|---|
| 1 | `NotesView` should expose a top-right `Add Note` action matching the entity boards. | Added `primaryAction: { label: "Add Note", icon: PlusIcon, permission: "notes.create", onClick: handleQuickAdd }` to `EntityPageLayout`. Quick-add creates a card in the org's default category at the top of its column — no modal, no drawer. |
| 2 | Drag-to-reorder columns for Owners + Admins. | `KanbanBoard` now accepts `onColumnReorder?: (newOrder: string[]) => void`. `NotesCategoryKanban` wires it to `useReorderNoteCategories` (gated on `notes.categories.manage`). The full id list passed to the mutation merges the new visible order with archived rows preserved at their existing positions. |
| 3 | Frontend permission reads were silently false even for Owners. | Root cause: `convex/orgs/queries.ts::getMyMembership` returned the raw `orgMembers` row, but `orgMembers.permissions` is an unset optional override. Fixed by resolving `role.permissions` from `roleId` before returning. All four consumers (`CRMGroup`, `NotesView`, `NotesPanel`, `MessagesThread`) now see the correct permission set without code changes on their side. |


## 2026-05-17 (later same day) — Refactor to reuse entity primitives

Inputs: user pushback that notes had parallel implementations. Action plan in this session was to remove every duplicate.

| # | Decision | Outcome |
|---|---|---|
| 1 | Card drag UX must match the entity boards exactly. No new sortable wrapper. | `NoteCard` now wraps its DOM in `KanbanItem asChild` + `KanbanItemHandle` — the same primitives `EntityCard` uses. Drop is smooth (no rotate-back), the same right-edge `GripVerticalIcon` grip, the same drag cursor states. |
| 2 | Card drop must NOT snap back while the server is still writing. | `useSetNoteCategory` is wrapped with `withOptimisticUpdate` that patches every cached `listForOrg` / `listForEntity` / `listForPerson` query that contains the moved note — same pattern Leads uses for `update`. The card stays in the new column the moment you release the mouse. |
| 3 | The category dropdown on the card duplicates drag → causes confusion. Drag is the canonical recategorize action. | Removed `CategoryDotPicker` from `NoteCard`. The card top-right now shows: code (when attached) + entity-attach `+` + menu — strictly per the user's spec. |
| 4 | The author name is redundant when the avatar is on the card. | Removed name text; only the avatar is rendered top-left. The card footer keeps only the `Internal` pill (no author name). |
| 5 | The view-options trigger had a `<button>` inside a `<button>` (PopoverTrigger had `asChild` over a `<button>` containing inner `<button>` rows). | Replaced with a button-styled identically to the entity `ViewOptionsMenu` trigger (Settings2 icon, outline variant, "View" label). Rows in the popover use `<label htmlFor>` + `<Checkbox>` so there's never a button inside a button. |
| 6 | Notes board needs same outer chrome / padding as the entity boards. | NotesView uses `EntityPageLayout` directly and wraps the kanban in the SAME padding wrapper EntityListPage's board branch uses (`py-3 xl:p-4`). No bespoke layout. |
| 7 | The `+` to create a card belongs at the top of the column, not the bottom. | Added `addCardSlot="header"` mode to `KanbanBoard` + a `+` icon in `KanbanColumnHeader` (opt-in). Notes uses it; entity boards leave it off so nothing changes for them. The inline composer renders via the new `renderColumnTop` slot — appears at the TOP of the column, above existing cards. |
| 8 | Card colour rules unchanged. | bgColor + textColor still resolved from `noteCategories` row (luminance-derived fallback). Settings Owner can override either. |


## 2026-05-17 — Card chrome + picker polish + flicker fix

| # | Decision | Outcome |
|---|---|---|
| 1 | Replace the `+` attach trigger with the attached entity's avatar when a note is attached. Tapping the avatar reopens the same picker. | `EntityPickerPopover` morphs its trigger based on `currentAttachment`. New `useAttachmentDisplay` hook + `getAttachmentDisplay` Convex query resolve display info (kind / code / displayName / secondary) for the avatar fallback initials. |
| 2 | Search popover rows now read [avatar][name+secondary][personCodeBadge]; the currently-attached row is highlighted with a primary tint + check icon. | Easier scan, no duplicated code text, and "what's selected" is unambiguous when the popover reopens. |
| 3 | Merge Leads + Contacts into a single **Profiles** group on the picker; converted leads filtered out at the query level. | Unified personCode means the user sees ONE row per person regardless of conversion state. `searchEntities` in `convex/crm/shared/notes/queries.ts` now drops `status === "converted"`, `convertedAt` set, or `deletedAt` rows. The merged group writes wire-format `entityType: "contact"` (matching `crm.people.getByPersonCode`'s contact-first resolution). |
| 4 | Remove the helper text under the search input ("Tip — search by name or by code…"). | The expanded placeholder ("Search by name, email or code (P-001, D-042, CO-001)…") covers the same ground without a second line. |
| 5 | Move the pin indicator from the top-end corner pip into the top-start avatar row, immediately after the creator avatar. | Less visual noise (the pip clipped under the kanban gap and competed with the action menu). The new chip is a 16px primary pill that sits inline with the avatar. |
| 6 | Narrow the kanban column drag-handle to ONLY cover the title region. Trailing actions (`+`, `⋮`) are siblings of `KanbanColumnHandle`, not descendants. | Fixes the dead `+` button on every kanban column. Previously dnd-kit listeners were attached to the whole header; even with `stopPropagation` on the actions wrapper, pointer-down races made the `+` button feel unresponsive. Same fix applies to entity boards (they use the same primitive). |
| 7 | Add `withOptimisticUpdate` to `useReorderNoteCategories`. | Fixes the column-drag flicker on the notes board. Entity boards persist column order to localStorage (synchronous), notes persist to the server — without an optimistic patch the board re-rendered with stale positions before the server response landed and the column snapped back. The patch updates every cached `noteCategories.listForOrg` query in place with the new positions, mirroring the leads-board card-drag pattern. |


## 2026-05-17 — Unified create + auto-focus

| # | Decision | Outcome |
|---|---|---|
| 1 | The column `+` button and the page-level `Add Note` button must produce identical behaviour: a real card is created in the right column and the user can immediately type into it. | Removed `InlineNoteCard` (the per-column composer). Both flows now call `createNote` directly with the sentinel content `"New note"`. |
| 2 | After creation, focus the textarea and select the placeholder so the first keystroke replaces it. | New `NoteCard.autoFocus` + `onAutoFocusConsumed` props. When `autoFocus=true`, the card mounts in edit mode, focuses the textarea, and `select()`s its content. A `consumedRef` guard keeps stale props from re-stealing focus. |
| 3 | The auto-focus claim has to survive the Convex round-trip and the subscription update that brings the new note into the cached list. | The claim lives on the page-level container (`NotesView` / `NotesPanel`) as `autoFocusNoteId: string \| null`. The kanban threads it down; the matching `NoteCard` consumes it once and signals back so the parent can clear it. |
| 4 | `InlineNoteCard.tsx` is deleted, not deprecated. | Single-source of card UX. Deleted file count: 514 → 513. |


## 2026-05-17 — Search highlight + drag smoothness parity

| # | Decision | Outcome |
|---|---|---|
| 1 | Notes board search now ranks matches to the top of every column instead of filtering, matching the entity-board UX exactly. | `NotesView` switched from a `notes.filter(...)` block to `rankBySearch` (the same helper Leads / Contacts / Deals / Companies use). Search fields are `["content", "title", "personCode", "entityId"]`. Non-matches stay visible below the matches in their original order. |
| 2 | Search-matched notes flash their **border color** to `currentColor` for 1.6s on every fresh query — no glow, no shadow, no outline. | `note-card-flash` keyframe in `globals.css` animates `border-color` (transparent → currentColor → transparent). NoteCard reserves the width via `border-2 border-transparent`, so the flash paints inside the card's footprint and never bleeds onto adjacent cards (notes sit edge-to-edge inside a column with no gap, so any outside-the-box highlight medium — outline, ring, box-shadow — would overlap neighbours). The colour is `currentColor` rather than `--primary` because note cards have a coloured background and `--primary` doesn't reliably contrast against every category palette in every theme; `currentColor` resolves to the card's already luminance-derived `textColor`, which is guaranteed to stand out against any category bg. The driver is the same `flashEpoch` counter pattern as the entity boards. |
| 3 | Column sort priority is now: search-match → pinned → newest. | Matches override pinned so the user's eye lands on hits first. With no active search, the original pinned-first / newest order is unchanged. |
| 4 | EntityCard drag now matches NoteCard: no opacity drop, no `transition-all`. | `EntityCard` switched `transition-all` → `transition-shadow` and removed `opacity-60` from the dragging classes. The dnd-kit drag overlay no longer animates transform changes via Tailwind, so the drag is visually crisp. The card-flash border animation is a `@keyframes`, not a CSS transition, so it still works without `transition-all`. |
