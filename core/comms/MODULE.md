# comms/ Group

> Conversational + auditable feeds. Anything humans or AI **wrote** about an entity lives here.

## Features inside

| Feature | Folder | Backed by | Status |
|---|---|---|---|
| Messages | `comms/messages/` | `messages` table (NEW) | Backend + hooks ✅ — UI pending |
| Notes | `comms/notes/` | `notes` table | Backend + hooks ✅ — UI pending |
| Timeline | `comms/timeline/` | activityLogs + notes + reminders (read-merge) | Backend + hooks ✅ — custom UI pending |

## Naming rule

- **Messages** — append-mostly chat (status, replyTo, attachments, voice).
- **Notes** — agent annotations (edited, pinned).
- **Timeline** — read-only merged feed for audit/context.

## Group-level avoids

- ❌ Never co-mingle messages and notes in one table (the `isActivityChat` boolean is removed for good).
- ❌ Don't put email here — `inbox/` is the future home.
