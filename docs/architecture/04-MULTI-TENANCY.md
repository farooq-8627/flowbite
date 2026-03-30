# 04 — Multi-Tenancy

> How data is isolated between organizations. Every query, every mutation, every file — scoped to an org.

---

## Strategy: Shared Database, Row-Level Isolation

We use a **single Convex deployment** with `orgId` on every data row. This is the simplest approach that scales well for B2B SaaS.

**Why not separate databases per tenant?**
- Convex doesn't support multi-deployment routing.
- Shared deployment = shared real-time subscriptions, shared function cache, simpler ops.
- Row-level isolation with proper indexing is performant and sufficient for 99% of B2B apps.

---

## How It Works

### Every org-scoped table has `orgId`

```ts
connections: defineTable({
  orgId: v.id("orgs"),  // ← This field is on EVERY org-scoped table
  // ... rest of fields
})
  .index("by_orgId_and_status", ["orgId", "status"])
```

### Every query filters by `orgId`

Via `orgQuery`, the `orgId` is validated and removed from args before reaching the handler. The handler accesses `ctx.org._id`:

```ts
export const list = orgQuery({
  args: { status: v.optional(v.string()) },
  handler: async (ctx, args) => {
    // ctx.org._id is the verified org ID
    return await ctx.db
      .query("connections")
      .withIndex("by_orgId_and_status", q => q.eq("orgId", ctx.org._id))
      .take(50);
  },
});
```

**There is no way to accidentally query across orgs** because:
1. The `orgQuery` wrapper validates membership before the handler runs.
2. All indexes are prefixed with `orgId`.
3. No function uses a raw `ctx.db.query("table").collect()` without an org filter.

---

## Org Context on the Frontend

### How the current org is determined

```
User logs in → Look up user.defaultOrgId → Set in Zustand store
User switches org → Update defaultOrgId on user → Update Zustand store
```

```ts
// lib/hooks/useCurrentUser.ts
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";

export function useCurrentUser() {
  const user = useQuery(api.users.queries.currentUser);
  const org = useQuery(
    api.orgs.queries.get,
    user?.defaultOrgId ? { orgId: user.defaultOrgId } : "skip",
  );
  const member = useQuery(
    api.members.queries.currentMember,
    user?.defaultOrgId ? { orgId: user.defaultOrgId } : "skip",
  );

  return {
    user,
    org,
    member,
    orgId: user?.defaultOrgId ?? null,
    isLoading: user === undefined,
  };
}
```

Every feature hook passes `orgId` from this context:

```ts
// features/connections/hooks/useConnections.ts
import { useCurrentUser } from "@/lib/hooks/useCurrentUser";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";

export function useConnections(status?: string) {
  const { orgId } = useCurrentUser();
  return useQuery(
    api.connections.queries.list,
    orgId ? { orgId, status } : "skip",
  );
}
```

---

## Org Switching

```ts
// convex/users/mutations.ts
export const switchOrg = authenticatedMutation({
  args: { orgId: v.id("orgs") },
  handler: async (ctx, args) => {
    // Verify membership
    const member = await ctx.db
      .query("orgMembers")
      .withIndex("by_orgId_and_userId", q =>
        q.eq("orgId", args.orgId).eq("userId", ctx.user._id)
      )
      .unique();
    if (!member) throw new Error("Not a member of this organization");

    await ctx.db.patch(ctx.user._id, {
      defaultOrgId: args.orgId,
      updatedAt: Date.now(),
    });
  },
});
```

---

## Single-Org Mode (Selling Per-Client Deployments)

> **This is the recommended approach when deploying one app per client.** Instead of removing multi-tenancy code — which is a long, error-prone process — we keep the org model in place and simply auto-manage a single org. This means:
> - Zero code duplication (same codebase for single-org and multi-org deployments)
> - Multi-tenancy can be enabled later by flipping one constant
> - All existing `orgQuery`/`orgMutation` helpers work unchanged

### How It Works

Add a single constant to your config:

```ts
// lib/config.ts
export const APP_CONFIG = {
  /**
   * SINGLE_ORG_MODE: true  → One org per deployment (selling app to a client)
   * SINGLE_ORG_MODE: false → Full multi-tenancy (marketplace / SaaS)
   */
  SINGLE_ORG_MODE: true,

  /**
   * When SINGLE_ORG_MODE is true, this is the slug used for the auto-created org.
   * Set this to the client's company name slug.
   */
  DEFAULT_ORG_SLUG: process.env.NEXT_PUBLIC_DEFAULT_ORG_SLUG ?? "default",
};
```

### Auto-Org Creation on First User Registration

When a new user registers and `SINGLE_ORG_MODE` is true, they are automatically added to the single org instead of creating a new one:

```ts
// convex/users/mutations.ts (excerpt)
export const createOrJoin = internalMutation({
  args: { tokenIdentifier: v.string(), name: v.string(), email: v.string() },
  handler: async (ctx, args) => {
    // Check if single-org mode is enabled
    const config = await ctx.db.query("appConfig").unique();
    const singleOrgMode = config?.singleOrgMode ?? false;

    let orgId: Id<"orgs">;

    if (singleOrgMode) {
      // Always use the one existing org
      const org = await ctx.db.query("orgs").unique();
      if (!org) throw new Error("Default org not found. Run seed first.");
      orgId = org._id;
    } else {
      // Multi-tenancy: create a new org for this user
      orgId = await ctx.db.insert("orgs", { /* ... */ });
    }

    const userId = await ctx.db.insert("users", { /* ... */ });

    // Add to org
    await ctx.db.insert("orgMembers", {
      orgId,
      userId,
      role: singleOrgMode ? "member" : "owner",
      // ...
    });

    return userId;
  },
});
```

### Hide Org Switcher in Single-Org Mode

```tsx
// components/dashboard/OrgSwitcher.tsx
import { APP_CONFIG } from "@/lib/config";

export function OrgSwitcher() {
  // In single-org mode, there is nothing to switch
  if (APP_CONFIG.SINGLE_ORG_MODE) return null;

  return (
    // ... full org switcher UI
  );
}
```

### Route Simplification in Single-Org Mode

In multi-tenant apps, routes often include the org slug (e.g., `/[orgSlug]/dashboard`). In single-org mode, skip this:

```ts
// app/[locale]/dashboard/layout.tsx
// No org slug in URL — it's always the same org
// orgId is resolved server-side from session
```

### Enabling Multi-Tenancy Later

When the client wants to expand (or you want to offer the app as SaaS):

1. Set `SINGLE_ORG_MODE: false`
2. Add org switcher back (remove the `if` check)
3. Add org creation flow
4. Add org invitation flow

**Zero database migration required.** The org row already exists. You are just allowing more orgs to be created.

---

## What About Apps Without Multi-Tenancy? (The Hard Way)

> **Don't do this unless you are 100% certain you will never need multi-tenancy.**

If you truly want to strip out org-related code:
1. Remove `orgs` and `orgMembers` tables.
2. Replace `orgQuery`/`orgMutation` with `authenticatedQuery`/`authenticatedMutation`.
3. Remove `orgId` from all table definitions.
4. Remove the org switcher from the dashboard.

This is ~4 hours of work. Single-Org Mode above is ~10 minutes. **Use Single-Org Mode instead.**
