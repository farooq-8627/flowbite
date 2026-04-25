# timelines Module (Core)

> Two timeline systems: Unified Timeline (everything, RBAC-scoped) + Activity Chat (people + AI on-behalf).

## Ownership
- **Location**: `core/timelines/`
- **Backend**: `convex/activityLogs/` (unified), `convex/activityChat/` (chat)
- **Phase**: 2 | **Status**: NOT_STARTED

## Rules
- [ ] R-TL-01: Unified Timeline ALWAYS filters by role — admin=all, member=assigned, client=own
- [ ] R-TL-02: Activity Chat stores ONLY human messages + AI on-behalf messages. No logs, reminders, notifications, or system events.
- [ ] R-TL-03: AI on-behalf messages use `senderType: "ai_on_behalf"` with `onBehalfOf: userId`
- [ ] R-TL-04: Activity Chat messages render as chat bubbles. Unified Timeline renders as timeline entries.
- [ ] R-TL-05: Both timelines are entity-scoped (entityType + entityId) OR project-scoped OR free-form

## Checklist
### Unified Timeline
- [ ] `unified-timeline/components/UnifiedTimeline.tsx` — chronological feed (logs + notes + reminders + AI + integrations)
- [ ] `unified-timeline/components/TimelineEntry.tsx` — single entry renderer (type-specific icons/badges)
- [ ] `unified-timeline/components/TimelineFilters.tsx` — filter by type
- [ ] `unified-timeline/hooks/useUnifiedTimeline.ts` — fetches from multiple tables, RBAC-filtered

### Activity Chat
- [ ] `activity-chat/components/ActivityChat.tsx` — chat-style thread
- [ ] `activity-chat/components/ChatMessage.tsx` — message bubble (with "Sent by AI on behalf of [Name]" badge)
- [ ] `activity-chat/components/ChatComposer.tsx` — message input
- [ ] `activity-chat/hooks/useActivityChat.ts` — real-time Convex subscription

### Backend
- [ ] `convex/activityChat/queries.ts` — listByEntity, listByProject, listDirect
- [ ] `convex/activityChat/mutations.ts` — send (senderType: "user" | "ai_on_behalf"), delete

## Avoids
- ❌ Never put reminders, notifications, or integration events in Activity Chat
- ❌ Never show unified timeline data unfiltered — always apply RBAC
- ❌ Never let AI send messages without `onBehalfOf` userId tracking

## Data Sources
### Unified Timeline reads from:
| Table | What It Shows |
|---|---|
| `activityLogs` | Status changes, field updates, stage moves, AI actions |
| `notes` | User notes + AI notes (authorType: "user" \| "ai") |
| `reminders` | Due/overdue follow-ups |
| Integration events | HubSpot syncs, CSV imports (Phase 5+) |

### Activity Chat reads from:
| Table | What It Shows |
|---|---|
| `activityChat` | Human messages + AI on-behalf messages ONLY |

## Message Types (Activity Chat)
```
senderType: "user"          → typed by human directly
senderType: "ai_on_behalf"  → AI sent on user's request
                              Shows badge: "Sent by AI on behalf of [Name]"
                              onBehalfOf: userId (who requested it)
```

---

## Schema Tables (Full definitions in `schema.md`)

| Table | Purpose |
|---|---|
| `activityLogs` | Org-scoped audit trail — `actorType: "user"\|"ai"\|"integration"\|"system"`, `action`, `entityType`, `entityId`, `description`, `metadata` |

Key indexes: `by_orgId_and_createdAt`, `by_entityType_and_entityId`, `by_orgId_and_actorType_and_createdAt`
Note: Email content is NEVER stored here — `activityLogs` is an event log only. Email content lives in `messages` table (Phase 4).
