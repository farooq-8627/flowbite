# PHASE-3-NEXT.md
> Updated: 2026-05-19 | Read after PHASE-2-PROGRESS.md before starting Phase 3.
> Contains: AI phase plan, remaining performance improvements, future phases.

---

## Phase 3 — AI Assistant + WhatsApp

**Gate: "Stop navigating your CRM. Just talk to it."**

The backend stub is already wired. Every mutation already calls `ctx.scheduler.runAfter(0, internal.ai.rebuildEntityContext, ...)` as a no-op. Phase 3 fills in the bodies.

### 3.1 AI Tool Registry

`convex/ai/internal.ts` is the current stub. Phase 3 expands it into a full tool dispatcher.

**Two tools already have backend mutations ready:**

| AI tool name | Backend mutation | Source literal stamped | Activity verb |
|---|---|---|---|
| `create_followup` | `convex/crm/shared/reminders/mutations.ts::createFollowup` | `"followup"` | `followup_created` |
| `create_reminder` | `convex/crm/shared/reminders/mutations.ts::create` | `"ai"` | `reminder_created` |

**`create_followup` arg contract** (ready to register):
```ts
{
  name: "create_followup",
  description: "Schedule a CRM follow-up with a person, optionally tied to a deal or company.",
  args: {
    personCode: string,
    title: string,
    note?: string,
    dueAt?: number,         // ms epoch; omit = org default offset (defaultDueOffsetDays)
    priority?: "low" | "normal" | "high" | "urgent",
    dealCode?: string,
    entityType?: "deal" | "company",
    entityId?: string,
  },
}
```

**11 core tools to build** (full list from AGENTS.md / original plan):
```
search_crm          → cross-entity semantic search
update_entity       → update any field on any entity
create_entity       → create lead, contact, deal
create_followup     → create follow-up (mutation ready ✅)
create_reminder     → create reminder (mutation ready ✅)
add_note            → note on any entity
get_entity_detail   → full timeline + fields for one entity
get_summary         → pipeline health, overdue count, forecast
draft_email         → from deal/contact history (draft only — no auto-send)
bulk_update         → with mandatory confirmation dialog
workspace_setup     → AI-assisted org setup from template
```

### 3.2 AI Context Rebuild (Step 7 of canonical pattern)

`convex/ai/internal.ts::rebuildEntityContext` — currently a no-op. Phase 3 fills it in:
- Scan `activityLogs`, `notes`, `reminders`, `messages` for this entity
- Summarize via LLM (Claude Haiku for cost)
- Write `aiContext` field on the entity doc (already in schema)

### 3.3 System Prompt Architecture

`convex/ai/systemPrompt.ts` — 3-layer builder:
1. **Platform context** — product rules, what AI can/cannot do, org context
2. **Org context** — entity labels, pipeline stages, custom fields, team members
3. **Route context** — current page's entity (personCode / dealCode / conversationId)

Route context is supplied by `useRouteContext()` hook in `core/ai/hooks/` (Phase 3 module).

### 3.4 Frontend AI Shell

```
core/ai/
├── components/
│   ├── ChatSheet.tsx         Right-side resizable panel
│   ├── ChatMessage.tsx       Message bubble
│   ├── ChatToolCall.tsx      Tool result cards
│   └── ChatConfirmation.tsx  Confirmation for destructive actions
├── stores/
│   └── chatStore.ts          Zustand: isOpen, pendingMessage
└── hooks/
    ├── useAIChat.ts          useChat() wrapper
    └── useRouteContext.ts    Supplies page context to system prompt
```

### 3.5 WhatsApp Integration

- `app/api/channels/whatsapp/route.ts` — 360dialog webhook
- `trigger/whatsapp/voiceProcessor.ts` — Whisper → Claude → fieldValues update

### 3.6 Phase 3 Checklist

```
[ ] convex/ai/systemPrompt.ts
[ ] convex/ai/toolRegistry.ts
[ ] convex/ai/tools/ (11 tools)
[ ] convex/ai/internal.ts::rebuildEntityContext (fill in body)
[ ] app/api/ai/chat/route.ts (streaming proxy)
[ ] core/ai/components/ (ChatSheet, ChatMessage, ChatToolCall, ChatConfirmation)
[ ] core/ai/hooks/useAIChat.ts
[ ] core/ai/hooks/useRouteContext.ts
[ ] app/api/channels/whatsapp/route.ts
[ ] pnpm typecheck → 0 | tests → 160+ passing
[ ] "Show me my top deals" → deal cards in AI panel
[ ] "Create a lead for Sarah at Acme" → lead with personCode created
[ ] Viewer: read-only tools only — no destructive actions
[ ] WhatsApp voice → CRM updates in real time
[ ] First token < 2 seconds streaming
```

---

## Remaining Performance Improvements

> Items not yet shipped. Priority order: ship when volume warrants or user reports slowness.

