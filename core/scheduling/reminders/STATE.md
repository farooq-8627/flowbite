# Reminders — State

> Updated: 2026-05-18
> Status: 100% Complete — backend + hooks + org view + panel + widgets all live. Drag-to-reschedule + in-place edit from calendar done.

## ✅ Completed

| Component | File | Notes |
|---|---|---|
| `reminders` table | `convex/schema/crmShared.ts` | Existing — pre-Phase 2. |
| Convex queries | `convex/crm/shared/reminders/queries.ts` | `listForPerson`, `getDueToday`, `listAllForOrg`, `listOpen`, `getById`. |
| Convex mutations | `convex/crm/shared/reminders/mutations.ts` | `create`, `complete`, `update`, `remove` — all rate-limited. |
| React hooks | `core/scheduling/reminders/hooks/index.ts` | `useRemindersAllForOrg`, `useRemindersDueToday`, `useRemindersForPerson`, `useRemindersOpen`. |
| Optimistic mutations | `core/scheduling/reminders/hooks/useReminderMutations.ts` | Patches `getDueToday`, `listAllForOrg`, `listForPerson`, `listOpen`. |
| Status helpers | `core/scheduling/reminders/lib/reminder-status.ts` | `getReminderState`, labels, colors. |
| Bucket helpers | `core/scheduling/reminders/lib/reminder-buckets.ts` | `bucketByDue`, `openCount`, `totalCount`. |
| `ReminderForm` | `core/scheduling/reminders/components/ReminderForm.tsx` | Searchable PersonSelect (not raw text input). |
| `RemindersView` | `core/scheduling/reminders/views/RemindersView.tsx` | Uses `listAllForOrg` — all tabs work. No skeletons. |
| `RemindersPanel` | `core/scheduling/reminders/panels/RemindersPanel.tsx` | No skeletons. |
| `DueTodayWidget` | `core/scheduling/reminders/widgets/DueTodayWidget.tsx` | No skeletons. |
| `MyOverdueWidget` | `core/scheduling/reminders/widgets/MyOverdueWidget.tsx` | No skeletons. |
| Tests | `core/scheduling/scheduling-helpers.test.ts` | 21 tests covering all helpers. |

## ⬜ Pending (post-launch follow-ups)

| Task | Priority | Notes |
|---|---|---|
| Reopen completed reminders inline | Low | A `reopen` verb or status toggle. |
| Cursor-based pagination for very large orgs (>2000 reminders) | Low | `listAllForOrg` currently collects all. |

## Architecture Decisions

| # | Decision | Outcome |
|---|---|---|
| 1 | `listAllForOrg` returns ALL reminders (not just today's). | RemindersView tabs (Today/Open/Completed/All) all derive from one subscription. |
| 2 | PersonSelect replaces raw personCode input. | Users search by name/email/code — no memorization needed. |
| 3 | `getById` query added for calendar popover Edit. | One-shot fetch on demand, not a subscription. |
| 4 | Optimistic updates patch `listAllForOrg` + `getDueToday` + `listForPerson` + `listOpen`. | Instant UI feedback across all surfaces. |
