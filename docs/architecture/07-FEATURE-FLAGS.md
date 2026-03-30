# 07 — Feature Flags

> Two layers: internal flags (stored in Convex for precise control) and external flags (PostHog for gradual rollouts and experiments). Features check one hook and the system decides.

---

## Why Two Layers?

| Layer | Storage | Use Case | Speed |
|---|---|---|---|
| **Internal flags** | Convex `featureFlags` table | Kill switches, org-level enablement, instant toggling | Real-time (subscription) |
| **PostHog flags** | PostHog cloud | A/B tests, percentage rollouts, user targeting | Eventual (SDK cache) |

Most day-to-day feature gating uses internal flags. PostHog is for experiments and analytics-driven decisions.

---

## Internal Feature Flags (Convex)

### Schema (from 02-DATABASE-SCHEMA.md)

```ts
featureFlags: defineTable({
  key: v.string(),               // "connections.kanban_view"
  enabled: v.boolean(),
  scope: v.union(v.literal("global"), v.literal("org"), v.literal("user")),
  targetIds: v.optional(v.array(v.string())),
  rolloutPercentage: v.optional(v.number()),
  description: v.optional(v.string()),
  createdAt: v.number(),
  updatedAt: v.number(),
})
```

### Backend Helper

```ts
// convex/featureFlags/helpers.ts
import { QueryCtx } from "../_generated/server";

export async function isFeatureEnabled(
  ctx: QueryCtx,
  key: string,
  options?: { orgId?: string; userId?: string },
): Promise<boolean> {
  // 1. Check for global flag
  const globalFlag = await ctx.db
    .query("featureFlags")
    .withIndex("by_scope_and_key", q => q.eq("scope", "global").eq("key", key))
    .unique();

  if (globalFlag) return globalFlag.enabled;

  // 2. Check for org-level flag
  if (options?.orgId) {
    const orgFlag = await ctx.db
      .query("featureFlags")
      .withIndex("by_scope_and_key", q => q.eq("scope", "org").eq("key", key))
      .unique();

    if (orgFlag && orgFlag.targetIds?.includes(options.orgId)) {
      return orgFlag.enabled;
    }
  }

  // 3. Check for user-level flag
  if (options?.userId) {
    const userFlag = await ctx.db
      .query("featureFlags")
      .withIndex("by_scope_and_key", q => q.eq("scope", "user").eq("key", key))
      .unique();

    if (userFlag && userFlag.targetIds?.includes(options.userId)) {
      return userFlag.enabled;
    }
  }

  // 4. Default: feature disabled
  return false;
}
```

### Backend Usage

```ts
// In any Convex function:
const kanbanEnabled = await isFeatureEnabled(ctx, "connections.kanban_view", {
  orgId: ctx.org._id,
});

if (!kanbanEnabled) {
  throw new Error("Feature not available");
}
```

---

## Frontend Feature Flag Hook

Combines internal flags (real-time) with PostHog flags:

```ts
// lib/hooks/useFeatureFlag.ts
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { usePostHog } from "posthog-js/react";
import { useCurrentUser } from "./useCurrentUser";

export function useFeatureFlag(key: string): {
  enabled: boolean;
  isLoading: boolean;
} {
  const { orgId, user } = useCurrentUser();
  const posthog = usePostHog();

  // Internal flag (Convex — real-time)
  const internalFlag = useQuery(
    api.featureFlags.queries.isEnabled,
    orgId ? { key, orgId } : "skip",
  );

  // PostHog flag (cached, eventually consistent)
  const posthogFlag = posthog?.isFeatureEnabled(key);

  // Internal flag takes priority. If undefined (loading), check PostHog.
  const enabled = internalFlag !== undefined
    ? internalFlag
    : (posthogFlag ?? false);

  return {
    enabled,
    isLoading: internalFlag === undefined,
  };
}
```

### Component Usage

```tsx
function ConnectionsPage() {
  const { enabled: kanbanEnabled } = useFeatureFlag("connections.kanban_view");

  return (
    <div>
      <Tabs>
        <Tab value="list">List</Tab>
        {kanbanEnabled && <Tab value="kanban">Kanban</Tab>}
      </Tabs>
    </div>
  );
}
```

---

## Silent Feature Suppression

When a feature flag is disabled, the feature should disappear silently — no error, no empty state, no broken UI. This is "silent slice suppression."

### Pattern: Feature Guard Component

```tsx
// lib/components/FeatureGate.tsx
export function FeatureGate({
  flag,
  children,
  fallback = null,
}: {
  flag: string;
  children: React.ReactNode;
  fallback?: React.ReactNode;
}) {
  const { enabled, isLoading } = useFeatureFlag(flag);

  if (isLoading) return null;  // Silent: no skeleton, no flash
  if (!enabled) return <>{fallback}</>;
  return <>{children}</>;
}

// Usage:
<FeatureGate flag="connections.kanban_view">
  <KanbanBoard />
</FeatureGate>
```

### Sidebar Suppression

The feature registry checks flags before rendering sidebar items:

```ts
// features/_registry.ts
export type FeatureRegistration = {
  id: string;
  label: string;
  icon: LucideIcon;
  href: string;
  permissions?: string[];
  featureFlag?: string;      // ← If set, item hidden when flag is off
  order: number;
};
```

The sidebar component filters by flag:

```tsx
{getRegisteredFeatures()
  .filter(f => !f.featureFlag || isEnabled(f.featureFlag))
  .filter(f => !f.permissions || f.permissions.some(p => can(p)))
  .map(f => <NavItem key={f.id} {...f} />)}
```

---

## Admin Panel for Feature Flags

Located at `/dashboard/admin/feature-flags`. Only users with `admin.featureFlags` permission.

Features:
- Toggle flags on/off
- Set scope (global, org, user)
- Set target IDs
- View flag status across orgs

---

## Flag Naming Convention

```
[module].[feature_name]

Examples:
  connections.kanban_view
  connections.auto_assignment
  payments.v2_checkout
  dashboard.new_analytics
  messaging.enabled
```
