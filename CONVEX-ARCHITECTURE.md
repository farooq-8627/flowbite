# CONVEX-ARCHITECTURE.md
# How Convex Works in Orbitly — Complete Clarity Guide

> Read this before asking "do we need to handle X?" about caching, websockets, realtime, or data loading.
> Last Updated: 2026-05-07

---

## 1. What Convex Replaces (The Big Picture)

In a traditional stack you manage:
- REST API server
- Database connection pool
- Cache layer (Redis)
- Cache invalidation logic
- WebSocket server for realtime
- Background job queue
- File storage
- Auth tokens

**Convex replaces ALL of that.** Here is the mapping:

| Traditional | Convex Equivalent | Do we write it? |
|---|---|---|
| REST API | Convex mutations + queries | ✅ Yes — just the function body |
| Database | Convex DB (built-in) | ✅ Schema only |
| Redis cache | Not needed — see below | ❌ Never |
| Cache invalidation | Not needed — see below | ❌ Never |
| WebSocket server | Built into Convex | ❌ Never |
| Background jobs | `ctx.scheduler.runAfter()` | ✅ Just the task function |
| File storage | `ctx.storage` | ✅ Just the upload call |
| Auth tokens | Convex Auth | ✅ Already done |

---

## 2. Caching — You Do Not Need to Think About It

### The short answer

**Convex has no cache layer. It doesn't need one. Here's why:**

Convex queries are **reactive subscriptions**, not request-response calls. When you call `useQuery(api.leads.list, { orgId })` in React:

1. Convex runs the query and sends the result to the client
2. Convex **keeps watching** the DB tables that query touched
3. When ANY of those tables change (from any mutation, anywhere), Convex automatically re-runs the query and pushes the new result to every subscribed client
4. React re-renders with the new data

This means:
- User A creates a lead → User B's leads list updates **instantly** with no polling, no cache bust, no manual refresh
- You never write `invalidateQuery()`, `refetchOnWindowFocus`, or `staleTime` for Convex queries
- There is no "stale data" problem — Convex data is always live

### What about performance?

Convex handles query result caching internally. If 100 users are subscribed to the same query with the same args, Convex runs it once and fans out the result. You don't configure this — it's automatic.

### The one exception: TanStack Query

If you use TanStack Query for non-Convex data (e.g., a third-party REST API call), then you manage that cache normally. But for all Convex data — never use TanStack Query. Use `useQuery` from `convex/react` directly.

### Summary

```
❌ Never write: queryClient.invalidateQueries()
❌ Never write: staleTime, cacheTime, refetchInterval
❌ Never write: "refresh after mutation" logic
✅ Just write: useQuery(api.leads.list, args) — it stays live forever
```

---

## 3. Realtime / WebSockets — Convex Handles It

### How it works

Convex uses a persistent WebSocket connection between the client and the Convex backend. This is established automatically when you wrap your app in `<ConvexProvider>`.

Every `useQuery()` call is a subscription over this WebSocket. You get:
- **Instant updates** when data changes (< 100ms typically)
- **Automatic reconnection** if the connection drops
- **Optimistic updates** via `useMutation` (optional, built-in)

### What this means for Orbitly

- Deals kanban: when a teammate moves a deal to a new stage, everyone's kanban updates instantly — no polling
- Notifications bell: when a new notification is created for a user, their bell count updates instantly
- Activity timeline: when a note is added to a lead, everyone viewing that lead sees it immediately
- Dashboard metrics: when a deal is won, the revenue counter on the dashboard updates live

### You never write WebSocket code

```
❌ Never write: new WebSocket(...)
❌ Never write: socket.on("message", ...)
❌ Never write: polling with setInterval
✅ Just write: useQuery(api.deals.listGroupedByStage, { orgId, pipelineId })
```

---

## 4. Data Loading — Loaders, Skeletons, Error States

### The Convex loading pattern

`useQuery` returns `undefined` while loading, then the data. Use this to show skeletons:

```tsx
const leads = useQuery(api.leads.list, { orgId });

if (leads === undefined) return <LeadsListSkeleton />;
if (leads.length === 0) return <EmptyState entity="leads" />;
return <LeadsList leads={leads} />;
```

### Error handling

Convex throws `ConvexError` from mutations. On the client, catch it from `useMutation`:

