# 06 — Activity Logs

> An immutable audit trail of every meaningful action in the system. Features call one helper. The log is searchable, filterable, and never deleted.

---

## Purpose

Activity logs answer: **Who did what, to which entity, when, and what changed?**

They are distinct from notifications (which are user-facing, real-time) and application logs (infrastructure). Activity logs are the **business audit trail** — permanent, queryable, human-readable history.

---

## Functions in the Activity Log System — Where Each Is Used

| Function | File | Used When |
|---|---|---|
| `logActivity(ctx, params)` | `convex/activityLogs/helpers.ts` | **Inside any feature mutation** that changes data. Call this on every create, update, delete, assign, or status change. The primary entry point. |
| `computeChanges(oldDoc, updates)` | `convex/activityLogs/helpers.ts` | **Inside update mutations** to build a field-level diff before calling `logActivity`. Shows "status: draft → active" in the UI. |
| `listByEntity` query | `convex/activityLogs/queries.ts` | **Entity detail page** — the "Activity" tab showing all actions on a specific connection, invoice, etc. |
| `listByOrg` query | `convex/activityLogs/queries.ts` | **Admin panel** — the full org-wide audit log. Admin-only. |
| `listByUser` query | `convex/activityLogs/queries.ts` | **User profile page** — everything a specific user has done. |
| `ActivityTimeline` component | `components/shared/ActivityTimeline.tsx` | **Reusable UI** — drop this into any entity detail view to show the history tab. |

---

## Compact `logActivity` — Auto-Injected Context

`orgId` and `userId` (the actor — the logged-in user performing the action) are **automatically inferred from `ctx`**. You only pass what changes per call:

```ts
// convex/activityLogs/helpers.ts

/**
 * Records an immutable audit log entry for a user action.
 *
 * orgId  — automatically inferred from ctx.org._id (no need to pass)
 * userId — automatically inferred from ctx.user._id (the logged-in actor)
 *
 * Use for:
 *   - Every create, update, delete, assign, status change
 *   - System-triggered changes (use internalMutation with explicit userId for system user)
 *   - Any action an admin or compliance team would want to audit later
 *
 * Do NOT use for:
 *   - Read operations (queries)
 *   - Trivial UI state changes (opening a modal, filtering a list)
 *   - High-frequency automated events (heartbeats, analytics pings)
 */
export async function logActivity(
  ctx: MutationCtx,
  params: {
    action: string;                    // "created" | "updated" | "deleted" | "assigned" | any verb
    entityType: string;                // "connection" | "invoice" | "member" — what was affected?
    entityId: string;                  // The document ID of the affected entity
    description: string;               // Human-readable: "Assigned partner John to Project X"
    changes?: Record<string, { old: unknown; new: unknown }>;  // Field-level diff (optional)
    metadata?: Record<string, unknown>;   // Any extra structured context (optional)
  },
) {
  // orgId and userId (actor) are always available from the authenticated context
  const now = Date.now();
  await ctx.db.insert("activityLogs", {
    orgId: ctx.org._id,
    userId: ctx.user._id,
    action: params.action,
    entityType: params.entityType,
    entityId: params.entityId,
    description: params.description,
    changes: params.changes,
    metadata: params.metadata,
    createdAt: now,
    updatedAt: now,
  });
}
```

---

## How Features Call It

```ts
// Minimal — just the required fields
await logActivity(ctx, {
  action: "created",
  entityType: "connection",
  entityId: connectionId,
  description: `Created connection "${args.title}"`,
});

// With field-level diff (update mutations)
await logActivity(ctx, {
  action: "assigned",
  entityType: "connection",
  entityId: args.connectionId,
  description: `Assigned partner to "${connection.title}"`,
  changes: {
    partnerId: { old: null, new: args.partnerId },
    status: { old: connection.status, new: "active" },
  },
});
```

**One function call. No knowledge of how logs are stored or queried.**

---

## Change Tracking Pattern

For update mutations, compute the diff before patching:

```ts
/**
 * Computes a diff between the old document and the updates being applied.
 * Returns undefined if nothing changed.
 *
 * Use this before ctx.db.patch() to record what actually changed.
 */
export function computeChanges(
  oldDoc: Record<string, unknown>,
  updates: Record<string, unknown>,
): Record<string, { old: unknown; new: unknown }> | undefined {
  const changes: Record<string, { old: unknown; new: unknown }> = {};
  for (const [key, newValue] of Object.entries(updates)) {
    if (oldDoc[key] !== newValue) {
      changes[key] = { old: oldDoc[key], new: newValue };
    }
  }
  return Object.keys(changes).length > 0 ? changes : undefined;
}
```

Usage:

```ts
const updates = { status: "active", partnerId: args.partnerId };
const changes = computeChanges(connection, updates);
await ctx.db.patch(args.connectionId, { ...updates, updatedAt: Date.now() });
if (changes) {
  await logActivity(ctx, {
    action: "updated",
    entityType: "connection",
    entityId: args.connectionId,
    description: `Updated connection "${connection.title}"`,
    changes,
  });
}
```

---

## Querying Activity Logs

```ts
// convex/activityLogs/queries.ts

// Logs for a specific entity — used in entity detail pages (any member can see)
export const listByEntity = orgQuery({
  args: {
    entityType: v.string(),
    entityId: v.string(),
  },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("activityLogs")
      .withIndex("by_entityType_and_entityId", q =>
        q.eq("entityType", args.entityType).eq("entityId", args.entityId)
      )
      .order("desc")
      .take(50);
  },
});

// All logs for the org — used in admin audit panel (admin-only)
export const listByOrg = orgQuery({
  args: { paginationOpts: paginationOptsValidator },
  handler: async (ctx, args) => {
    ensurePermission(ctx.member, "admin.activityLogs");
    return await ctx.db
      .query("activityLogs")
      .withIndex("by_orgId_and_createdAt", q => q.eq("orgId", ctx.org._id))
      .order("desc")
      .paginate(args.paginationOpts);
  },
});
```

---

## Frontend Display

Activity logs appear in two places:
1. **Entity detail view** — "Activity" tab showing all actions on that entity.
2. **Admin panel** — Full searchable log for the entire org.

```tsx
// components/shared/ActivityTimeline.tsx
// Drop this into any entity detail page — it renders the activity history automatically
function ActivityTimeline({ entityType, entityId }: Props) {
  const { orgId } = useCurrentUser();
  const logs = useQuery(api.activityLogs.queries.listByEntity, {
    orgId, entityType, entityId,
  });

  return (
    <div className="space-y-4">
      {logs?.map(log => (
        <div key={log._id} className="flex gap-3">
          <UserAvatar userId={log.userId} size="sm" />
          <div>
            <p className="text-sm">{log.description}</p>
            {log.changes && <ChangesDiff changes={log.changes} />}
            <time className="text-xs text-muted-foreground">
              {formatRelative(log.createdAt)}
            </time>
          </div>
        </div>
      ))}
    </div>
  );
}
```

---

## Rules

1. Activity logs are **append-only**. Never update or delete them.
2. The `description` should be **human-readable without context**. Not "Updated record" but "Changed status from 'draft' to 'active' on Connection 'Website Redesign'."
3. Use the `changes` field for **field-level diffs** so the UI can show "Status: draft → active."
4. Use `internalMutation` with an explicit `userId` for **system-triggered actions** (cron cleanup, webhook events) since there's no authenticated user context.
5. **Log every mutation that modifies data.** The rule is: if you can do `ctx.db.insert`, `ctx.db.patch`, or `ctx.db.replace`, you should be calling `logActivity`.
