# Notes Module

> Agent-written annotations on entities. Editable, pinnable, sometimes long-lived. Distinct from `messages` (chat) — see FRONTEND-DECISIONS Rule 2.

## Owned tables / data sources

| Source | Purpose |
|---|---|
| `notes` (existing Convex table) | Indexes: `by_entity`, `by_org_and_author`, `by_org_and_personCode`, `by_org_and_created`, vectorIndex `by_embedding`. |

## Owned routes

| Route | View |
|---|---|
| `/{orgSlug}/notes` | `views/NotesView.tsx` (org-wide notes browser, UI pending) |

## Layers

| Layer | Component | Status |
|---|---|---|
| `views/` | `NotesView` | placeholder — UI pending |
| `panels/` | `NotesPanel` (+ `AIBriefingCard` slot) | UI pending |
| `widgets/` | `RecentNotesWidget` | UI pending |
| `components/` | `NoteCard`, `NoteComposer`, `NoteAuthorBadge`, `NoteActions` | UI pending |
| `hooks/` | `useNotesForEntity`, `useNotesForPerson`, `useCreateNote`, `useUpdateNote`, `useToggleNotePin`, `useDeleteNote` | ✅ wired |

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

## Decisions

| # | Decision | Outcome |
|---|---|---|
| 1 | Notes is its own tab on the profile page (not folded into Timeline). | Supersedes the previous Rule 14 in FRONTEND-DECISIONS. Notes still appear in the timeline as read-only entries. |
| 2 | Notes UI is custom — no template donor. | Notes are simple cards; designing in-house is faster than adapting a template. |
| 3 | Editor primitive (TipTap from shadboard) is NOT pre-copied. | User will design own editor surface. Use plain textarea or inline-rich-text when UI lands. |
| 4 | `notes.isActivityChat` field removed (2026-05-16). | Was used to distinguish messages from notes; messages now have their own table. |

## Avoids

- ❌ Don't use the editor primitive from `shadboard/full-kit/src/components/ui/editor/` (user will design own).
- ❌ Don't store messages here — `messages` table is dedicated for that.
