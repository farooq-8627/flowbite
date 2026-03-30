# 02 — Database Schema (Convex)

> Every table, every index, every validator. This is the authoritative schema reference. Changes here propagate everywhere because all functions import from shared validators.

---

## Design Rules

1. **Every row has `orgId`** (except `users` and `orgs` themselves). This is the multi-tenancy key.
2. **No unbounded arrays** inside documents. Use a separate table with a foreign key.
3. **Soft-delete** via `deletedAt: v.optional(v.number())` instead of physical deletion. Queries filter out soft-deleted rows by default.
4. **Timestamps** via `createdAt` and `updatedAt` (epoch ms). `_creationTime` is Convex-managed and read-only — our `createdAt` gives us write control.
5. **Indexes include all query fields**. Name format: `by_field1_and_field2`.
6. **Separate high-churn data** from stable profile data.

---

## Shared Validators

These live in `convex/_shared/validators.ts` and are imported by every table definition.

```ts
import { v } from "convex/values";

// Every org-scoped table includes this
export const orgScoped = {
  orgId: v.id("orgs"),
};

// Standard timestamps on most tables
export const timestamps = {
  createdAt: v.number(),
  updatedAt: v.number(),
};

// Soft-delete support
export const softDelete = {
  deletedAt: v.optional(v.number()),
};

// Common user reference
export const createdBy = {
  createdBy: v.id("users"),
};

// Reusable status pattern
export const withStatus = (statuses: string[]) => ({
  status: v.union(...statuses.map(s => v.literal(s))),
});
```

---

## Table Definitions

### `users` — App-level user profile

```ts
users: defineTable({
  // Link to Convex Auth identity
  tokenIdentifier: v.string(),
  email: v.string(),
  name: v.optional(v.string()),
  avatarUrl: v.optional(v.string()),
  avatarStorageId: v.optional(v.id("_storage")),
  // Default org (for quick-switch)
  defaultOrgId: v.optional(v.id("orgs")),
  // Preferences
  locale: v.optional(v.string()),
  timezone: v.optional(v.string()),
  // Status
  onboardingCompleted: v.boolean(),
  lastActiveAt: v.optional(v.number()),
  ...timestamps,
  ...softDelete,
})
  .index("by_tokenIdentifier", ["tokenIdentifier"])
  .index("by_email", ["email"])
```

**Why separate from auth tables?** The auth tables (`authSessions`, `authAccounts`) are managed by `@convex-dev/auth`. Our `users` table stores *application* data — preferences, profile, org membership. Linked via `tokenIdentifier`.

---

### `orgs` — Organizations (tenants)

```ts
orgs: defineTable({
  name: v.string(),
  slug: v.string(),           // URL-friendly unique identifier
  logoStorageId: v.optional(v.id("_storage")),
  plan: v.union(
    v.literal("free"),
    v.literal("starter"),
    v.literal("pro"),
    v.literal("enterprise"),
  ),
  stripeCustomerId: v.optional(v.string()),
  stripeSubscriptionId: v.optional(v.string()),
  settings: v.optional(v.object({
    defaultCurrency: v.optional(v.string()),
    timezone: v.optional(v.string()),
    // Extensible: features add their own settings
  })),
  ...timestamps,
  ...softDelete,
})
  .index("by_slug", ["slug"])
  .index("by_stripeCustomerId", ["stripeCustomerId"])
```

**Why `slug`?** URL-safe org identifier. `/dashboard` scope uses the current org from session context, but invite links and admin URLs use slugs.

---

### `orgMembers` — Membership + Roles

```ts
orgMembers: defineTable({
  ...orgScoped,
  userId: v.id("users"),
  role: v.union(
    v.literal("owner"),
    v.literal("admin"),
    v.literal("member"),
    v.literal("viewer"),
  ),
  permissions: v.optional(v.array(v.string())), // Fine-grained overrides
  invitedBy: v.optional(v.id("users")),
  joinedAt: v.number(),
  ...softDelete,
})
  .index("by_orgId_and_userId", ["orgId", "userId"])
  .index("by_userId", ["userId"])
  .index("by_orgId_and_role", ["orgId", "role"])
```

