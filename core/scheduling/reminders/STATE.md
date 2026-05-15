# Reminders — State

> Updated: 2026-05-16
> Status: 50% Complete — backend (existing) + hooks + route wired; UI pending.

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
