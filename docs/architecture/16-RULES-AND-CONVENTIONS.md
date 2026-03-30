# 16 — Rules & Conventions

> Non-negotiable rules for everyone working in this codebase. Break these and the architecture falls apart. Follow them and features compose cleanly.

---

## Golden Rules

### 1. Never duplicate validators, types, or constants

**Wrong:**
```ts
// convex/connections/mutations.ts
args: { status: v.union(v.literal("draft"), v.literal("active"), v.literal("completed")) }

// features/connections/types.ts
type ConnectionStatus = "draft" | "active" | "completed";
```

**Right:**
```ts
// convex/_shared/validators.ts — SINGLE SOURCE
export const connectionStatusValues = ["draft", "active", "completed"] as const;
export type ConnectionStatus = typeof connectionStatusValues[number];
export const connectionStatusValidator = v.union(
  ...connectionStatusValues.map(s => v.literal(s)),
);

// convex/connections/mutations.ts — imports
args: { status: connectionStatusValidator }

// features/connections/types.ts — imports
import { type ConnectionStatus } from "@/convex/_shared/validators";
```

### 2. Never use raw `query`/`mutation` for protected functions

**Wrong:**
```ts
export const list = query({
  args: { orgId: v.id("orgs") },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");
    // ...
  },
});
```

**Right:**
```ts
export const list = orgQuery({
  args: {},  // orgId handled by orgQuery automatically
  handler: async (ctx, args) => {
    // ctx.user, ctx.org, ctx.member already available
  },
});
```

### 3. Never accept userId as an argument for auth

**Wrong:**
```ts
args: { userId: v.id("users"), action: v.string() }
```

**Right:**
```ts
// Derive from auth context
handler: async (ctx, args) => {
  // ctx.user._id is the verified user
}
```

### 4. Never use `.filter()` in Convex queries

**Wrong:**
```ts
await ctx.db.query("connections").filter(q => q.eq(q.field("orgId"), orgId)).collect();
```

**Right:**
```ts
await ctx.db.query("connections")
  .withIndex("by_orgId_and_status", q => q.eq("orgId", orgId))
  .take(50);
```

### 5. Never use `.collect()` on unbounded tables

**Wrong:**
```ts
const all = await ctx.db.query("connections").collect();
return all.length;
```

**Right:**
```ts
const results = await ctx.db.query("connections")
  .withIndex("by_orgId_and_status", q => q.eq("orgId", orgId))
  .take(100);
```

### 6. Always use `internalMutation`/`internalQuery` for system operations

Public functions (`query`, `mutation`) are exposed to the internet. System operations (sending notifications, logging activity, cron handlers) must use `internal` variants.

### 7. Every table mutation must update `updatedAt`

```ts
await ctx.db.patch(id, { ...updates, updatedAt: Date.now() });
```

### 8. Feature logic stays in feature folders

**Wrong:** Adding connection-specific logic to `convex/notifications/helpers.ts`

**Right:** The notification system is generic. Connection-specific notification calls happen in `convex/connections/mutations.ts`.

---

## Locale Handling — Global, Not Per-Query

> **Rule: Never hardcode locale in URLs or pass locale as a query parameter. Use a global locale hook.**

### The Problem

If every component builds URLs like `/en/dashboard/connections/[id]`, and every query passes locale, changing the locale requires touching dozens of files.

### The Solution: A Global `useAppRouter` Hook

```ts
// lib/hooks/useAppRouter.ts
import { useRouter, useParams } from "next/navigation";
import { useLocale } from "next-intl";

/**
 * A locale-aware router. Use this instead of next/navigation's useRouter.
 * Automatically prefixes all navigation with the current locale.
 *
 * Usage:
 *   const { push, replace } = useAppRouter();
 *   push("/dashboard/connections");    // → navigates to /en/dashboard/connections
 *
 * To strip locale from the app later: remove the locale prefix from push/replace here.
 * Nothing else in the codebase changes.
 */
export function useAppRouter() {
  const router = useRouter();
  const locale = useLocale();

  return {
    push: (path: string) => router.push(`/${locale}${path}`),
    replace: (path: string) => router.replace(`/${locale}${path}`),
    prefetch: (path: string) => router.prefetch(`/${locale}${path}`),
    locale,
  };
}
```

### Building Locale-Safe Links

```ts
// lib/navigation.ts
import { useLocale } from "next-intl";

/**
 * Returns a path prefixed with the current locale.
 * Use for <Link href={localePath("/dashboard/...")}> instead of hardcoding locale.
 */
export function useLocalePath() {
  const locale = useLocale();
  return (path: string) => `/${locale}${path}`;
}
```

