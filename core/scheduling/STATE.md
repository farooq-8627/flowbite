# scheduling/ Group — State

> Updated: 2026-05-16
> Status: 50% Complete — backend + hooks + routes wired; UI pending in both features.

## ✅ Completed (group-level)

- New group folder: `core/scheduling/`.
- Two new feature folders: `core/scheduling/reminders/` and `core/scheduling/calendar/`.
- New Convex module: `convex/crm/shared/calendar/queries.ts::getEvents` (3-source merge).
- Group-level MODULE.md.

## ⬜ Pending (per feature)

| Feature | Status | See |
|---|---|---|
| Reminders | UI pending (donor: shadcnstore `tasks/page.tsx` for stats+DataTable) | `scheduling/reminders/STATE.md` |
| Calendar | UI pending (donor: shadcnstore `(dashboard)/calendar/*`) | `scheduling/calendar/STATE.md` |
