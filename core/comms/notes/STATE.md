# Notes — State

> Updated: 2026-05-16
> Status: 50% Complete — backend (existing) + hooks + route wired; UI pending.

## ✅ Completed

| Component | File | Notes |
|---|---|---|
| `notes` table | `convex/schema/crmShared.ts` | Existing; `isActivityChat` field removed in this revision. |
| Convex queries | `convex/crm/shared/notes/queries.ts` | `listForEntity`, `listForPerson` (existing). |
| Convex mutations | `convex/crm/shared/notes/mutations.ts` | `create`, `update`, `togglePin`, `remove` (existing). |
| React hooks | `core/comms/notes/hooks/index.ts` | `useNotesForEntity`, `useNotesForPerson`, `useCreateNote`, `useUpdateNote`, `useToggleNotePin`, `useDeleteNote`. |
| Org-wide route | `app/[locale]/(private)/[orgSlug]/notes/page.tsx` | Thin wrapper → `NotesView`. |
| Placeholder view | `core/comms/notes/views/NotesView.tsx` | Skeleton (no useQuery yet — depends on org-wide notes browser query). |
| Sidebar nav entry | `core/shell/shell/config/navigation.ts` | Workspace group → "Notes". |

## ⬜ Pending

| Task | Priority | Notes |
|---|---|---|
| `NoteCard.tsx` | High | Pinned-first ordering; author badge (user vs AI); pin/edit/delete actions. |
| `NoteComposer.tsx` | High | Rich text — design custom; do NOT copy shadboard editor primitive. |
| `NotesPanel.tsx` | High | Embedded in profile/deal/company tabs. Composes Composer + pinned + recent. |
| `AIBriefingCard.tsx` | Medium | Sticky top of `NotesPanel` when on a person. Phase 3 fills it; Phase 2 shows placeholder. |
| `NotesView.tsx` (full UI) | Medium | Org-wide browser with filters (author, entity, pinned). Needs new `notes.listForOrg` query. |
| `RecentNotesWidget.tsx` | Low | Dashboard "Latest notes" card. |
| Convex query: `notes.listForOrg` | Low | Add when the org-wide browser UI starts. |

## Architecture Notes

- Notes is a **separate tab** on profile (per Rule 13 + Rule 14 supersede). The same panel is also embedded in Deal, Company, Lead detail pages.
- Notes UI is custom — no template donor (user will design).
- `isActivityChat` field removed from the schema in this revision; chat-style messages now live in the dedicated `messages` table.