```tsx
// In components — always use useAppRouter or useLocalePath, never hardcode locale
import { useLocalePath } from "@/lib/navigation";

function ConnectionCard({ id }: { id: string }) {
  const localePath = useLocalePath();
  return <Link href={localePath(`/dashboard/connections/${id}`)}>View</Link>;
}
```

### Where Locale Lives

- `next-intl` handles route-level locale detection via `[locale]` segment in the URL
- `useLocale()` from `next-intl` gives the current locale anywhere in a component
- **No locale is passed to Convex queries** — the backend is locale-agnostic. Localization is presentation-only.

### Removing Locale Later

To strip locale from the app entirely:
1. Update `useAppRouter.push` to remove the `/${locale}` prefix
2. Remove `[locale]` from the route directory structure
3. Done — nothing in business logic changes

---

### 9. Always use compact helpers — never pass `orgId`/`userId` to `sendNotification` or `logActivity`

**Wrong:**
```ts
await sendNotification(ctx, {
  orgId: ctx.org._id,       // ← auto-injected, never pass manually
  userId: args.partnerId,   // ← wrong field name, auto-injected for actor
  templateKey: "connection.assigned",
  variables: { ... },       // ← renamed to `vars`
});
```

**Right:**
```ts
await sendNotification(ctx, {
  templateKey: "connection.assigned",
  to: args.partnerId,
  vars: { ... },
  entityType: "connection",
  entityId: args.connectionId,
});
```

### 10. Feature notification templates go in the feature folder

**Wrong:** Adding connection templates to `convex/notifications/templates.ts`

**Right:** Create `convex/connections/notifications.ts`, export `registerConnectionNotifications()`, call it once at the top of `mutations.ts`.

### 11. Every feature folder must have an `index.ts`

**Wrong:** `import { ConnectionList } from "@/features/connections/components/ConnectionList"`

**Right:** `import { ConnectionList } from "@/features/connections"`

---

### Files

| Pattern | Used For | Examples |
|---|---|---|
| `camelCase.ts` | All TS files except components | `queries.ts`, `helpers.ts`, `uiStore.ts` |
| `PascalCase.tsx` | React components | `ConnectionCard.tsx`, `DataTable.tsx` |
| `camelCase/` | All directories | `connections/`, `activityLogs/` |

### Convex Functions

| Pattern | Example |
|---|---|
| `[table].[file].[function]` | `api.connections.queries.list` |
| Queries: `list`, `get`, `getBy[Field]`, `search` | `list`, `getById`, `getByClient` |
| Mutations: `create`, `update`, `delete`, `[verb]` | `create`, `assignPartner`, `changeStatus` |
| Actions: `send[Thing]`, `process[Thing]`, `sync[Thing]` | `sendEmail`, `processPayment` |

### Database Tables

| Pattern | Examples |
|---|---|
| `camelCase`, plural | `connections`, `orgMembers`, `activityLogs` |
| Join tables: `[parent][child]` | `orgMembers` (org + user join) |

### Indexes

| Pattern | Examples |
|---|---|
| `by_[field1]_and_[field2]` | `by_orgId_and_status`, `by_userId_and_read` |

### Validators

| Pattern | Examples |
|---|---|
| `[entity][Field]Validator` | `connectionStatusValidator` |
| `[entity][Field]Values` (source array) | `connectionStatusValues` |

### React Hooks

| Pattern | Examples |
|---|---|
| `use[Entity]s` (list) | `useConnections()` |
| `use[Entity]` (single) | `useConnection(id)` |
| `use[Entity]Mutations` (writes) | `useConnectionMutations()` |
| `use[Concept]` (utility) | `usePermissions()`, `useFeatureFlag()` |

### Feature Flags

| Pattern | Examples |
|---|---|
| `[module].[feature_name]` | `connections.kanban_view`, `payments.v2_checkout` |

### Permissions

| Pattern | Examples |
|---|---|
| `[module].[action]` | `connections.create`, `org.manage`, `admin.featureFlags` |

---

## TypeScript Rules

1. **No `any`** except for `metadata` fields and Convex `v.any()` validators. Use `unknown` when the type is genuinely unknown.
2. **Use `Id<"tableName">`** instead of `string` for document IDs.
3. **Use `Doc<"tableName">`** for full document types.
4. **Use `QueryCtx`, `MutationCtx`, `ActionCtx`** for context types. Never `any`.
5. **Explicit return types on handlers** that are called by `ctx.runQuery` in the same file (avoid circular type inference).

---

## Import Rules

