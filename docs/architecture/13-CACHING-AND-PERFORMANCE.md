# 13 — Caching & Performance

> Convex is reactive — subscriptions auto-update. But that doesn't mean we can ignore performance. This document covers indexing strategy, denormalization, subscription optimization, and how to avoid common pitfalls.

---

## Convex's Model: Reactive Queries as Cache

Unlike REST APIs where you need Redis/Memcached to avoid hammering the database, Convex queries are **subscriptions**. The client receives the initial result, then **only receives diffs when the data changes**. This is built-in "caching" — but it's even better because it's always fresh.

**What this means:**
- No stale cache to invalidate
- No TTL to tune
- No cache-busting bugs
- Real-time updates for free

**What we still need to optimize:**
- Query efficiency (indexes, bounded results)
- Write-side contention (OCC conflicts)
- Subscription cardinality (too many active subscriptions)
- Denormalized counters for aggregations

---

## Cache Busting: "Change It in One Place"

The user asked: "How does a change trigger everywhere without modifying every file?" Here's the answer:

### Pattern: Shared Validators as Single Source of Truth

```ts
// convex/_shared/validators.ts — define ONCE
export const connectionStatusValues = ["draft", "pending_partner", "active", "in_progress", "review", "completed", "cancelled"] as const;
export type ConnectionStatus = typeof connectionStatusValues[number];
export const connectionStatusValidator = v.union(...connectionStatusValues.map(s => v.literal(s)));
```

```ts
// convex/connections/tables.ts — uses the shared validator
import { connectionStatusValidator } from "../_shared/validators";

connections: defineTable({
  status: connectionStatusValidator,
  // ...
})
```

```ts
// features/connections/types.ts — uses the same source
import { connectionStatusValues, type ConnectionStatus } from "@/convex/_shared/validators";

// Zod schema for form validation
export const connectionFormSchema = z.object({
  status: z.enum(connectionStatusValues),
});
```

```tsx
// features/connections/components/StatusBadge.tsx — uses the same source
import { type ConnectionStatus } from "@/convex/_shared/validators";

const STATUS_COLORS: Record<ConnectionStatus, string> = {
  draft: "bg-gray-100",
  pending_partner: "bg-yellow-100",
  active: "bg-green-100",
  // ...
};
```

**Result**: Add a new status value → update ONE array in `validators.ts` → TypeScript catches every file that needs updating. Zero runtime bugs.

---

## Indexing Strategy

### Rule: Every `withIndex` call must target an existing index

```ts
// BAD — filter() scans every document
const connections = await ctx.db.query("connections").filter(q =>
  q.eq(q.field("orgId"), args.orgId)
).take(50);

// GOOD — uses an index, O(log n) lookup
const connections = await ctx.db
  .query("connections")
  .withIndex("by_orgId_and_status", q => q.eq("orgId", args.orgId))
  .take(50);
```

### Compound Index Design

```
Index:          by_orgId_and_status ["orgId", "status"]
Supports:       q.eq("orgId", "xxx")                       ← prefix match
                q.eq("orgId", "xxx").eq("status", "active") ← full match
Does NOT support: q.eq("status", "active") alone            ← wrong order
```

If you need to query by `status` alone, create a separate index.

---

## Denormalized Counters

Never do `.collect().length`. At scale, this reads every document in a table. Instead, maintain counters:

```ts
// convex/orgs/mutations.ts — increment counter when member joins
export const addMember = orgMutation({
  args: { ... },
  handler: async (ctx, args) => {
    await ctx.db.insert("orgMembers", { ... });

    // Update denormalized counter
    const org = await ctx.db.get(ctx.org._id);
    await ctx.db.patch(ctx.org._id, {
      memberCount: (org?.memberCount ?? 0) + 1,
    });
  },
});
```

For notification unread count, the query is bounded:

```ts
// This is fine because we cap at 100 and the index is efficient
const unread = await ctx.db
  .query("notifications")
  .withIndex("by_userId_and_read", q => q.eq("userId", userId).eq("read", false))
  .take(100);
return unread.length;
```

---

## Subscription Optimization

### Problem: Too many active subscriptions

Every `useQuery()` call is a subscription. If a page has 20 components each subscribing to different queries, that's 20 active subscriptions. This is fine for moderate use, but at scale:

### Solution: Batch related data into one query

```ts
// BAD: 3 separate subscriptions
const user = useQuery(api.users.queries.currentUser);
const org = useQuery(api.orgs.queries.get, { orgId });
const member = useQuery(api.members.queries.currentMember, { orgId });

// GOOD: 1 subscription returns all context
const context = useQuery(api.users.queries.currentContext, { orgId });
// Returns { user, org, member } in one query
```

However, don't over-aggregate. If `org` changes rarely but `member.lastActiveAt` changes often, combining them means the subscription re-fires on every heartbeat. **Separate high-churn data.**

### Solution: Skip subscriptions for off-screen data

```ts
// Only subscribe when visible
const connections = useQuery(
  api.connections.queries.list,
  isVisible ? { orgId } : "skip",  // "skip" pauses the subscription
);
```

---

## Avoiding Write Contention (OCC Conflicts)

Convex uses Optimistic Concurrency Control. If two mutations try to write the same document simultaneously, one retries. This is usually fine, but can cause issues with hot documents.

### Pattern: Separate high-churn data

```
// BAD: typing status on the user document
users: defineTable({
  name: v.string(),
  email: v.string(),
  isTyping: v.boolean(), // ← Updated every 500ms, causes OCC on user reads
})

// GOOD: Separate presence table
userPresence: defineTable({
  userId: v.id("users"),
  isTyping: v.boolean(),
  lastActiveAt: v.number(),
})
```

### Pattern: Batch counter updates

Instead of incrementing a counter on every action:

```ts
// Risky for hot documents:
await ctx.db.patch(orgId, { notificationCount: org.notificationCount + 1 });

// Safer: Use scheduler to batch updates
// Or use a counter document per org that's separate from the org doc
```

---

## Query Function Size Limits

- **Reads**: Max 16MB data read per transaction
- **Writes**: Max 8MB data written per transaction
- **Documents per query**: Use `.take(n)` to bound
- **Execution time**: ~30 seconds for queries/mutations

For large operations, use the **self-scheduling pattern**:

```ts
export const processLargeBatch = internalMutation({
  args: { cursor: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const results = await ctx.db
      .query("notifications")
      .withIndex("by_userId_and_read")
      .paginate({ numItems: 100, cursor: args.cursor ?? null });

    for (const notification of results.page) {
      await ctx.db.patch(notification._id, { archivedAt: Date.now() });
    }

    if (!results.isDone) {
      // Schedule next batch
      await ctx.scheduler.runAfter(0, internal.notifications.mutations.processLargeBatch, {
        cursor: results.continueCursor,
      });
    }
  },
});
```

---

## Performance Checklist

| Check | How |
|---|---|
| Every `withIndex` matches a schema index | Search for `withIndex` — each must reference a defined index |
| No `.collect()` on unbounded tables | Search for `.collect()` — each must have a bounded context |
| No `.filter()` in queries | Search for `.filter(` — replace with `withIndex` |
| Counters are denormalized | Check aggregate queries — each should read a counter field |
| High-churn data is separated | Check for frequently-updating fields on widely-read documents |
| Subscriptions skip when off-screen | Check `useQuery` calls have "skip" conditions where appropriate |
