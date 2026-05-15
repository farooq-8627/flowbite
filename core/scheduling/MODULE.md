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