1. **Always use aliases**: `@/convex/`, `@/features/`, `@/components/`, `@/lib/`
2. **Never relative imports across modules**: No `../../../convex/connections/queries`
3. **Convex files import from Convex**: `convex/connections/mutations.ts` imports from `../_shared/validators`
4. **Feature files import from `@/`**: `features/connections/hooks/useConnections.ts` imports from `@/convex/_generated/api`
5. **Route files import from `@/features/`**: `app/dashboard/connections/page.tsx` imports from `@/features/connections/components/ConnectionList`

---

## Error Handling

### Backend (Convex)

- **Auth errors**: Handled by custom function builders. Throws before handler runs.
- **Permission errors**: Use `ensurePermission()`. Throws with clear message.
- **Not found**: Check result of `ctx.db.get()` before using.
- **Validation**: Convex validators handle argument validation. No extra checks needed.

### Frontend

- **Mutation errors**: Catch in the hook wrapper, show toast. Don't let errors propagate unhandled.
- **Query loading**: Always handle `undefined` (loading) state. Use "skip" for conditional queries.
- **User feedback**: Use `sonner` toasts for success/error. Use skeleton components for loading.

```ts
// Pattern for mutation hooks
const create = async (data: CreateInput) => {
  try {
    const id = await createMutation({ orgId, ...data });
    toast.success("Created successfully");
    return id;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Something went wrong";
    toast.error(message);
    throw error;
  }
};
```

---

## Git Conventions

| Rule | Example |
|---|---|
| Feature branches | `feature/connections`, `feature/invoices` |
| Fix branches | `fix/notification-bell`, `fix/auth-redirect` |
| Base branches | `base/notification-system`, `base/rbac` |
| Commit messages | `feat(connections): add partner assignment` |
| One feature per PR | Don't mix connections + invoices in one PR |

---

## Checklist Before Every PR

- [ ] No raw `query`/`mutation` for protected functions
- [ ] No `.filter()` in Convex queries (use indexes)
- [ ] No `.collect()` without bounded context
- [ ] No `any` types (except metadata fields)
- [ ] All mutations update `updatedAt`
- [ ] All significant mutations call `logActivity()` (compact form — no `orgId`/`userId`)
- [ ] Notification-worthy events call `sendNotification()` (compact form — no `orgId`, use `to:` not `userId:`)
- [ ] All shared validators/types imported, not duplicated
- [ ] Feature code self-contained in feature folders
- [ ] Feature folder has `index.ts` as the single export point
- [ ] Feature notification templates in `convex/[feature]/notifications.ts`
- [ ] Route pages are thin wrappers
- [ ] No hardcoded locale in URLs — use `useAppRouter` or `useLocalePath`
- [ ] `biome check` passes
- [ ] `tsc --noEmit` passes

---

## Code Duplication Elimination Strategy

| Problem | Solution |
|---|---|
| Same validation on client + server | Shared validators in `convex/_shared/validators.ts`, Zod schemas in `features/[name]/types.ts` derive from them |
| Same auth check in every function | Custom function builders (`orgQuery`, `authenticatedMutation`) |
| Same notification logic per feature | Centralized `sendNotification()` with templates; feature templates in `convex/[feature]/notifications.ts` |
| Same logging logic per feature | Centralized `logActivity()` helper with auto-injected `orgId` and `userId` |
| Same error handling in hooks | Mutation hook wrappers with toast feedback |
| Same org context everywhere | `useCurrentUser()` hook provides `orgId`, `user`, `org` |
| Same permission checks everywhere | `usePermissions()` hook + `ensurePermission()` backend helper |
| Same table boilerplate (orgId, timestamps) | Shared validators: `orgScoped`, `timestamps`, `softDelete` |
| Locale prefix repeated in every URL | `useAppRouter()` / `useLocalePath()` — single locale injection point |
| `orgId` repeated in every `sendNotification` call | Auto-injected from `ctx.org._id` inside the helper |
| Feature imports deep into internal files | Feature `index.ts` as single public API |

---

## What To Do When You're Unsure

1. **"Where does this code go?"** → Check `01-FOLDER-STRUCTURE.md`
2. **"What tables already exist?"** → Check `02-DATABASE-SCHEMA.md`
3. **"How do I check permissions?"** → Check `03-AUTH-AND-RBAC.md`
4. **"How do I send a notification?"** → Check `05-NOTIFICATION-SYSTEM.md`, call `sendNotification()`
5. **"How do I log an action?"** → Check `06-ACTIVITY-LOGS.md`, call `logActivity()`
6. **"Should this be a cron or Trigger.dev task?"** → Check `08-BACKGROUND-JOBS.md` decision tree
7. **"How do I add a new feature?"** → Follow `15-FEATURE-MODULE-PATTERN.md` step by step
8. **"How do I make this change propagate?"** → Define in `_shared/validators.ts`, import everywhere
