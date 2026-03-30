# Rules & Conventions

> Non-negotiable. Break these and the architecture collapses. No exceptions.

---

## 🔴 R0 — ABSOLUTE: No Training Data (highest priority rule)

**Before writing ANY code or making ANY suggestion:**

1. Use `firecrawl-search` skill to find a production codebase or article that solves the exact problem
2. Use `github-mcp-server-search_code` to find real implementations in open-source repos
3. Scan official docs via `firecrawl-scrape` — never recall docs from memory
4. Check Convex's own GitHub (`github.com/get-convex`) for canonical patterns
5. Reference the scanned code, adapt it to the project's architecture, then implement

**End every response with:**
```
📚 Sources: [URLs]
✅ Training Data Used: YES | NONE
```

If no live source can be found → say "I need to search for this first" and run a search.

---

## Golden Rules

### R1 — Never duplicate validators, types, or constants
Define once in `convex/_shared/validators.ts` (backend) or `lib/` (frontend). Import everywhere.

```ts
// ✅ CORRECT
export const connectionStatusValues = ["draft", "active", "completed"] as const;
export const connectionStatusValidator = v.union(...connectionStatusValues.map(s => v.literal(s)));

// ❌ WRONG — defining status in multiple places
args: { status: v.union(v.literal("draft"), v.literal("active")) }  // inline
```

### R2 — Never use raw `query`/`mutation` for protected functions
```ts
// ✅ CORRECT
export const list = orgQuery({ args: {}, handler: async (ctx) => { /* ctx.user, ctx.org, ctx.member ready */ }});

// ❌ WRONG
export const list = query({ args: {}, handler: async (ctx) => {
  const identity = await ctx.auth.getUserIdentity();  // manual auth = wrong
}});
```

### R3 — Never accept `userId` / `orgId` as auth arguments
```ts
// ✅ Derive from ctx
handler: async (ctx, args) => { /* ctx.user._id is the verified user */ }

// ❌ WRONG
args: { userId: v.id("users") }  // client can pass any userId
```

### R4 — Never use `.filter()` in Convex queries
```ts
// ✅ CORRECT — use withIndex
await ctx.db.query("connections").withIndex("by_orgId_and_status", q => q.eq("orgId", orgId)).take(50);

// ❌ WRONG
await ctx.db.query("connections").filter(q => q.eq(q.field("orgId"), orgId)).collect();
```

### R5 — Never use `.collect()` on unbounded tables
```ts
// ✅ Use .take(n) or paginate
.take(100)

// ❌ WRONG
.collect()  // unbounded — will break at scale
```

### R6 — Always use `internalMutation` / `internalQuery` for system operations
Public functions are exposed to the internet. Cron handlers, notification senders, activity loggers = `internal`.

### R7 — Every mutation must update `updatedAt`
```ts
await ctx.db.patch(id, { ...updates, updatedAt: Date.now() });
```

### R8 — Feature logic stays in feature folders
Don't add connection-specific logic to `convex/notifications/`. The notification system is generic. Feature calls it from its own mutations file.

### R9 — Use `useAppRouter()` — never hardcode locale in paths
```ts
// ✅ CORRECT
const { push } = useAppRouter();
push("/dashboard/connections");   // → auto prefixes /en/

// ❌ WRONG
router.push("/en/dashboard/connections");
```

### R10 — sendNotification / logActivity — never pass orgId/userId manually
```ts
// ✅ CORRECT
await sendNotification(ctx, { templateKey: "connection.assigned", to: args.partnerId, vars: {...} });

// ❌ WRONG
await sendNotification(ctx, { orgId: ctx.org._id, userId: ... });  // auto-injected
```

### R11 — Every feature folder must have `index.ts`
```ts
// ✅ CORRECT
import { ConnectionList } from "@/features/connections";

// ❌ WRONG
import { ConnectionList } from "@/features/connections/components/ConnectionList";
```

### R12 — zustand = UI state only. Convex = all server state.

---

## Naming Conventions

### Files
| Pattern | Use |
|---|---|
| `camelCase.ts` | All TS/JS files except components |
| `PascalCase.tsx` | React components |
| `camelCase/` | All directories |

### Convex Functions
| Pattern | Examples |
|---|---|
| Queries: `list`, `get`, `getBy[Field]`, `search` | `list`, `getById` |
| Mutations: `create`, `update`, `delete`, `[verb]` | `create`, `assignPartner` |
| Actions: `send[X]`, `process[X]`, `sync[X]` | `sendEmail`, `processPayment` |

### Database Tables
| Pattern | Examples |
|---|---|
| `camelCase`, plural | `connections`, `orgMembers`, `activityLogs` |
| Join tables: `[parent][child]` | `orgMembers` |

