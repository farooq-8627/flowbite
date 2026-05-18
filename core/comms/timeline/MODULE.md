# Timeline Module

> A **read-only merged view** over `activityLogs + notes + reminders`. No table of its own. Surfaces: org-wide page, profile tab, deal/company tab, dashboard widget. UI is the saas-ui-style continuous-rail pattern (one line, two entry shapes — bare/card — plus tiny ring nodes for status changes).

## Owned tables / data sources

No owned tables. Read-merges:

| Source | Purpose |
|---|---|
| `activityLogs` | System audit trail. Bare-line on the timeline (small avatar + inline text) for created/updated/etc; ring node for status/stage/converted. |
| `notes` | Annotation entries. Card on the timeline. |
| `reminders` | Scheduled follow-ups. Card on the timeline. Follow-ups (`source === "followup"`) get an extra "Follow-up" badge. |

Backend tags every entry with `_entryType` ("activity" / "note" / "reminder") AND `_kind` ("bare" / "card" / "node") so the frontend renderer is a simple switch.

## Owned routes

| Route | View | Permission |
|---|---|---|
| `/{orgSlug}/timeline` | `views/OrgTimelineView.tsx` | `activityLogs.viewOrg` |
| Profile Timeline tab | `panels/PersonTimelinePanel.tsx` | `notes.view` (internal-note filter) |
| Deal/Company Timeline tab | `panels/EntityTimelinePanel.tsx` | `notes.view` |
| Dashboard widget | `widgets/TimelineActivityWidget.tsx` | (none — glance only) |

## Layers

| Layer | Component | Status |
|---|---|---|
| `views/` | `OrgTimelineView` | ✅ |
| `panels/` | `PersonTimelinePanel`, `EntityTimelinePanel` | ✅ |
| `widgets/` | `TimelineActivityWidget` | ✅ |
| `components/` | `TimelineFeed` (parent), `TimelineEntry` (switch), `TimelineBareEntry` (with `ActionNode` + `TrailingMeta` exports), `TimelineCardEntry`, `TimelineNodeEntry`, `TimelineRail`, `TimelineFilters`, `TimelineComposer`, `action-theme.ts`, `types.ts` | ✅ |
| `hooks/` | `usePaginatedTimeline`, `usePersonTimeline`, `useOrgTimeline`, `useEntityTimeline` | ✅ |

## Backend queries

| Function | Used by |
|---|---|
| `getForScope(orgId, scope, paginationOpts)` | The new `<TimelineFeed>` everywhere. Cursor-paginated. |
| `getForPerson(orgId, personCode, limit?)` | Legacy non-paginated callers (small embeds). |
| `getForOrg(orgId, limit?, actorType?)` | Legacy non-paginated callers (admin pages). |
| `getForEntity(orgId, entityType, entityId, limit?)` | Non-paginated entity-scoped read for simple consumers. |

## Decisions

| # | Decision | Outcome |
|---|---|---|
| 1 | **Action-first reading order.** | Title row leads with the action statement ("Lead created", "Reminder set"); time + actor pushed to the trailing meta on the inline-end with a tiny avatar. |
| 2 | **Three entry shapes:** `bare` (compact line, activity logs), `card` (notes + reminders with a framed body), `node` (state transitions like stage / status change). Backend tags every entry with `_kind`; frontend renderer is a simple switch. |
| 3 | **Per-action visual identity** via colored ring + icon on the start side. `core/comms/timeline/components/action-theme.ts` is the SSOT for ring color, icon, and headline verb. Palette: emerald (created), blue (updated), red (deleted), purple (converted), rose (lost), amber (reminder), yellow (note), sky (message), violet (AI), slate (system), fuchsia (stage / status). |
| 4 | **Subject row separate from title.** | Title says "Lead created"; the subject row underneath shows the affected entity ("Acme Corp · P-001"). Click the code to navigate. |
| 5 | **Newest at the bottom; first paint scrolls to bottom.** Matches saas-ui demo + the messages thread. |
| 6 | **Cursor pagination via `getForScope`.** Top-sentinel `IntersectionObserver` triggers `loadMore`. Visual position preserved across page-prepends via `scrollHeight` delta restoration. |
| 7 | **Filters are client-side.** Each loaded page is at most 50 entries; filtering one page is trivial and avoids six query branches. |
| 8 | **Composer is a thin wrapper over `useCreateNote`.** Comments-on-timeline ARE notes. No `comments` table. |
| 9 | **Avatar lookup uses `useOrgMemberMap()` from `<OrgProvider>`.** One subscription drives every entry's avatar — no per-entry `useQuery`. The map's `member.user.avatarUrl` is server-resolved (direct URL or storage URL). |
| 10 | **RBAC: per-scope.** `org` → `activityLogs.viewOrg`. `person` / `entity` → `notes.view` (with internal-note filter). Enforced server-side. |
| 11 | **Notes appear in timeline as read-only entries.** The Notes tab is the editable surface. |

## Avoids

- ❌ Don't add a `timelineEntries` table — read-merge is the source of truth.
- ❌ Don't render avatars from per-card `useQuery` calls. Use `useOrgMemberMap()`.
- ❌ Don't call `Element.scrollIntoView()` on the rail — use container `scrollTo`.
- ❌ Don't put the composer's submit button as a descendant of any other button.

## Reference

Visual inspiration: saas-ui demo (`demo.saas-ui.dev/activity`) — informs the **visual pattern only**. Implementation is in-house.
