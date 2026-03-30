# 03 — Authentication & RBAC

> How users prove who they are, and how the system decides what they can do. Every protected function flows through this pipeline. No exceptions.

---

## Authentication Flow

```
Browser                 Convex Auth              Convex Backend
  │                         │                         │
  ├── signIn(provider) ────>│                         │
  │                         ├── validate credentials ─>│
  │                         │<── JWT token ───────────┤
  │<── session cookie ──────┤                         │
  │                         │                         │
  │── useQuery(api.x.y) ──>│── JWT in header ───────>│
  │                         │                         ├── ctx.auth.getUserIdentity()
  │                         │                         ├── lookup users table
  │                         │                         ├── lookup orgMembers
  │<── reactive result ─────┤<── result ──────────────┤
```

### Current Setup

We use `@convex-dev/auth` with `Password` provider (already configured):

```ts
// convex/auth.ts — already exists
import { Password } from "@convex-dev/auth/providers/Password";
import { convexAuth } from "@convex-dev/auth/server";

export const { auth, signIn, signOut, store, isAuthenticated } = convexAuth({
  providers: [Password],
});
```

Adding OAuth (Google, GitHub) later is one line per provider in this array.

---

## The Auth Pipeline: `tokenIdentifier → user → orgMember → role/permissions`

Every authenticated request follows this pipeline:

```ts
// Step 1: Get the Convex Auth identity
const identity = await ctx.auth.getUserIdentity();
if (!identity) throw new Error("Not authenticated");

// Step 2: Look up our app's user record
const user = await ctx.db
  .query("users")
  .withIndex("by_tokenIdentifier", q => q.eq("tokenIdentifier", identity.tokenIdentifier))
  .unique();

// Step 3: Look up their membership in the current org
const member = await ctx.db
  .query("orgMembers")
  .withIndex("by_orgId_and_userId", q =>
    q.eq("orgId", orgId).eq("userId", user._id)
  )
  .unique();

// Step 4: Check role/permission
if (member.role !== "admin" && member.role !== "owner") {
  throw new Error("Insufficient permissions");
}
```

**This is boilerplate** — and that's exactly why we never write it directly. We wrap it in custom function builders.

---

## Custom Function Builders

### `authenticatedQuery` / `authenticatedMutation`

Injects `ctx.user` (the full user document) into every handler. Throws if not authenticated.

```ts
// convex/_functions/authenticated.ts
import { customQuery, customMutation, customCtx } from "convex-helpers/server/customFunctions";
import { query, mutation } from "../_generated/server";
import { getCurrentUser } from "../users/helpers";

export const authenticatedQuery = customQuery(
  query,
  customCtx(async (ctx) => {
    const user = await getCurrentUser(ctx);
    if (!user) throw new Error("Not authenticated");
    return { user };
  }),
);

export const authenticatedMutation = customMutation(
  mutation,
  customCtx(async (ctx) => {
    const user = await getCurrentUser(ctx);
    if (!user) throw new Error("Not authenticated");
    return { user };
  }),
);
```

**Usage in any feature:**

```ts
// convex/connections/queries.ts
import { authenticatedQuery } from "../_functions/authenticated";
import { v } from "convex/values";

export const list = authenticatedQuery({
  args: { orgId: v.id("orgs") },
  handler: async (ctx, args) => {
    // ctx.user is guaranteed to exist here
    // No need to call getUserIdentity again
    return await ctx.db
      .query("connections")
      .withIndex("by_orgId_and_status", q => q.eq("orgId", args.orgId))
      .take(50);
  },
});
```

### `orgQuery` / `orgMutation`

Like authenticated, but also resolves the current org and member role. Injects `ctx.user`, `ctx.org`, `ctx.member`.

```ts
// convex/_functions/authenticated.ts (extended)
export const orgQuery = customQuery(
  query,
  {
    args: { orgId: v.id("orgs") },
    input: async (ctx, args) => {
      const user = await getCurrentUser(ctx);
      if (!user) throw new Error("Not authenticated");

      const member = await ctx.db
        .query("orgMembers")
        .withIndex("by_orgId_and_userId", q =>
          q.eq("orgId", args.orgId).eq("userId", user._id)
        )
        .unique();

      if (!member || member.deletedAt) throw new Error("Not a member of this organization");

      const org = await ctx.db.get(args.orgId);
      if (!org || org.deletedAt) throw new Error("Organization not found");

      return {
        ctx: { user, org, member },
        args: {},  // orgId consumed, not passed to handler
      };
    },
  },
);
```

**Usage:**

```ts
export const list = orgQuery({
  args: { status: v.optional(v.string()) },
  handler: async (ctx, args) => {
    // ctx.user, ctx.org, ctx.member all available
    // org access already verified
    return await ctx.db
      .query("connections")
      .withIndex("by_orgId_and_status", q => {
        let query = q.eq("orgId", ctx.org._id);
        if (args.status) query = query.eq("status", args.status);
        return query;
      })
      .take(50);
  },
});
```

### `adminMutation` — Role-gated functions

```ts
export const adminMutation = customMutation(
  mutation,
  {
    args: { orgId: v.id("orgs") },
    input: async (ctx, args) => {
      const user = await getCurrentUser(ctx);
      if (!user) throw new Error("Not authenticated");

      const member = await ctx.db
        .query("orgMembers")
        .withIndex("by_orgId_and_userId", q =>
          q.eq("orgId", args.orgId).eq("userId", user._id)
        )
        .unique();

      if (!member || !["owner", "admin"].includes(member.role)) {
        throw new Error("Admin access required");
      }

      const org = await ctx.db.get(args.orgId);
      return { ctx: { user, org, member }, args: {} };
    },
  },
);
```

