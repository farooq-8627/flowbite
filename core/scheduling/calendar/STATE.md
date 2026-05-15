# Calendar — State

> Updated: 2026-05-16
> Status: 50% Complete — backend merge query + hooks + route wired; UI pending.

## ✅ Completed

| Component | File | Notes |
|---|---|---|
| Convex query | `convex/crm/shared/calendar/queries.ts::getEvents` | Merges reminders + activityLogs (meeting/call/demo) + open-deal close dates. Three scopes: org / person / entity. |
| `CalendarEventDTO` type | (same file) | Tagged union with `source`, `color`, click-through fields. |
| React hooks | `core/scheduling/calendar/hooks/index.ts` | `useCalendarEvents`, `useCreateEventFromCalendar` (re-exports `useCreateReminder`). |
| Org-wide route | `app/[locale]/(private)/[orgSlug]/calendar/page.tsx` | Thin wrapper → `CalendarView`. |
| Placeholder view | `core/scheduling/calendar/views/CalendarView.tsx` | Data-wired with a ±31d window. |
| Sidebar nav entry | `core/shell/shell/config/navigation.ts` | Workspace group → "Calendar" (`CalendarDays` icon). |

## ⬜ Pending

| Task | Priority | Notes |
|---|---|---|
| `CalendarMain.tsx` (month/week/day/list grid) | High | Donor: shadcnstore `calendar-main.tsx`. Independent of the sidebar. Used by both view + entity panel. |
| `CalendarSidebar.tsx` | High | Donor: shadcnstore `calendar-sidebar.tsx`. Mini-cal + source filters + quick add. Used ONLY in org-wide view. |
| `EventForm.tsx` (drawer) | High | Calls `useCreateEventFromCalendar` (= `useCreateReminder`). Show "Save as Reminder" copy. |
| `EventChip.tsx`, `CalendarToolbar.tsx`, `CalendarFilters.tsx` | Medium | Leaf primitives. |
| `PersonCalendarPanel.tsx`, `EntityCalendarPanel.tsx` | Medium | Embed only `CalendarMain` (no sidebar). |
| `WeekAheadWidget.tsx`, `MiniCalendarWidget.tsx` | Low | Dashboard cards. |
| `useCalendarViewMode` (zustand for viewMode + selectedDate) | Low | Page-local UI state only — drop the rest of `use-calendar.ts` from the donor. |
| `event-source-colors.ts` config | Low | reminder=orange, deal-close=blue, activity=indigo (already inlined in the query but expose for the chip palette). |
