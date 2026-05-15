# Calendar Module

> Calendar is a **client-derived view** — no `events` table. The Convex query `calendar.getEvents` merges three sources into a unified `CalendarEvent[]`:
>   1. `reminders` (every reminder is a calendar event)
>   2. `activityLogs` filtered to `meeting_*`/`call_*`/`demo_*` actions
>   3. `deals.expectedCloseDate` for open deals (one marker per deal)

## Owned tables / data sources

No owned tables. Read-merges reminders + activityLogs + deals.

## Owned routes

| Route | View |
|---|---|
| `/{orgSlug}/calendar` | `views/CalendarView.tsx` (org-wide month/week/day/list, UI pending) |

## Layers

| Layer | Component | Status |
|---|---|---|
| `views/` | `CalendarView` | placeholder — UI pending |
| `panels/` | `PersonCalendarPanel`, `EntityCalendarPanel` | UI pending |
| `widgets/` | `WeekAheadWidget`, `MiniCalendarWidget` | UI pending |
| `components/` | `CalendarSidebar`, `CalendarMain`, `EventForm`, `EventChip`, `CalendarToolbar`, `CalendarFilters` | UI pending |
| `hooks/` | `useCalendarEvents`, `useCreateEventFromCalendar` (re-export of `useCreateReminder`) | ✅ wired |

## Decisions

| # | Decision | Outcome |
|---|---|---|
| 1 | NO `events` table. Calendar is a read-merge view. | Single source of truth — deal close dates always current; reminders never duplicated. |
| 2 | Sidebar (mini-cal + filters + quick add) and Main (grid) are INDEPENDENT components. | Org-wide view composes both. Profile / entity panels embed only the Main grid. |
| 3 | "Create event" calls `useCreateEventFromCalendar` → `reminders.create`. | Form even shows "Save as Reminder" so users understand. |
| 4 | Donor template: shadcnstore `(dashboard)/calendar/components/*`. | Drop the JSON mock; replace `use-calendar.ts` event handlers with Convex mutations. Keep only `viewMode`+`selectedDate` UI state. |

## Avoids

- ❌ Don't add an `events` table.
- ❌ Don't render sidebar inside an embedded panel (no horizontal space).
- ❌ Don't subscribe to large date ranges from inside a panel — clamp `rangeEnd - rangeStart` to ≤ 90 days.