**Why a join table instead of roles on `users`?** A user can belong to multiple orgs with different roles in each. The `orgMembers` row is the membership record.

---

### `invitations` — Pending org invites

```ts
invitations: defineTable({
  ...orgScoped,
  email: v.string(),
  role: v.union(
    v.literal("admin"),
    v.literal("member"),
    v.literal("viewer"),
  ),
  status: v.union(
    v.literal("pending"),
    v.literal("accepted"),
    v.literal("declined"),
    v.literal("expired"),
  ),
  invitedBy: v.id("users"),
  token: v.string(),            // Secure random token for invite link
  expiresAt: v.number(),
  ...timestamps,
})
  .index("by_orgId_and_email", ["orgId", "email"])
  .index("by_token", ["token"])
  .index("by_orgId_and_status", ["orgId", "status"])
```

---

### `notifications` — In-app notifications

```ts
notifications: defineTable({
  ...orgScoped,
  userId: v.id("users"),         // Recipient
  type: v.string(),              // "connection.created", "member.invited", etc.
  title: v.string(),
  body: v.optional(v.string()),
  // Polymorphic link: what entity does this notification reference?
  entityType: v.optional(v.string()),   // "connection", "payment", "member"
  entityId: v.optional(v.string()),     // The ID of the referenced entity
  // Action URL
  actionUrl: v.optional(v.string()),
  // Read/archive state
  read: v.boolean(),
  readAt: v.optional(v.number()),
  archivedAt: v.optional(v.number()),
  // Metadata for rendering
  metadata: v.optional(v.any()),
  ...timestamps,
})
  .index("by_userId_and_read", ["userId", "read"])
  .index("by_orgId_and_userId", ["orgId", "userId"])
  .index("by_userId_and_createdAt", ["userId", "createdAt"])
  .index("by_type_and_orgId", ["type", "orgId"])
```

**Why `type` as string?** Feature modules define their own notification types. The base doesn't need to know all types — it just stores and renders them. The `type` drives icon selection and deep linking.

---

### `activityLogs` — Audit trail

```ts
activityLogs: defineTable({
  ...orgScoped,
  userId: v.id("users"),         // Who performed the action
  action: v.string(),            // "created", "updated", "deleted", "assigned"
  entityType: v.string(),        // "connection", "member", "payment", "org"
  entityId: v.string(),          // ID of the affected entity
  description: v.string(),       // Human-readable summary
  changes: v.optional(v.any()),  // { field: { old, new } } diff object
  metadata: v.optional(v.any()), // Extra context (IP, user agent, etc.)
  ...timestamps,
})
  .index("by_orgId_and_createdAt", ["orgId", "createdAt"])
  .index("by_orgId_and_entityType", ["orgId", "entityType"])
  .index("by_entityType_and_entityId", ["entityType", "entityId"])
  .index("by_userId_and_orgId", ["userId", "orgId"])
```

---

### `featureFlags` — Internal feature flag store

```ts
featureFlags: defineTable({
  key: v.string(),               // "connections.kanban_view", "payments.v2"
  enabled: v.boolean(),
  // Targeting
  scope: v.union(
    v.literal("global"),         // All orgs
    v.literal("org"),            // Specific orgs
    v.literal("user"),           // Specific users
  ),
  targetIds: v.optional(v.array(v.string())), // Org or user IDs
  // Rollout
  rolloutPercentage: v.optional(v.number()), // 0-100
  description: v.optional(v.string()),
  ...timestamps,
})
  .index("by_key", ["key"])
  .index("by_scope_and_key", ["scope", "key"])
```

---

### `files` — File metadata (wraps Convex `_storage`)

```ts
files: defineTable({
  ...orgScoped,
  storageId: v.id("_storage"),
  name: v.string(),
  mimeType: v.string(),
  size: v.number(),              // bytes
  uploadedBy: v.id("users"),
  // Polymorphic association
  entityType: v.optional(v.string()),
  entityId: v.optional(v.string()),
  ...timestamps,
  ...softDelete,
})
  .index("by_orgId", ["orgId"])
  .index("by_entityType_and_entityId", ["entityType", "entityId"])
  .index("by_storageId", ["storageId"])
```