```tsx
const createLead = useMutation(api.leads.create);

try {
  await createLead({ orgId, displayName, source });
} catch (err) {
  if (err instanceof ConvexError) {
    const { code, message } = err.data;
    // code: "DUPLICATE" | "FORBIDDEN" | "NOT_FOUND" | "FEATURE_DISABLED"
    toast.error(message);
  }
}
```

### Error codes we use (from `convex/_shared/errors.ts`)

| Code | When |
|---|---|
| `FORBIDDEN` | RBAC check failed |
| `NOT_FOUND` | Record doesn't exist or wrong org |
| `DUPLICATE` | Email/code already exists |
| `ALREADY_CONVERTED` | Lead already converted |
| `INVALID_STAGE` | Stage not in pipeline |
| `INVALID_TRANSITION` | final→final stage move blocked |
| `FEATURE_DISABLED` | Plan doesn't include this feature |

### Suspense (optional)

Convex supports React Suspense. Wrap with `<Suspense fallback={<Skeleton />}>` and queries suspend automatically. We use the manual `undefined` check pattern for now — simpler and more explicit.

---

## 5. Notifications — How They Work End-to-End

### The full flow

```
1. Mutation runs (e.g., leads.create with assignedTo set)
2. Mutation calls sendNotification(ctx, { userId: assignedTo, type: "lead.assigned", ... })
3. sendNotification() inserts a row into the `notifications` table
4. The assignedTo user has useQuery(api.notifications.listUnread, { orgId }) running
5. Convex detects the notifications table changed → pushes update to that user's client
6. Bell icon count increments instantly — no polling, no push service needed
```

### `sendNotification()` signature (already built in `convex/notifications/helpers.ts`)

```typescript
await sendNotification(ctx, {
  orgId: args.orgId,
  userId: args.assignedTo,          // recipient
  type: "lead.assigned",            // notification type key
  title: `Lead assigned: ${name}`,  // shown in bell dropdown
  body: "You have a new lead to follow up on.",
  entityType: "lead",
  entityId: leadId,
  actionUrl: `/dashboard/${orgSlug}/leads/${leadId}`,
});
```

### Notification types we use

| Type | Trigger |
|---|---|
| `lead.assigned` | leads.create / leads.update when assignedTo changes |
| `contact.assigned` | contacts.create / contacts.update when assignedTo changes |
| `deal.assigned` | deals.create / deals.update when assignedTo changes |
| `deal.stage_changed` | deals.moveToStage |
| `reminder.created` | reminders.create |
| `reminder.due` | Cron job (Phase 3) |
| `note.mentioned` | notes.create when @mention detected (Phase 3) |
| `ai.task_completed` | AI internalAction completes (Phase 3) |

### Where notifications are displayed

