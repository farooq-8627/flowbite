# Timeline Module

> A **read-only merged view** over `activityLogs + notes + reminders`. No table of its own. Two scopes: per-person (profile Timeline tab) and org-wide (`/{orgSlug}/timeline` and `/settings/activity-log`). UI is custom — designed in-house, not copied from a template.

## Owned tables / data sources

No owned tables. Read-merges these:

| Source | Purpose |
|---|---|
| `activityLogs` | System audit trail (created/updated/stage_change/ai_action/whatsapp/system). |
| `notes` | Annotation entries (with internal-note RBAC filter). |
| `reminders` | Date-driven follow-ups. |

Backend already merges + tags each entry with `_entryType` and `_color`.

## Owned routes

| Route | View | Permission |
|---|---|---|
| `/{orgSlug}/timeline` | `views/OrgTimelineView.tsx` | `activityLogs.viewOrg` |
| `/{orgSlug}/settings/activity-log` | same view (alias) | `activityLogs.viewOrg` |
| Profile Timeline tab | `panels/PersonTimelinePanel.tsx` *(pending UI)* | `notes.view` (with `notes.viewInternal` filter) |
| Deal/Company Timeline tab | `panels/EntityTimelinePanel.tsx` *(pending UI)* | `notes.view` |

## Layers

| Layer | Component | Status |
|---|---|---|
| `views/` | `OrgTimelineView` | placeholder — custom UI pending |
| `panels/` | `PersonTimelinePanel`, `EntityTimelinePanel` | UI pending |
| `widgets/` | `TimelineActivityWidget` | UI pending |
| `components/` | `TimelineEntry`, `TimelineFilters`, `TimelineScopeToggle` | UI pending |
| `hooks/` | `usePersonTimeline`, `useOrgTimeline`, `useEntityTimeline` | ✅ wired |

## Decisions

| # | Decision | Outcome |
|---|---|---|
| 1 | Timeline UI is custom — NO shadboard `ui/timeline.tsx` copy. | User will design own visual; backend feeds neutral `{icon, color, title, timestamp, body}`-shaped data. |
| 2 | Activity logs are paired with timeline conceptually but stored separately. | Backend `getForPerson` does the merge; frontend just renders. |
| 3 | RBAC: per-person timeline filters internal notes (`notes.viewInternal`); org-wide requires `activityLogs.viewOrg`. | Two scopes, two gates. |
| 4 | Notes appear in timeline AS read-only entries. The Notes tab is the editable surface. | Per FRONTEND-DECISIONS Rule 14 (superseded). |

## Avoids

- ❌ Do NOT copy `shadboard/full-kit/src/components/ui/timeline.tsx` (custom design).
- ❌ Don't add a `timelineEntries` table — read-merge is the source of truth.