---

## RBAC Model

### Role Hierarchy

```
owner
  └── admin
       └── member
            └── viewer
```

Each higher role inherits all permissions of lower roles.

### Role Definitions

| Role | Can Do | Example Actions |
|---|---|---|
| **owner** | Everything + delete org, transfer ownership, manage billing | Delete organization, change plan |
| **admin** | Manage members, manage all data, change settings | Invite members, assign partners, manage connections |
| **member** | Create and manage own data, collaborate | Create connections, upload files, comment |
| **viewer** | Read-only access | View connections, view reports |

### Permission System

Roles provide coarse-grained access. For fine-grained control, we use a permission system:

```ts
// convex/_shared/constants.ts
export const PERMISSIONS = {
  // Org management
  "org.manage": "Manage organization settings",
  "org.billing": "Manage billing and subscriptions",
  "members.invite": "Invite new members",
  "members.remove": "Remove members",
  "members.changeRole": "Change member roles",

  // Connections
  "connections.create": "Create new connections",
  "connections.assign": "Assign partners to connections",
  "connections.delete": "Delete connections",
  "connections.viewAll": "View all connections (not just own)",

  // Notifications
  "notifications.sendBulk": "Send bulk notifications",

  // Admin
  "admin.featureFlags": "Manage feature flags",
  "admin.activityLogs": "View all activity logs",
} as const;

export type Permission = keyof typeof PERMISSIONS;

// Default permissions per role
export const ROLE_PERMISSIONS: Record<string, Permission[]> = {
  owner: Object.keys(PERMISSIONS) as Permission[],
  admin: [
    "org.manage", "members.invite", "members.remove", "members.changeRole",
    "connections.create", "connections.assign", "connections.delete", "connections.viewAll",
    "notifications.sendBulk", "admin.activityLogs",
  ],
  member: [
    "connections.create", "connections.viewAll",
  ],
  viewer: [],
};
```

### Permission Check Helper

```ts
// convex/members/helpers.ts
export function hasPermission(
  member: Doc<"orgMembers">,
  permission: Permission,
): boolean {
  const rolePerms = ROLE_PERMISSIONS[member.role] ?? [];
  const customPerms = member.permissions ?? [];
  return rolePerms.includes(permission) || customPerms.includes(permission);
}

export function ensurePermission(
  member: Doc<"orgMembers">,
  permission: Permission,
): void {
  if (!hasPermission(member, permission)) {
    throw new Error(`Missing permission: ${permission}`);
  }
}
```

**Feature module usage:**

```ts
// In any mutation handler where ctx.member is available:
ensurePermission(ctx.member, "connections.assign");
// If the user doesn't have the permission, this throws immediately
```

---

## Row-Level Security (RLS)

For tables where every query must be scoped, we wrap `ctx.db` with RLS:

```ts
// convex/_rules/rlsRules.ts
import { Rules } from "convex-helpers/server/rowLevelSecurity";
import { DataModel } from "../_generated/dataModel";
import { QueryCtx } from "../_generated/server";

export async function rlsRules(ctx: QueryCtx) {
  const identity = await ctx.auth.getUserIdentity();
  const user = identity
    ? await ctx.db.query("users")
        .withIndex("by_tokenIdentifier", q => q.eq("tokenIdentifier", identity.tokenIdentifier))
        .unique()
    : null;

  return {
    notifications: {
      read: async (_, doc) => doc.userId === user?._id,
      modify: async (_, doc) => doc.userId === user?._id,
      insert: async () => true, // System can insert for any user
    },
    activityLogs: {
      read: async () => !!user, // Any authenticated user can read logs in their org
      insert: async () => true,
      modify: async () => false, // Logs are immutable
    },
  } satisfies Partial<Rules<QueryCtx, DataModel>>;
}
```

**When to use RLS vs manual checks:**
- **RLS**: When *every* read of a table must be filtered (notifications, personal data).
- **Manual checks**: When access logic varies by function (connections: admins see all, members see own).

---

## Frontend Permission Hook

```ts
// lib/hooks/usePermissions.ts
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";

export function usePermissions() {
  const member = useQuery(api.members.queries.currentMember);

  function can(permission: string): boolean {
    if (!member) return false;
    const rolePerms = ROLE_PERMISSIONS[member.role] ?? [];
    return rolePerms.includes(permission) || (member.permissions ?? []).includes(permission);
  }

  return {
    role: member?.role ?? null,
    can,
    isOwner: member?.role === "owner",
    isAdmin: member?.role === "owner" || member?.role === "admin",
    isMember: !!member,
    isLoading: member === undefined,
  };
}
```

**Usage in components:**

```tsx
function ConnectionActions({ connectionId }) {
  const { can } = usePermissions();

  return (
    <>
      {can("connections.assign") && <AssignPartnerButton id={connectionId} />}
      {can("connections.delete") && <DeleteConnectionButton id={connectionId} />}
    </>
  );
}
```

---

## Security Rules

1. **NEVER** accept `userId` as a function argument for auth purposes. Always derive from `ctx.auth.getUserIdentity()`.
2. **NEVER** use `query`/`mutation` directly for protected functions. Always use `authenticatedQuery`/`authenticatedMutation` or `orgQuery`/`orgMutation`.
3. **ALWAYS** validate `orgId` access — check the user is a member of the org.
4. **Use `internalMutation`** for system operations (notifications, logs) that run without a user context.
5. **Feature flags guard features, not security.** A hidden button is not access control. The backend must enforce.
