# Rules & Conventions

> Non-negotiable GLOBAL rules. Break these and the architecture collapses. No exceptions.
> Module-specific rules are in each module's `MODULE.md` file (see bottom of this file for links).

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

## Convex Backend Rules (R1–R7)

### R1 — Never duplicate validators, types, or constants
Define once in `convex/_shared/validators.ts` (backend) or `lib/` (frontend). Import everywhere.

### R2 — Never use raw `query`/`mutation` for protected functions
Use `orgQuery`, `orgMutation`, `authenticatedQuery`, `authenticatedMutation`, `adminMutation`.

### R3 — Never accept `userId` / `orgId` as auth arguments
Derive from `ctx.user._id` and `ctx.org._id`. Client can spoof args — never trust them.

### R4 — Never use `.filter()` in Convex queries
Always use `.withIndex()`. `.filter()` scans every document.

### R5 — Never use `.collect()` on unbounded tables
Use `.take(n)` or paginate. `.collect()` loads all documents into memory.

### R6 — Always use `internalMutation` / `internalQuery` for system operations
Cron handlers, notification senders, activity loggers = `internal`. Never public.

### R7 — Every mutation must update `updatedAt`
```ts
await ctx.db.patch(id, { ...updates, updatedAt: Date.now() });
```

---

## Frontend Rules (R8–R12)

### R8 — Feature logic stays in feature folders
Notification system is generic. Feature-specific notification calls go in the feature's mutations.

### R9 — Use `useAppRouter()` — never hardcode locale in paths
```ts
const { push } = useAppRouter();
push("/dashboard/connections"); // → auto prefixes /en/
```

### R10 — sendNotification / logActivity — never pass orgId/userId manually
Auto-injected from `ctx`. Use `to:` for recipient, `vars:` for template variables.

### R11 — Every module folder must have `index.ts`
Single public export point. External code imports from `@/core/entities` not deep paths.

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

### Tables: `camelCase`, plural. Indexes: `by_[field1]_and_[field2]`.
### Hooks: `use[Entity]s` (list), `use[Entity]` (single), `use[Entity]Mutations` (writes).
### Permissions: `[module].[action]` (e.g. `leads.create`, `org.manage`).

---

## TypeScript Rules

- Use `Doc<"tableName">` for document types, `Id<"tableName">` for ID types
- Use `QueryCtx`, `MutationCtx`, `ActionCtx` — never `any`
- All Convex functions must have argument validators — no exceptions

---

## Build Order for Every Slice (follow exactly)

1. Tables + indexes → `convex/[name]/`
2. Constants → `convex/_shared/constants.ts`
3. Queries → `convex/[name]/queries.ts`
4. Mutations → `convex/[name]/mutations.ts` (include `logActivity` + notification)
5. Frontend types → `core/[name]/types.ts` or `features/[name]/types.ts`
6. Frontend hooks → `[module]/hooks/`
7. Components → `[module]/components/` (smallest first: badge → card → list → detail → form)
8. Routes → `app/[locale]/dashboard/[orgSlug]/[name]/`
9. Register → `features/_registry.ts` (features only)

---

## Session & Workflow Rules (R13–R16, R36–R41)

### R13 — Scan Sentry before ending every session
### R14 — Use pino for ALL logging — zero console.log in production code
### R15 — When Convex schema or functions change, verify with codegen
### R16 — Every module file must document its implementation status
Use `STATUS: IMPLEMENTED`, `STATUS: NOT_STARTED`, `STATUS: PARTIAL` at top of files.

### R36 — Test after every major feature
Run `pnpm test`, `pnpm typecheck`, `pnpm lint-check` after every work block.

### R37 — Always ask before architectural or big changes
### R38 — Ask once before ending every chat
### R39 — NEVER end session without explicit user permission
### R40 — Read ALL rules before writing any code
At session start: read `rules.md` → `context.md` → `todos.md` → `checklist.md`.

### R41 — Update instruction files after every work block
Update `context.md`, `todos.md`, `checklist.md` — never leave stale.

---

## RBAC Rules (R33–R35)

### R33 — Always use `hasPermission()` or `requireRole()` — never inline checks

### R34 — Plan downgrade: NEVER delete data. Only pause via feature flags.

### R35 — Auth guards: Always call `requireRole()` at the START of the handler
Before any database reads, writes, or business logic.

---

## Architecture Rules (R53–R60)

### R53 — Core items are NEVER feature-gated
`core/` items (shell, entities, ai, settings, csv-import, kanban, datatable, timelines, notifications, onboarding, command-palette) are necessities. Always available. Only `features/` items can be gated.

### R54 — Features CAN be feature-gated
`features/` items (ai-automation, PM, Portal, Integrations, Industry Templates) CAN be gated via `ModuleGuard` + `requirePlanFeature()`.

