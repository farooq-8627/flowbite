# Reminders Module

> Date-driven follow-ups. `followUpCode` (FU-001) auto-generated. Every reminder ties to a `personCode` and optionally a `dealCode`.

## Owned tables / data sources

| Source | Purpose |
|---|---|
| `reminders` (existing Convex table) | Indexes: `by_org_and_person`, `by_org_and_due`, `by_org_and_status`, `by_org_and_status_and_due`, `by_user_and_due`. |

## Owned routes

| Route | View |
|---|---|
| `/{orgSlug}/reminders` | `views/RemindersView.tsx` (org-wide stats + DataTable, UI pending) |

## Layers

| Layer | Component | Status |
|---|---|---|
| `views/` | `RemindersView` | placeholder — UI pending |
| `panels/` | `RemindersPanel` | UI pending |
| `widgets/` | `DueTodayWidget`, `MyOverdueWidget` | UI pending |
| `components/` | `ReminderCard`, `ReminderRow`, `ReminderForm`, `ReminderStatusBadge`, `ReminderQuickComplete` | UI pending |
| `hooks/` | `useRemindersForPerson`, `useRemindersDueToday`, `useRemindersOpen`, `useCreateReminder`, `useCompleteReminder`, `useUpdateReminder`, `useDeleteReminder` | ✅ wired |

## Permissions

| Action | Permission key |
|---|---|
| View | `reminders.view` (org-wide convention also accepts `notes.view`) |
| Create | `reminders.create` |
| Manage (update/complete/delete) | `reminders.manage` |

## Decisions

| # | Decision | Outcome |
|---|---|---|
| 1 | Reuses `core/data-display/datatable` for the org-wide table. | No bespoke list component; column defs come from `useReminderColumns` (pending). |
| 2 | "Create event" from Calendar = create a reminder. | Single source of truth — calendar is a derived view. See FRONTEND-DECISIONS Rule 16. |
| 3 | Donor template: shadcnstore `(dashboard)/tasks/page.tsx` for the stats-row + table layout. | Don't copy the JSON mock data. Replace state hooks with our `use*` hooks. |
