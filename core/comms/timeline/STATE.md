# Timeline — State

> Updated: 2026-05-16
> Status: 50% Complete — backend merge + hooks + route wired; custom UI pending.

## ✅ Completed

| Component | File | Notes |
|---|---|---|
| Folder regroup | `core/timelines/` → `core/comms/timeline/` | Renamed plural→singular as part of the 8-group regroup. |
| Convex query | `convex/crm/shared/timeline/queries.ts::getForPerson` | Merges activityLogs + notes + reminders. RBAC-filters internal notes. Tags `_entryType` + `_color`. **Updated 2026-05-16**: dropped `!r.isActivityChat` filter (field no longer exists). |
| Convex query | `convex/crm/shared/timeline/queries.ts::getForOrg` | Org-wide; gated by `activityLogs.viewOrg`. |
| React hooks | `core/comms/timeline/hooks/index.ts` | `usePersonTimeline`, `useOrgTimeline`, `useEntityTimeline`. |
| Org-wide route | `app/[locale]/(private)/[orgSlug]/timeline/page.tsx` | Thin wrapper → `OrgTimelineView`. |
| Placeholder view | `core/comms/timeline/views/OrgTimelineView.tsx` | Data-wired (uses `useOrgTimeline`). |
| Sidebar nav entry | `core/shell/shell/config/navigation.ts` | Workspace group → "Timeline" (`Activity` icon). |

## ⬜ Pending

| Task | Priority | Notes |
|---|---|---|
| `TimelineEntry.tsx` (custom design) | High | Single component (~80 LOC). Colored dot start side, vertical connector, content end side. RTL-safe via `start-*` / `end-*`. |
| `TimelineFilters.tsx` | High | Chip filter: All/Notes/Reminders/Activity/AI/System. |
| `PersonTimelinePanel.tsx` | High | Profile Timeline tab. Composes filters + scrollable feed. |
| `EntityTimelinePanel.tsx` | Medium | Deal/Company timeline tabs. |
| `OrgTimelineView.tsx` (full UI) | Medium | Replaces placeholder. Adds scope toggle (admin-only). |
| `TimelineActivityWidget.tsx` | Low | Dashboard "Latest activity" card. |
| Convex query: `getForEntity` | Low | Add when entity-scoped timeline panels need it (currently routes through `getForPerson`). |

## Architecture Notes

- **No template donor — custom UI.** Per user request 2026-05-16 ("don't copy shadboard timeline").
- Backend feeds the frontend neutral data: `{ icon, color, title, timestamp, body }`. Visual style is a frontend concern.
- Two scopes share the same components; admin sees a scope toggle.
- Notes appear as read-only timeline entries; editing happens in the Notes tab.