---

### `emailLogs` — Email delivery tracking

```ts
emailLogs: defineTable({
  ...orgScoped,
  to: v.string(),
  subject: v.string(),
  template: v.string(),          // "invitation", "notification", "receipt"
  status: v.union(
    v.literal("queued"),
    v.literal("sent"),
    v.literal("delivered"),
    v.literal("failed"),
  ),
  resendId: v.optional(v.string()),
  error: v.optional(v.string()),
  ...timestamps,
})
  .index("by_orgId_and_status", ["orgId", "status"])
  .index("by_orgId_and_template", ["orgId", "template"])
```

---

## Feature Module Tables (Examples)

Feature tables are defined in `convex/[feature]/tables.ts` and imported into `schema.ts`.

### Connections (Project Connections)

```ts
// convex/connections/tables.ts
import { defineTable } from "convex/server";
import { v } from "convex/values";

export const connectionTables = {
  connections: defineTable({
    orgId: v.id("orgs"),
    // Participants
    clientId: v.id("users"),      // Client who submitted project
    partnerId: v.optional(v.id("users")),  // Assigned partner
    adminId: v.id("users"),       // Admin who manages
    // Project details
    title: v.string(),
    description: v.optional(v.string()),
    status: v.union(
      v.literal("draft"),
      v.literal("pending_partner"),
      v.literal("active"),
      v.literal("in_progress"),
      v.literal("review"),
      v.literal("completed"),
      v.literal("cancelled"),
    ),
    // Dates
    startDate: v.optional(v.number()),
    endDate: v.optional(v.number()),
    completedAt: v.optional(v.number()),
    // Financials (future)
    estimatedValue: v.optional(v.number()),
    currency: v.optional(v.string()),
    // Metadata
    tags: v.optional(v.array(v.string())),
    createdAt: v.number(),
    updatedAt: v.number(),
    deletedAt: v.optional(v.number()),
  })
    .index("by_orgId_and_status", ["orgId", "status"])
    .index("by_orgId_and_clientId", ["orgId", "clientId"])
    .index("by_orgId_and_partnerId", ["orgId", "partnerId"])
    .index("by_orgId_and_adminId", ["orgId", "adminId"]),
};
```

### Schema Master File

```ts
// convex/schema.ts
import { authTables } from "@convex-dev/auth/server";
import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";
import { connectionTables } from "./connections/tables";
// Import more feature tables here

export default defineSchema({
  ...authTables,

  // ===== BASE TABLES =====
  users: defineTable({ /* ... */ }),
  orgs: defineTable({ /* ... */ }),
  orgMembers: defineTable({ /* ... */ }),
  invitations: defineTable({ /* ... */ }),
  notifications: defineTable({ /* ... */ }),
  activityLogs: defineTable({ /* ... */ }),
  featureFlags: defineTable({ /* ... */ }),
  files: defineTable({ /* ... */ }),
  emailLogs: defineTable({ /* ... */ }),

  // ===== FEATURE TABLES =====
  ...connectionTables,
  // ...otherFeatureTables,
});
```

**Adding a new feature's tables is one line**: `...myFeatureTables`. Removing is one line deletion.

---

## Relationship Diagram

```
users ──┬── orgMembers ──── orgs
        │        │
        │        └── role (owner/admin/member/viewer)
        │
        ├── notifications (userId → recipient)
        ├── activityLogs (userId → actor)
        ├── files (uploadedBy)
        │
        └── connections (clientId, partnerId, adminId)
                │
                └── orgId → orgs (tenancy scope)
```

---

## Index Philosophy

- **Every query that filters should use an index.** Never `filter()`.
- **Compound indexes for common query patterns.** `by_orgId_and_status` supports both "all connections in org" (prefix) and "active connections in org" (full index).
- **Always return bounded results.** Use `.take(n)` or `.paginate()`, never `.collect()` on unbounded tables.
- **Count via denormalized counters.** Don't use `.collect().length`. Maintain counters in mutations.
