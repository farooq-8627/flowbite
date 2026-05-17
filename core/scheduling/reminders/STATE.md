# Reminders — State

> Updated: 2026-05-17
> Status: 50% Complete — backend (existing) + hooks + route wired; UI pending.
> **Note → reminder integration is live as of 2026-05-17**: every note card has a
> "Set reminder" action in its ⋮ menu (see `core/comms/notes/components/NoteReminderDialog.tsx`).
> Reminders created from a note are persisted to the same `reminders` table the
> upcoming UI will read, so no extra wiring is needed when the views ship.

## ✅ Completed

| Component | File | Notes |
|---|---|---|
| `reminders` table | `convex/schema/crmShared.ts` | Existing. |
| Convex queries | `convex/crm/shared/reminders/queries.ts` | `listForPerson`, `getDueToday`, `listOpen` (existing). |
| Convex mutations | `convex/crm/shared/reminders/mutations.ts` | `create`, `complete`, `update`, `remove` (existing). |
| React hooks | `core/scheduling/reminders/hooks/index.ts` | All read + write hooks wired. |
| Org-wide route | `app/[locale]/(private)/[orgSlug]/reminders/page.tsx` | Thin wrapper → `RemindersView`. |
| Placeholder view | `core/scheduling/reminders/views/RemindersView.tsx` | Data-wired (`useRemindersDueToday`). |
| Sidebar nav entry | `core/shell/shell/config/navigation.ts` | Workspace group → "Reminders" (`BellRing` icon). |

## ⬜ Pending

| Task | Priority | Notes |
|---|---|---|
| `ReminderForm.tsx` (drawer) | High | Reuses `<EntityFormDrawer>` patterns. Fields: title, note, dueAt, assignedTo, source. |
| `ReminderRow.tsx` / `ReminderCard.tsx` | High | Row for the DataTable; card for compact panel. |
| `ReminderStatusBadge.tsx` | High | pending / completed / overdue. |
| `useReminderColumns.ts` | High | Column defs for `core/data-display/datatable`. |
| `RemindersPanel.tsx` | High | Profile / Deal / Company embed. Compact list, no stats row. |
| `RemindersView.tsx` (full UI) | Medium | Replaces placeholder. Adds stats grid + DataTable. |
| `DueTodayWidget.tsx` / `MyOverdueWidget.tsx` | Low | Dashboard cards. |