- Bell icon in TopNav → dropdown (GitHub-style) — shows unread count + list
- Clicking a notification → marks read + navigates to `actionUrl`
- "Mark all as read" button
- Past notifications visible in `/settings/activity-log` (they're also activity log entries)

### No external push service needed

Because Convex is realtime, the bell updates instantly when a notification row is inserted. No Firebase FCM, no Pusher, no polling. For mobile push notifications (Phase 5+), we'd add Expo/FCM — but for web, Convex handles it.

---

## 6. logActivity() — How Activity Logging Works

### What it does

`logActivity()` inserts a row into the `activityLogs` table. Every mutation calls it after a successful write. This creates the unified timeline.

### Signature (already built in `convex/activityLogs/helpers.ts`)

```typescript
await logActivity(ctx, {
  orgId: args.orgId,
  userId,                    // who did it
  action: "created",         // verb
  entityType: "lead",        // what type
  entityId: leadId,          // which record
  description: `Lead created: ${args.displayName}`,
  metadata: { personCode },  // any extra data (JSON)
});
```

### Action verbs we use

| Action | Used in |
|---|---|
| `created` | All entity creates |
| `updated` | All entity updates |
| `deleted` | All soft deletes |
| `converted` | leads.convertToContact |
| `stage_changed` | deals.moveToStage |
| `won` | deals.closeAsDone (positive) |
| `lost` | deals.closeAsDone (negative) |
| `note_added` | notes.create |
| `reminder_created` | reminders.create |
| `pipeline_created` | pipelines.create |
| `stage_added` | pipelines.addStage |
| `assigned` | any entity when assignedTo changes |

### Who can see activity logs

- `activityLogs.viewOrg` permission → owner + admin → see ALL org activity
- `activityLogs.viewOwn` permission → all roles → see activity on records they have access to
- Per-entity timeline: filter `activityLogs` by `entityId` → shows that record's history
- Org-wide timeline: `/settings/activity-log` → shows everything (admin only)

### Retention (from deep-plan.md)

| Plan | Retention |
|---|---|
| Free | 7 days |
| Starter | 30 days |
| Pro | 90 days |
| Enterprise | 1 year |

All configurable from platform_owner dashboard — not hardcoded.

---

## 7. Unified Timeline — How It Works

### What the unified timeline IS

The unified timeline is NOT a separate table. It is a **query that merges multiple tables** and returns them sorted by time:

```typescript
// convex/crm/shared/timeline/queries.ts
export const getForEntity = orgQuery({
  args: { orgId, entityType, entityId, personCode? },
  handler: async (ctx, args) => {
    const [activityLogs, notes, reminders] = await Promise.all([
      ctx.db.query("activityLogs")
        .withIndex("by_entity", q => q.eq("entityId", args.entityId))
        .collect(),
      ctx.db.query("notes")
        .withIndex("by_entity", q => q.eq("entityId", args.entityId))
        .collect(),
      ctx.db.query("reminders")
        .withIndex("by_entity", q => q.eq("entityId", args.entityId))
        .collect(),
    ]);

    // Merge + tag each item with its type
    const items = [
      ...activityLogs.map(l => ({ ...l, _timelineType: "activity" })),
      ...notes.map(n => ({ ...n, _timelineType: "note" })),
      ...reminders.map(r => ({ ...r, _timelineType: "reminder" })),
    ];

    // Sort chronologically (newest first)
    return items.sort((a, b) => b.createdAt - a.createdAt);
  }
});
```

### What appears in the timeline (per deep-plan.md Module 21 + 28)

| Item Type | Source Table | When Added |
|---|---|---|
| Activity entries | `activityLogs` | Every mutation (created, updated, stage_changed, etc.) |
| Notes | `notes` | notes.create |
| Reminders | `reminders` | reminders.create, reminders.complete |
| AI actions | `activityLogs` (authorType: "ai") | Phase 3 — AI tool calls |
| Communications | `activityLogs` (Phase 4+) | WhatsApp/email events |
| Integration events | `activityLogs` (Phase 6+) | HubSpot sync, etc. |

### Two timeline views

1. **Per-entity timeline** — on the detail page of a lead/contact/deal. Shows everything for that one record. Filter by `entityId`.
2. **Org-wide timeline** — `/settings/activity-log`. Shows everything for the org. Filter by `orgId`. Admin only.

### Notes in the timeline

Notes are NOT a separate "Notes tab" — they appear inline in the activity timeline. The UI renders them differently (text bubble vs activity entry) but they come from the same merged query. This is the decision from deep-plan.md Module 21a.

---

## 8. AI Context — How It Works

### The two-layer model (from deep-plan.md Session 22)

```
Layer 1 — Global Platform Context
  Source: platformContext table (platform_owner manages)
  Content: What Orbitly is, what AI can/cannot do, platform rules
  Applied: Prepended to EVERY AI system prompt

Layer 2 — Per-User AI Context
  Source: aiConversations + aiMessages tables
  Content: This user's conversation history, tool calls, ongoing workflows
  Applied: Loaded when conversation resumes
```

### Per-entity aiContext (on leads/contacts/deals)

Each lead, contact, and deal has an `aiContext` field (JSON blob). This is the AI's "memory" about that specific person/deal — separate from conversation history.

```
aiContext = {
  summary: "Senior engineer at Acme Corp, interested in enterprise plan",
  lastInteraction: "2026-05-01",
  keyFacts: ["budget: $50k", "decision maker: yes", "timeline: Q3"],
  sentiment: "positive",
  nextBestAction: "Send proposal",
}
```

This is rebuilt by `internal.ai.rebuildEntityContext` (Phase 3 internalAction) after every significant change to the entity. The scheduler call in mutations (`ctx.scheduler.runAfter(0, internal.ai.rebuildEntityContext, ...)`) triggers this rebuild asynchronously — it doesn't block the mutation.

### personCode is the AI's person identifier

When AI talks about "John Smith", it uses `personCode` (e.g., `P-001`) as the stable identifier. This code travels from lead → contact on conversion. The AI can always find the person regardless of which table they're in.

### Convex as vector database (for AI)

Convex has built-in **vector search** (`vectorSearch` index type). We use this for:
- Semantic search across notes and activity logs
- "Find contacts similar to this one" (Phase 3)
- AI context retrieval (find relevant past interactions)

```typescript
// Schema: add vector index to notes
notes: defineTable({ ... })
  .vectorIndex("by_embedding", {
    vectorField: "embedding",
    dimensions: 1536,  // OpenAI text-embedding-3-small
    filterFields: ["orgId", "entityType"],
  })
```

When a note is created, an internalAction generates its embedding and stores it. AI can then do semantic search: "find all notes about pricing discussions" → vector search → relevant notes returned.

**You don't need Pinecone, Weaviate, or any external vector DB.** Convex handles it.

---

## 9. Background Jobs — ctx.scheduler

### How Convex scheduling works

`ctx.scheduler.runAfter(delayMs, internalFunctionRef, args)` schedules a Convex internalAction or internalMutation to run after a delay. This is how we do:

- AI context rebuild after entity changes (delay: 0ms — run immediately after mutation commits)
- Reminder due notifications (delay: calculated from dueAt - now)
- CSV import processing (delay: 0ms — start immediately)
- Weekly AI briefing generation (via cron)

```typescript
// In a mutation — fire and forget, doesn't block the mutation response
await ctx.scheduler.runAfter(0, internal.ai.rebuildEntityContext, {
  entityType: "lead",
  entityId: leadId,
  orgId: args.orgId,
});
```

### Cron jobs

```typescript
// convex/crons.ts
import { cronJobs } from "convex/server";
const crons = cronJobs();

// Check for due reminders every 15 minutes
crons.interval("check-due-reminders", { minutes: 15 }, internal.reminders.processDue);

// Generate AI morning briefing at 7am org timezone
crons.daily("morning-briefing", { hourUTC: 2 }, internal.ai.generateMorningBriefing);

export default crons;
```

No external cron service needed. Convex runs these reliably.

---

## 10. The Canonical Mutation Pattern — Why Each Step Exists

Every mutation in Orbitly follows this 7-step pattern. Here's WHY each step is there:

```typescript
export const create = orgMutation({
  handler: async (ctx, args) => {

    // STEP 1: RBAC
    // Who is calling this? Do they have permission?
    // requireOrgMember() verifies they're in the org.
    // requireRole() checks their role has the permission.
    // If either fails → throws FORBIDDEN → mutation stops.
    const { member, userId } = await requireOrgMember(ctx, args.orgId);
    requireRole(member.role, "leads.create");

    // STEP 2: Dedup (leads + contacts only)
    // Before creating, check if this person already exists.
    // Returns duplicates array. If non-empty → return early with duplicates.
    // UI shows "Possible duplicate" banner. User decides.
    const dupes = await runDedup(ctx, args.orgId, args.email, args.phone, args.displayName);
    if (dupes.length > 0) return { id: null, duplicates: dupes };

    // STEP 3: Record code
    // Generate the human-readable code (P-001, D-001, CO-001).
    // This is the stable identifier used by AI, WhatsApp, and humans.
    // Generated server-side — never client-supplied.
    const personCode = await generatePersonCode(ctx, args.orgId);

    // STEP 4: DB insert
    // The actual write. All fields set here.
    // updatedAt always set. createdAt always set.
    const id = await ctx.db.insert("leads", { ...args, personCode, createdAt: now, updatedAt: now });

    // STEP 5: logActivity()
    // ALWAYS called after every successful write.
    // Creates the audit trail + feeds the unified timeline.
    // Never skip this — it's how the timeline works.
    await logActivity(ctx, { orgId, userId, action: "created", entityType: "lead", entityId: id, ... });

    // STEP 6: sendNotification()
    // Only when someone is being notified of something.
    // Assignment: notify the assignee.
    // Stage change: notify deal owner.
    // Reminder: notify assignedTo.
    if (args.assignedTo && args.assignedTo !== userId) {
      await sendNotification(ctx, { userId: args.assignedTo, type: "lead.assigned", ... });
    }

    // STEP 7: AI context rebuild (Phase 3)
    // Schedule async rebuild of this entity's aiContext blob.
    // Runs AFTER the mutation commits — doesn't block the response.
    // Until Phase 3 is built, this is a TODO comment.
    // await ctx.scheduler.runAfter(0, internal.ai.rebuildEntityContext, { entityType: "lead", entityId: id });

    return { id, personCode, duplicates: [] };
  }
});
```

---

## 11. What Convex Does NOT Handle (Things We Still Build)

| Thing | How we handle it |
|---|---|
| Email sending | Resend (Phase 5) — called from Convex internalAction via HTTP |
| WhatsApp | Twilio/360dialog webhook → Convex HTTP action (Phase 4) |
| CSV import processing | Trigger.dev job → calls Convex mutations in batch |
| Web scraping | Trigger.dev + Firecrawl → results returned to AI (Phase 3) |
| PDF generation | Trigger.dev job (Phase 8) |
| File uploads | Convex Storage (`ctx.storage`) — built-in |
| Billing webhooks | LemonSqueezy/Razorpay → Convex HTTP action → update org tier |
| AI model calls | Vercel AI SDK in Convex internalAction (Phase 3) |

---

## 12. Data Fetching Patterns in the Frontend

### Pattern 1 — List page (most common)

```tsx
// core/entities/leads/views/LeadsView.tsx
"use client";
const leads = useQuery(api.leads.list, { orgId, status: filter });
// leads is undefined (loading) | Lead[] (data)
```

### Pattern 2 — Detail page

```tsx
// core/entities/leads/views/LeadDetailView.tsx
"use client";
const lead = useQuery(api.leads.getById, { orgId, leadId });
const timeline = useQuery(api.timeline.getForEntity, { orgId, entityType: "lead", entityId: leadId });
```

### Pattern 3 — Mutation with optimistic update

```tsx
const createLead = useMutation(api.leads.create).withOptimisticUpdate((localStore, args) => {
  // Immediately add to local store before server confirms
  // Convex rolls back automatically if mutation fails
});
```

### Pattern 4 — Paginated list

```tsx
const { results, status, loadMore } = usePaginatedQuery(
  api.leads.listPaginated,
  { orgId },
  { initialNumItems: 50 }
);
```

### What we NEVER do

```
❌ fetch() to Convex functions — use useQuery/useMutation
❌ useEffect + fetch for data loading
❌ Manual loading state management (useState(false) for isLoading)
❌ Cache invalidation after mutations
❌ Polling with setInterval
```

---

## 13. Route Structure — Current vs Planned

### Current (working today)

```
app/[locale]/[orgSlug]/dashboard/
  leads/          page.tsx + [id]/page.tsx
  contacts/       page.tsx + [id]/page.tsx
  companies/      page.tsx
  deals/          page.tsx + [id]/page.tsx
  settings/       general/ members/ roles/ billing/ pipelines/ appearance/
```

### Planned (deferred — needs landing page first)

```
app/[locale]/
  (public)/           ← landing page, pricing, waitlist
  (auth)/             ← signin, signup, forgot-password, etc.
  (private)/
    [orgSlug]/
      dashboard/      ← same structure as above
  platform/           ← platform_owner admin panel
```

The restructure is deferred until Phase 0.5 (landing page). Middleware handles auth guards correctly today. No urgency.

---

## 14. Summary — What You Never Need to Worry About

| Concern | Answer |
|---|---|
| Cache invalidation | Never. Convex queries are live subscriptions. |
| WebSocket setup | Never. Convex handles it. |
| Polling for updates | Never. Convex pushes updates. |
| "Refresh after mutation" | Never. Subscriptions update automatically. |
| Redis / Memcached | Never needed. |
| Vector database (Pinecone etc.) | Never. Convex has built-in vector search. |
| Background job queue (Bull, etc.) | Never. Use ctx.scheduler. |
| Cron service (Vercel Crons, etc.) | Never. Use Convex crons.ts. |
| Manual TypeScript interfaces for DB types | Never. Use Doc<"leads">, Id<"orgs">. |
| "Stale data" bugs | Never. Convex data is always current. |

**The only things you write:** schema, mutation/query function bodies, React components that call useQuery/useMutation. Everything else is handled.