### P-NEXT-1: Batch `IdentityBadge` per-card resolution — **MEDIUM**

`IdentityBadge` (person chip) and `usePerson` are called once per card in some list contexts. Convex de-dupes identical personCodes, but N unique personCodes = N subscriptions.

**Fix**: Extend `useEntityDisplaysBatched` (already in `core/comms/messages/hooks/`) to accept `person` entity type. Add `prefetched` prop to `IdentityBadge`. Pass pre-resolved map from parent list.

**When to ship**: when the reminders/follow-ups list renders 50+ cards with different personCodes and feels slow.

### P-NEXT-2: `listFollowupsForEntity` compound index — **LOW**

Currently: reads all org follow-ups via `by_org_and_source_and_due` then filters `entityType + entityId` in JS.

**Fix**: add index `by_org_and_source_and_entity` on `["orgId", "source", "entityType", "entityId"]`. Drop the in-memory filter.

**When to ship**: when an org has >2k follow-ups. Currently memory-filter is fine.

### P-NEXT-3: `ConvertLeadDrawer` full-list read — **MEDIUM**

`ConvertLeadDrawer` line 75 reads `leads.list` (full org) for duplicate detection.

**Fix**: add a server-side `findDuplicates(orgId, email, phone, displayName)` query that returns matches directly. Client doesn't need the full list.

**When to ship**: when orgs have >500 leads and the drawer open feels slow.

### P-NEXT-4: Cursor pagination on large tables — **LOW**

`listAllForOrg` (reminders), `messages/queries.ts`, `notes/queries.ts`, `timeline/queries.ts` use `.take(N)` hard caps.

**Fix**: add `paginationOpts` cursor-based pagination with `paginate()`. Return `{ page, isDone, continueCursor }`.

**When to ship**: when an org hits 10k+ rows in any of these tables.

### P-NEXT-5: `activityLogs` archive cron — **MEDIUM (production hardening)**

`activityLogs` grows unboundedly. No retention policy.

**Fix**: add `archiveOldActivityLogs` internal mutation + register in `convex/crons.ts` to archive entries older than 90 days to `archivedActivityLogs` table (or just delete if GDPR isn't a concern). Add counter so the archive is paginated.

---

## Future Phases

| Phase | Name | Gate | Key work |
|---|---|---|---|
| 4 | Communications | 15 clients | WhatsApp inbox, email integration, conversation threading |
| 5 | External Channels | 25 clients | 360dialog, Twilio SMS, Resend email, channel accounts |
| 6 | Integration Bridges | 35 clients | Zapier-style webhook outbound, field mapper, staging review |
| 7 | AI Automation | 40 clients | Morning briefing, proactive suggestions, stale deal detection cron |
| 8 | Project Management | Enterprise | PM board on top of Won deals, tasks, milestones |
| 9 | Client Portal | Enterprise | External partner/client access with scoped permissions |

### Gulf / Arabic Track (parallel through phases)

- Phase 1: `dir="rtl"` on Arabic `<html>`, `messages/ar.json` bootstrapped ✅
- Phase 2: RTL-safe inputs + kanban, Gulf phone validation ✅ (all Tailwind classes use ms-/me-/ps-/pe-)
- Phase 3: AI responds in Arabic when `locale=ar`. 95-day UAE rent alert.
- Phase 5: PDPL compliance (Saudi data regulation)

### Production Hardening (before launch)

| Item | Effort | Priority |
|---|---|---|
| Email send (Resend helper + templates) | 1.5 days | P0 |
| Soft-delete recovery (`undelete` mutations) | 1 day | P0 |
| GDPR: user data export + delete cascade | 2 days | P0 |
| Billing (Stripe/LemonSqueezy webhook + checkout) | 3 days | P0 |
| Security headers in `next.config.ts` | 0.5 days | P0 |
| Rate-limit cleanup cron | 0.5 days | P1 |
| Sentry server-side error context (orgId/userId tags) | 1 day | P1 |
| Bulk operations (`leads.bulkUpdate`, etc.) | 3 days | P1 |
| Typeahead / Cmd+K search using schema `searchIndex` | 2 days | P1 |

---

## Auto-Close Follow-ups Cron (Phase B)

`org.settings.followupDefaults.autoCloseAfterDays` is in the schema and UI but not enforced.

```ts
// convex/crm/shared/reminders/mutations.ts
export const autoCloseStaleFollowups = internalMutation({
  handler: async (ctx) => {
    // 1. Paginate orgs
    // 2. For each org: read autoCloseAfterDays from settings
    // 3. Query by_org_and_source_and_due where dueAt < (now - days * 86_400_000)
    // 4. Patch status: "completed", log followup_auto_closed
  },
});

// convex/crons.ts
crons.interval("auto-close-stale-followups", { hours: 24 },
  internal.crm.shared.reminders.mutations.autoCloseStaleFollowups, {});
```

Ship when an org actually enables `autoCloseAfterDays` in their settings.
