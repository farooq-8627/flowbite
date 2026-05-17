# comms/ Group — State

> Updated: 2026-05-17
> Status: 83% Complete — Messages + Notes shipped end-to-end. Timeline UI still pending.

## ✅ Completed (group-level)

- 8-group folder regroup: `core/timelines/` → `core/comms/timeline/` (renamed plural→singular).
- Two new feature folders: `core/comms/messages/` and `core/comms/notes/`.
- Group-level MODULE.md.
- **Messages feature shipped (2026-05-17)** — backend, UI, panel, widget, voice notes, lightbox, mobile sheet, consecutive grouping, exact times, forward, RTL Sheet, SWR conversation switch. See `comms/messages/STATE.md`.
- **Notes feature shipped (2026-05-17)** — sticky-board UI with color + type enums, drag-to-recategorize Kanban (color or type), URL-synced filter chips, embedded panel for entity tabs, org-wide page, profile-page wired. Schema delta + migration ready. See `comms/notes/STATE.md`.

## ⬜ Pending (per feature)

| Feature | Status | See |
|---|---|---|
| Messages | ✅ Shipped (Phase-2 complete; Phase-3 hooks documented) | `comms/messages/STATE.md` |
| Notes | ✅ Shipped (sticky-board + drag + filters + profile wiring) | `comms/notes/STATE.md` |
| Timeline | UI pending (custom design — no template) | `comms/timeline/STATE.md` |

## Migration to run

After deploying, run **once** on each environment to backfill legacy notes:
```
npx convex run _migrations/addNotesColorAndType:run
```
Idempotent — safe to re-run. Patches `color="yellow"` + `type="general"` on rows missing those fields.
