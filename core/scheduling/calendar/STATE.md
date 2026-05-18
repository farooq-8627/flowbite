# Calendar — State

> Updated: 2026-05-19
> Status: 100% Complete — drag-to-reschedule + in-place edit from popover done.
>
> **2026-05-19 — Single-click to create.** `CalendarMain` cells now open
> the EventForm on a single click (was double-click). Month/week cells
> additionally update `selectedDate` so the toolbar/sidebar stay in sync.
> Day-view hour cells single-click into a date+hour-prefilled form.
> `onDoubleClick` handlers were removed (browsers fire `click` first
> anyway and `setFormOpen(true)` is idempotent). Tooltip text and
> header JSDoc updated. Matches Google Calendar UX. The standalone
> `/{orgSlug}/calendar` route was deleted in the same pass — calendar
> is a view of `/reminders?view=calendar`.

## ✅ Completed

| Component | File | Notes |
|---|---|---|
| Convex query | `convex/crm/shared/calendar/queries.ts::getEvents` | 3-source merge (reminders + activityLogs + deals). |
| `CalendarMain` | `core/scheduling/calendar/components/CalendarMain.tsx` | Pure renderer. Cells are `<div role="gridcell">` (no nested buttons). Supports drag-to-reschedule. **Single-click to open form (2026-05-19).** |
| `EventChip` | `core/scheduling/calendar/components/EventChip.tsx` | Draggable for reminder source. Native HTML5 drag. |
| `CalendarView` | `core/scheduling/calendar/views/CalendarView.tsx` | In-place edit via `getById` fetch. Drag reschedule wired. |
| `EventDetailPopover` | `core/scheduling/calendar/components/EventDetailPopover.tsx` | Edit button now opens form directly (no toast redirect). |
| `WeekAheadWidget` | `core/scheduling/calendar/widgets/WeekAheadWidget.tsx` | No skeletons. Links to `/reminders?view=calendar&date=…`. |
| `MiniCalendarWidget` | `core/scheduling/calendar/widgets/MiniCalendarWidget.tsx` | Navigation-only, no subscription. Links to `/reminders?view=calendar&date=…`. |
| `PersonCalendarPanel` | `core/scheduling/calendar/panels/PersonCalendarPanel.tsx` | ±45 day scope. |
| `EntityCalendarPanel` | `core/scheduling/calendar/panels/EntityCalendarPanel.tsx` | For deal/company detail pages. |
| Tests | `core/scheduling/scheduling-helpers.test.ts` | calendar-grid (7), calendar-buckets (3), event-source-colors (3). |

## ⬜ Pending (post-launch follow-ups)

| Task | Priority | Notes |
|---|---|---|
| `?date=` URL param round-trip | Low | selectedDate is in-memory only. |
| Multi-day event rendering (span across cells) | Low | Not needed until we add multi-day reminders. |

## Architecture Decisions

| # | Decision | Outcome |
|---|---|---|
| 1 | Drag uses native HTML5 drag (not dnd-kit). | Simpler for cross-cell drops. One mutation per drop. |
| 2 | Edit from popover fetches full doc via `getById` on demand. | No extra subscription; one-shot query. |
| 3 | Cells are `<div role="gridcell">` not `<button>`. | Fixes hydration error (EventChip is a button inside). |
| 4 | Phase 3 AI tools documented in MODULE.md. | Clear scope for AI build phase. |
| 5 | **Single-click on a cell opens the create-form (2026-05-19).** | Matches Google Calendar muscle memory. Drilling into a day is now done via the toolbar view-mode toggle or the sidebar mini-cal — keeps single-click as the high-frequency action (creating an event). |
| 6 | **Standalone `/calendar` route deleted (2026-05-19).** | Calendar is `?view=calendar` on `/reminders`. One sidebar entry, one canonical URL, one set of subscriptions. Old bookmarks 404 — explicit user request. |