### Indexes
| Pattern | Examples |
|---|---|
| `by_[field1]_and_[field2]` | `by_orgId_and_status` |

### Validators
| Pattern | Examples |
|---|---|
| `[entity][Field]Validator` | `connectionStatusValidator` |
| `[entity][Field]Values` | `connectionStatusValues` |

### React Hooks
| Pattern | Examples |
|---|---|
| `use[Entity]s` (list) | `useConnections()` |
| `use[Entity]` (single) | `useConnection(id)` |
| `use[Entity]Mutations` | `useConnectionMutations()` |

### Feature Flags
| Pattern | Examples |
|---|---|
| `[module].[feature]` | `connections.kanban_view` |

### Permissions
| Pattern | Examples |
|---|---|
| `[module].[action]` | `connections.create`, `org.manage` |

---

## TypeScript Rules

- Use `Doc<"tableName">` for document types, `Id<"tableName">` for ID types
- Use `QueryCtx`, `MutationCtx`, `ActionCtx` for context typing — never `any`
- Always use strict id types: `Id<"users">` not `string`
- All Convex functions must have argument validators — no exceptions

---

## Build Order for Every Slice (follow exactly)

1. Tables + indexes → `convex/[name]/tables.ts`
2. Constants → `convex/_shared/constants.ts` (add to existing)
3. Queries → `convex/[name]/queries.ts`
4. Mutations → `convex/[name]/mutations.ts` (include `logActivity` + notification)
5. Backend index → `convex/[name]/index.ts`
6. Frontend types → `features/[name]/types.ts`
7. Frontend hooks → `features/[name]/hooks/`
8. Components → `features/[name]/components/` (smallest first: badge → card → list → detail → form)
9. Routes → `app/[locale]/dashboard/[name]/`
10. Register → `features/_registry.ts`

---

## MCP Usage Rules (R13–R15)

### R13 — Scan Sentry before ending every session
Before closing any session, run `Sentry-search_issues` to check for new production errors. Report status.

### R14 — Use pino for ALL logging — zero console.log in production code
```ts
// ✅ CORRECT
import logger from "@/lib/logger";
logger.info({ userId }, "User signed in");

// ❌ WRONG
console.log("User signed in:", userId);
```
Exception: `console.error` only in React error boundaries (browser-only catch blocks).

### R15 — When Convex schema or functions change, verify in dashboard
After any `convex/` code change: run `npx convex codegen` then verify with Convex MCP or check dashboard at `https://dashboard.convex.dev/`.

---



- ❌ No `console.log` in production code — use `lib/logger.ts` (pino)
- ❌ No `any` types anywhere
- ❌ No `.collect()` on large tables
- ❌ No inline status/role literals — use shared validators
- ❌ No hardcoded locale in paths
- ❌ No direct OpenAI/AI calls — go through Trigger.dev action
- ❌ No raw `query`/`mutation` for protected routes
- ❌ No zustand for server data
- ❌ No passing auth data as function arguments
- ❌ No `pnpm` → `npm` or `yarn`
- ❌ No unbounded arrays in documents

---

## Acceptance Criteria (every feature slice)

- [ ] No browser console errors or warnings
- [ ] Data scoped to org — wrong org cannot read data
- [ ] Wrong role redirects correctly
- [ ] Disabling module → route redirects, sidebar item disappears
- [ ] `logActivity` called after every mutation
- [ ] Notification created where relevant
- [ ] Loading skeleton while query is pending
- [ ] Empty state renders correctly
- [ ] Renders without overflow at 390px viewport
- [ ] `pnpm build` exits with zero errors
- [ ] No Biome lint errors

### R16 — What's Next: Every module file must document its implementation status

At the top of every feature module file and inside every agent session response, document:
- `STATUS: IMPLEMENTED` — with what was done
- `STATUS: NOT IMPLEMENTED — build next` — with what needs to be done
- `STATUS: PARTIAL` — with what's done and what's missing

Every session must end with a **"What's Next"** section that lists:
1. The next module to implement in priority order.
2. Any unfinished tasks from the current session.
3. Any issues or blockers discovered.

When completing a task, always update `context.md`, `todos.md`, and `checklist.md`.
Never leave these files stale.

```ts
/**
 * STATUS: IMPLEMENTED
 * - superAdminQuery, superAdminMutation, requireSuperAdmin
 * - Tests: 2 tests in authenticated.test.ts
 *
 * WHAT'S NEXT:
 * - Add `useOrgPermission` React hook for frontend gates (Phase 0)
 * - Build Connections module (Phase 1) — client/partner RBAC
 */
```

### R17 — RBAC: Always use `hasPermission()` or `requireRole()` — never inline checks

