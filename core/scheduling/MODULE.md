# scheduling/ Group

> Time-based feeds. Anything **tied to a date** lives here.

## Features inside

| Feature | Folder | Backed by | Status |
|---|---|---|---|
| Reminders | `scheduling/reminders/` | `reminders` table | Backend + hooks ✅ — UI pending |
| Calendar | `scheduling/calendar/` | reminders + activityLogs + deal close dates (read-merge, NEW query) | Backend + hooks ✅ — UI pending |

## Cross-feature rule

"Create event" from the Calendar = create a **reminder**. Reminders are the only writable scheduling primitive. The calendar is a multi-source read view.

## Group-level avoids

- ❌ Don't add a separate `events` table.
- ❌ Don't allow direct calendar mutations — every "Save event" goes through `reminders.create`.

## Phase 3 — AI Integration (planned)

> AI tools for scheduling. Each tool calls existing mutations/queries — no new tables.

| Tool | Action | Calls |
|---|---|---|
| `create_reminder` | AI creates a reminder from conversation context | `reminders.mutations.create` |
| `complete_reminder` | AI marks a reminder done | `reminders.mutations.complete` |
| `list_due_today` | AI reads today's reminders | `reminders.queries.getDueToday` |
| `schedule_event` | AI creates a calendar event (source="ai") | `reminders.mutations.create` |
| `reschedule_event` | AI moves a reminder to a new date | `reminders.mutations.update` |
| `list_upcoming_events` | AI reads next 7 days | `calendar.queries.getEvents` |

The AI system prompt will include scheduling context so it can proactively suggest follow-ups.


---

## Decisions Log

| # | Decision | Outcome |
|---|---|---|
| D1 | `useCalendarViewMode` URL key is `cal`, not `view` | `RemindersView` already uses `?view=` (today/list/calendar). When the calendar nested inside it ALSO wrote `?view=`, switching to "Week" inside the calendar set `view=week` — which `RemindersView` then read as an unknown value and fell back to its default mode, leaving the calendar grid blank. Renamed to `cal` so the two URL contracts never overlap. Default `cal=month` is cleared from URL via `clearOnDefault: true`. |
| D2 | `CalendarToolbar` no longer offers a "List" view-mode | The outer `RemindersViewToggle` (Today / List / Calendar) already has a "List" mode that surfaces the DataTable. A second "List" inside the calendar duplicated the affordance and made the page look like it had two competing view-pickers. The calendar now offers Month / Week / Day only. |
| D3 | Reminders Today mode: Today + Mine on a 2-col row, WeekAhead on its own full-width row | Old layout was `xl:grid-cols-[1fr_1fr_1.2fr]` — 7 day cells got squeezed into the 1.2fr column and text shrunk into nothing. WeekAhead now stretches across the full width so each day cell is comfortable. |