### R55 — All entities MUST use the 4 shared scaffolds
`EntityListPage`, `EntityDetailPage`, `EntityFormDialog`, `EntityCard`. No custom pages from scratch.

### R56 — Settings pages MUST check role BEFORE rendering
All settings pages live in `core/settings/`. Every page MUST wrap content in `<PermissionGate permission="...">`. Admin-only pages (pipelines, fields, tags) must never render for member/viewer roles. Settings is core infrastructure — it is NEVER plan-gated, only role-gated.

### R57 — Unified Timeline renders RBAC-filtered

### R58 — Activity Chat: people + AI on-behalf messages ONLY

### R59 — AI tools centralized in convex/ai/tools/

### R60 — Entity slots 5 & 6 use the SAME scaffolds

---

## Global Never-Do List

- ❌ No `console.log` in production code
- ❌ No `any` types
- ❌ No `.collect()` on large tables
- ❌ No inline status/role literals — use shared validators
- ❌ No hardcoded locale in paths
- ❌ No direct AI API calls outside `convex/ai/processChat.ts`
- ❌ No raw `query`/`mutation` for protected routes
- ❌ No zustand for server data
- ❌ No passing auth data as function arguments
- ❌ No `npm` or `yarn` — always `pnpm`
- ❌ No unbounded arrays in documents

---

## Acceptance Criteria (every slice)

- [ ] No browser console errors or warnings
- [ ] Data scoped to org — wrong org cannot read
- [ ] Wrong role redirects correctly
- [ ] Disabled module → route redirects, sidebar item disappears
- [ ] `logActivity` called after every mutation
- [ ] Notification created where relevant
- [ ] Loading skeleton while query pending
- [ ] Empty state renders correctly
- [ ] Renders without overflow at 390px viewport
- [ ] `pnpm build` exits zero errors
- [ ] No Biome lint errors

---

## Cross-Module Integration Rules

> When building ANY module, follow these rules when touching shared systems.

### When using Notifications
- Call `sendNotification(ctx, { templateKey, to, vars, entityType, entityId })` — never pass `orgId`/`userId`
- Templates live in `convex/[module]/notifications.ts` — not the global template file
- Register templates at the top of `mutations.ts`

### When using Activity Logs
- Call `logActivity(ctx, { action, entityType, entityId, description })` — `orgId`/`userId` auto-injected
- Every mutation that changes user-visible data MUST log
- Use `actorType: "ai"` when logged from AI tool handlers

### When using Dynamic Fields
- Load with `useDynamicFields(entityType)` — returns field definitions + values
- Render with `<DynamicFieldRenderer fields={fields} values={values} />`
- Admin creates fields in Settings → Fields page — never hardcode field definitions

### When using Pipelines
- Load with `usePipeline(entityType)` — returns stages
- Never hardcode stage names or IDs
- Validate stage transitions server-side before executing

### When using the AI System
- AI tools are in `convex/ai/tools/` — never create AI tools in your module
- If your module needs AI awareness, add field definitions to `buildSystemPrompt()`
- Destructive operations triggered by AI MUST use `ChatConfirmation` component
- AI on-behalf messages use `senderType: "ai_on_behalf"` + `onBehalfOf: userId`

### When using Tags
- Tags are org-wide — shared across entities
- Use `useTags()` hook → `<TagPicker>` component
- Tags are created/managed in Settings → Tags page

---

## Module Rule Files (read these when working on specific modules)

| Module | Location | MODULE.md |
|---|---|---|
| Shell | `core/shell/` | `core/shell/MODULE.md` |
| Entities (all 6) | `core/entities/` | `core/entities/MODULE.md` |
| AI Assistant | `core/ai/` | `core/ai/MODULE.md` |
| Settings | `core/settings/` | `core/settings/MODULE.md` |
| CSV Import | `core/csv-import/` | `core/csv-import/MODULE.md` |
| Timelines | `core/timelines/` | `core/timelines/MODULE.md` |
| Kanban | `core/kanban/` | `core/kanban/MODULE.md` |
| DataTable | `core/datatable/` | `core/datatable/MODULE.md` |
| Onboarding | `core/onboarding/` | `core/onboarding/MODULE.md` |
| AI Automation | `features/ai-automation/` | `features/ai-automation/MODULE.md` |
| Project Management | `features/project-management/` | `features/project-management/MODULE.md` |
| Client Portal | `features/client-portal/` | `features/client-portal/MODULE.md` |
| Integrations | `features/integrations/` | `features/integrations/MODULE.md` |
| Industry Templates | `features/industry-templates/` | `features/industry-templates/MODULE.md` |

> **AI agents**: Read global rules.md ONCE at session start. Then read ONLY the MODULE.md for the module you're working on. Do NOT re-read all MODULE.md files.