```ts
// ✅ CORRECT
import { requireRole } from "../_shared/permissions";
const { member } = await requireOrgMember(ctx, args.orgId);
requireRole(member.role, "members.invite");

// ❌ WRONG — inline role check, not auditable, easy to miss on refactor
if (member.role !== "owner" && member.role !== "admin") {
  throw new ConvexError(ERRORS.FORBIDDEN);
}
```

- All permission definitions live in `convex/_shared/permissions.ts` → `PERMISSIONS` map.
- New features add entries to the `PERMISSIONS` map first, then write the mutation.
- To audit what any role can do, `grep PERMISSIONS convex/_shared/permissions.ts`.
- Frontend gates use `useOrgPermission("members.invite")` hook (Phase 0 — not yet built).

### R18 — Plan Downgrade: NEVER delete data. Only pause via feature flags.

When `super_admin` downgrades an org's plan:
1. Update `orgs.plan` to the new plan.
2. Apply `PLAN_FEATURES[newPlan]` to `featureFlags.orgOverrides`.
3. **Do NOT delete any documents** — reports, commissions, workflows, etc.
4. Data is "paused" — inaccessible via UI, but preserved in DB.
5. On upgrade, clear the override and data becomes accessible again.

```ts
// ✅ CORRECT — downgrade preserves data
await ctx.db.patch(args.orgId, { plan: args.newPlan });
// Apply new feature set via featureFlags module

// ❌ WRONG — deleting reports on downgrade
const reports = await ctx.db.query("reports").withIndex("by_orgId", q => q.eq("orgId", orgId)).collect();
for (const r of reports) await ctx.db.delete(r._id);
```

Ref: `.github/agents/base/rbac.md` — Data Preservation Rule

### R19 — Auth Guards: Always call `requireRole()` at the START of the handler

```ts
// ✅ CORRECT — guard is the first line after getting the member
const { member } = await requireOrgMember(ctx, args.orgId);
requireRole(member.role, "members.remove"); // FIRST — before any logic
// ... rest of handler

// ❌ WRONG — guard buried after other logic
const { member } = await requireOrgMember(ctx, args.orgId);
const target = await ctx.db.get(args.targetId); // data read before permission check!
requireRole(member.role, "members.remove");     // too late — already read data
```

**Rule:** `requireRole()` or `requireMinRole()` must be called immediately after `requireOrgMember()`,
before any database reads, writes, or business logic. This prevents data leaks on permission failures.

When writing any new mutation or query that needs permission enforcement:
1. Get the member: `const { member } = await requireOrgMember(ctx, args.orgId);`
2. Check permission: `requireRole(member.role, "module.action");`
3. Then proceed with business logic.

### R20 — End-to-End Testing: Test after every major feature and before ending sessions

After completing **each major feature or part** (e.g. a full module, a set of related mutations, providers):
1. Run `pnpm test` — all tests must pass
2. Run `pnpm typecheck` — zero errors
3. Run `pnpm lint-check` — zero errors (or only pre-existing issues)
4. If frontend changes: verify the dev server renders without errors

Before ending **every session**:
1. Run full test suite: `pnpm test`
2. Run type check: `pnpm typecheck`
3. Run lint: `pnpm lint-check`
4. Report results in session summary
5. Update `context.md`, `todos.md`, `checklist.md`

**Never skip this.** A session that doesn't verify its own work is incomplete.

### R22 — Always Ask Before Architectural or Big Changes

Before making any of the following, use `ask_user` to get explicit approval:
- Changing middleware, routing patterns, or auth flow
- Renaming/moving/deleting files (especially infrastructure files)
- Choosing between multiple valid implementation approaches
- Any change that touches >3 files at once in a core area

**If stuck or confused on any approach:**
1. Do NOT try-retry more than once on your own
2. STOP and use `ask_user` to describe the problem and options
3. Let the user decide direction — never hallucinate a fix

```ts
// Example: before fixing middleware bug with multiple valid approaches
// ❌ WRONG — silently pick one and proceed
// ✅ CORRECT — ask_user with options A, B, C, proceed only after approval
```

### R23 — Ask Once Before Ending Every Chat

At the end of every session, before calling `task_complete`, use `ask_user` to ask:
> "Do you have any other changes, suggestions, or tasks before we end this session?"

Provide multiple-choice options where applicable (e.g., next Phase 1 tasks, bugfixes, etc.).
This prevents missed work and ensures the user stays in control of what gets built.

**Never end a session without this check.**



When any instruction or pattern is discovered during development that should be followed
in future sessions (e.g. "always call X before Y", "never do Z in this context"):
1. Add it as a numbered rule in `rules.md` (this file)
2. If it relates to RBAC, also update `rbac.md`
3. If it relates to build order or conventions, update the relevant section
4. If it creates a new TODO, add to `todos.md`

**Rule:** No important instruction should live only in chat history. If it matters, it goes into
a `.github/agents/base/` file so it persists across sessions.
