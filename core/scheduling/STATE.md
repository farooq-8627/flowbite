# scheduling/ Group — State

> Updated: 2026-05-19
> Status: 100% Complete — all features shipped, tested, documented.

## 2026-05-19 — Single-click create + `/calendar` route deleted

- **Single-click on a cell creates an event.** `CalendarMain` no longer
  uses `onDoubleClick` — month/week cells call `onSelectDate` AND
  `onCreateAtDate` on a single click; day-view hour cells call
  `onCreateAtDateTime`. Tooltip text updated ("Click to add" instead
  of "Double-click to add"). Matches Google Calendar UX. Drilling-into-
  a-day is now done via the toolbar view toggle or the sidebar
  mini-cal — keeps single-click reserved for the high-frequency
  action (create). See `core/scheduling/calendar/STATE.md` for details.
- **Standalone `/calendar` route removed.** The `app/[locale]/(private)/[orgSlug]/calendar/`
  directory (a redirect-only page) was deleted in this pass. Calendar
  is `/reminders?view=calendar` — one sidebar entry, one URL, one set
  of subscriptions. Stale doc-comments in `WeekAheadWidget`,
  `MiniCalendarWidget`, `navigation.ts`, and the reminders page JSDoc
  were cleaned up. Old `/calendar` bookmarks 404 (explicit user request).

## 2026-05-18 (Task 5) — Dashboard, Reminders/Calendar consolidation, EntityCodeSelector

- **Sidebar collapsed**: standalone Calendar entry removed. `/calendar` redirects to
  `/reminders?view=calendar`. Reminders is now a single sidebar item with three
  toolbar-toggle views: `today` (compact dashboard) / `list` (DataTable) / `calendar`
  (CalendarMain grid). URL-persisted via `?view=`.
- **Overdue bug fixed** (`convex/crm/shared/reminders/queries.ts`): the dashboard
  used `getDueToday` which only returned reminders with `dueAt` inside today's
  00:00–23:59 window — reminders dragged to yesterday silently disappeared.
  Added `getDueAndOverdue` (pending + `dueAt <= endOfDay(today)` with a 90-day
  lookback cap) and `getNextUpcoming` (next N pending reminders strictly after
  today, used by the "next reminder" fallback). The dashboard now uses
  `useRemindersDueAndOverdue` and `useRemindersNextUpcoming`.
- **Calendar double-click creates**: `CalendarMain` accepts `onCreateAtDate`
  (month + week cell double-click) and `onCreateAtDateTime` (day-view hour-row
  double-click) — wired to the EventForm in `CalendarView`,
  `PersonCalendarPanel`, and `EntityCalendarPanel`. The day grid now always
  renders the 24 hour-rows (was empty-state-only before) so the user can
  double-click any hour even on empty days.
- **EventForm now supports any entity**: a new shared
  `core/entities/shared/components/EntityCodeSelector.tsx` Combobox-style picker
  reuses notes' `useEntitySearch` and renders **avatar + name + code** on the
  selected chip (no `?` placeholders anywhere). It accepts a discriminated
  union `EntityCodeSelection` (`person | deal | company`) and merges
  leads/contacts on personCode just like the notes EntityPickerPopover.
  `ReminderForm` was rewritten to use it: lead/contact/deal/company can all
  attach a reminder, with smart locking when the parent pre-binds the entity.
- **Dashboard rewrite** (`core/shell/shell/views/DashboardHomeView.tsx`):
  - Removed "Welcome back, {name}" header + workspace subtitle (no decorative
    chrome).
  - 12-column dense grid: row 1 = Reminders (5 cols) + WeekAhead (4) + Recent
    activity (3); row 2 = Recent messages (7) + Mini calendar (5).
  - Every card is `flex flex-col h-full` so siblings line up — no empty
    bottom space.
  - Reminders card opens an inline `<ReminderForm>` dialog from the "+ New"
    button (no navigation).
  - Empty-today fallback shows the next upcoming reminder with `formatDistanceToNow`.
- **Week ahead** (`core/scheduling/calendar/widgets/WeekAheadWidget.tsx`):
  rewritten to show actual event titles via mini-chips (3 max + "+N more")
  instead of three coloured dots. Source colour is preserved on the chip
  background so the source identity stays visible.
- **Profile / deal / company wiring**: Profile already mounted
  `PersonCalendarPanel` + `RemindersPanel` (still does). `DealDetailView` now
  resolves via `getByDealCode` and renders Overview / Calendar / Reminders
  tabs that mount `EntityCalendarPanel` and `RemindersPanel`. `CompanyDetailView`
  now resolves via `getByCompanyCode` and renders Overview / Calendar tabs.
  (The dynamic `[entitySlug]/[id]` route is still a placeholder; once it
  mounts the views these tabs will be reachable from URLs like
  `/deals/D-001` and `/companies/CO-001`.)

## ✅ Completed (group-level)

- Reminders: listAllForOrg query, PersonSelect in form, no skeletons, 21 tests.
- Calendar: drag-to-reschedule, in-place edit from popover, no hydration errors, no skeletons.
- Dashboard: redesigned — combined cards, efficient layout, absolute times.
- Phase 3 AI tools documented in MODULE.md.

## Per-feature status

| Feature | Status | See |
|---|---|---|
| Reminders | 100% Complete | `scheduling/reminders/STATE.md` |
| Calendar | 100% Complete | `scheduling/calendar/STATE.md` |
