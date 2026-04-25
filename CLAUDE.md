<!-- convex-ai-start -->
This project uses [Convex](https://convex.dev) as its backend.
When working on Convex code, **always read `convex/_generated/ai/guidelines.md` first**.
<!-- convex-ai-end -->

---

# FlowBite — Complete Project Knowledge Base
> **For Claude Code Projects.** This file is the single source of truth. Read it fully before touching any code.
> Last Synced: 2026-04-15 | Source: `.github/agents/base/` (scanned by Claude)

---

## 1. What Is FlowBite?

**FlowBite** is a **B2B SaaS base / boilerplate** built on Next.js 16 + Convex + Tailwind + Trigger.dev. It is NOT a product for end-users yet — it is the shared infrastructure layer from which multiple Gulf-region B2B SaaS products can be launched.

### Core Value Proposition
- Multi-tenant from day one (every DB row has `orgId`)
- Full RBAC system (owner/admin/member/viewer + external client/partner roles)
- Real-time backend via Convex (no REST API polling, pure subscriptions)
- Background jobs via Trigger.dev (emails, commissions, PDFs, data imports)
- Arabic RTL + English i18n via next-intl (Gulf market target)
- Modular feature system — features are vertical slices that can be added/removed

### Target Market (Gulf/MENA B2B SaaS)
- SMB and enterprise clients in Saudi Arabia, UAE, Qatar
- Typical use case: B2B workflow platform connecting an org (service provider) with external clients and partners
- Arabic-English bilingual is a key differentiator
- Pricing model: custom deployment per client (not SaaS subscription to Reimaginy)

---

## 2. Tech Stack (Exact Versions)

| Layer | Library | Version | Role |
|---|---|---|---|
| Framework | Next.js | 16.1.7 | App Router, RSC, streaming |
| Runtime | React | ^19.2.4 | UI |
| Language | TypeScript | ^5.9.3 | Strict mode |
| Backend DB | convex | ^1.33.1 | Database + reactive queries + file storage + cron |
| Auth | @convex-dev/auth | ^0.0.91 | Password + OAuth sessions |
| OAuth | @auth/core | ^0.37.4 | GitHub + Google providers |
| Helpers | convex-helpers | ^0.1.114 | customQuery/Mutation, zodToConvex, RLS |
| Jobs | @trigger.dev/sdk | 4.4.3 | Long-running tasks, email blasts, PDF gen |
| Styling | tailwindcss | ^4.2.1 | Utility CSS |
| Components | shadcn | ^4.1.1 | Accessible primitives → `components/ui/` |
| Icons | lucide-react | ^1.7.0 | Icon set |
| Toasts | sonner | ^2.0.7 | Toast notifications |
| Forms | react-hook-form | ^7.72.0 | Form state |
| Validation | zod | ^4.3.6 | Schema validation (shared client+backend) |
| State | zustand | ^5.0.12 | UI-ONLY state (never server data) |
| i18n | next-intl | ^4.8.3 | Locale routing, message bundles |
| Email | resend | ^6.9.4 | Transactional email |
| Monitoring | @sentry/nextjs | ^10.46.0 | Error tracking |
| Analytics | posthog-js + @posthog/next | ^1.364.1 / ^0.1.0 | Analytics + feature flags |
| Images | next-cloudinary | ^6.17.5 | Upload + transform |
| Logging | pino | ^10.3.1 | Structured JSON logs (NEVER console.log) |
| Linting | @biomejs/biome | ^2.4.9 | Replaces ESLint + Prettier |
| Testing | vitest + convex-test | ^4.1.2 / ^0.0.45 | Unit + Convex function tests |
| Package manager | pnpm | 10.32.1 | ALWAYS use pnpm, never npm/yarn |

---

## 3. Architecture Decisions

| Decision | Rationale |
|---|---|
| Convex as sole database | Real-time subscriptions, schema enforcement, file storage |
| Custom authenticated functions | Auto-injects user+org context, eliminates boilerplate |
| Separate `users` table from auth | `@convex-dev/auth` manages credentials; `users` = app profile data |
| Org-based multi-tenancy | Every row has `orgId`; B2B from day one |
| `useAppRouter()` for navigation | Never hardcode locale in paths |
| Zustand = UI state only | Convex handles ALL server state |
| Feature modules = vertical slices | Add/remove without touching base code |
| @posthog/next over posthog-js | Official Next.js package with SSR bootstrapFlags support |
| Feature flags invisible to orgs | Only `super_admin` manages flags — org members never see them |
| Biome over ESLint | Faster, single-tool solution for lint + format |
| pnpm only | Lockfile consistency; never npm or yarn |

---

## 4. Folder Structure (Reality, as of 2026-04-15)

```
flowbite/
├── app/
│   ├── [locale]/
│   │   ├── globals.css          ✅
│   │   ├── layout.tsx           ✅ (all providers wired)
│   │   ├── page.tsx             ✅ (landing)
│   │   ├── global-error.tsx     ✅
│   │   ├── signin/              ✅ (Password + GitHub + Google)
│   │   ├── signup/              ✅
│   │   └── dashboard/           ❌ NOT BUILT — user will design UI
│   └── api/                     ❌ (Trigger.dev + Stripe webhooks TODO)
│
├── components/
│   ├── ConvexClientProvider.tsx ✅
│   ├── ui/                      ✅ (16 shadcn components installed)
│   │   avatar, badge, button, card, dialog, dropdown-menu, input,
│   │   label, scroll-area, separator, sheet, skeleton, sonner,
│   │   table, tabs, tooltip
│   ├── providers/
│   │   ├── PostHogProvider.tsx  ✅ (RSC pattern, no "use client")
│   │   └── ThemeProvider.tsx    ✅ (next-themes)
│   └── rbac/
│       └── PermissionGate.tsx   ✅
│
├── convex/
│   ├── schema.ts                ✅ (all base tables deployed)
│   ├── auth.ts                  ✅
│   ├── auth.config.ts           ✅
│   ├── http.ts                  ✅
│   ├── _shared/
│   │   ├── validators.ts        ✅
│   │   ├── types.ts             ✅
│   │   ├── constants.ts         ✅
│   │   ├── errors.ts            ✅
│   │   └── permissions.ts       ✅ (30+ permissions, full RBAC utilities)
│   ├── _functions/
│   │   ├── authenticated.ts     ✅ (orgQuery/Mutation, superAdminQuery/Mutation)
│   │   └── admin.ts             ❌ TODO
│   ├── users/                   ✅ (queries, mutations, helpers)
│   ├── orgs/                    ✅ (queries, mutations, helpers, listAll)
│   ├── notifications/           ✅ (helpers.ts — sendNotification())
│   └── activityLogs/            ✅ (helpers.ts — logActivity())
│
├── features/
│   ├── _registry.ts             ✅
│   └── orgs/
│       └── hooks/
│           └── useOrgPermission.ts ✅
│
├── lib/
│   ├── utils.ts                 ✅
│   ├── logger.ts                ✅ (pino)
│   ├── email.ts                 ✅
│   ├── posthog-server.ts        ✅
│   ├── stores/uiStore.ts        ✅
│   └── hooks/
│       └── useAppRouter.ts      ✅
│
├── middleware.ts                ✅ (Convex Auth + next-intl, default-deny, PostHog excluded)
├── trigger/                    ✅ (example.ts only — jobs not built yet)
├── messages/en.json            ✅
└── .github/agents/base/        ✅ (full agent context — ground truth)
```

---

## 5. Database Schema (All Tables Deployed)

### Base Tables

| Table | Key Fields | Purpose |
|---|---|---|
| `users` | tokenIdentifier, email, platformRole, onboardingCompleted, defaultOrgId | App user profile (separate from auth) |
| `orgs` | name, slug, plan, stripeCustomerId | Multi-tenant root |
| `orgMembers` | orgId, userId, role, permissions, joinedAt | Role assignments per org |
| `invitations` | orgId, email, role, status, token, expiresAt | 48h TTL invite links |
| `notifications` | orgId, userId, type, title, read | In-app notification feed |
| `activityLogs` | orgId, userId, action, entityType, entityId | Audit trail |
| `featureFlags` | key, enabled, rolloutPercent, orgOverrides | Kill-switch / rollout (super_admin only) |

### Auth Tables (DO NOT TOUCH — managed by @convex-dev/auth)
`authSessions`, `authAccounts`, `authRefreshTokens`, `authVerificationCodes`, `authRateLimits`

### Schema Design Rules
1. Every row has `orgId` (except `users` and `orgs`)
2. No unbounded arrays in documents — use separate table with FK
3. Soft-delete via `deletedAt: v.optional(v.number())`
4. Timestamps: `createdAt` + `updatedAt` (epoch ms) on EVERY table
5. Indexes cover all query fields — format: `by_field1_and_field2`

### Feature Tables (NOT YET CREATED)
| Table | Phase | Status |
|---|---|---|
| `connections` | Phase 1 | TODO |
| `connectionParticipants` | Phase 1 | TODO |
| `workItems` | Phase 3 | TODO |
| `workflows` | Phase 4 | TODO |
| `approvals` | Phase 5 | TODO |
| `messages` | Phase 6 | TODO |
| `dynamicForms` | Phase 7 | TODO |
| `invoices` | Phase 10 | TODO |

---

## 6. RBAC System

### Two Levels of Roles

**Platform Roles** (on `users.platformRole`):
- `super_admin` — controls all orgs from OUTSIDE. Cannot enter/operate within any org.
- *(none)* — regular user

**Org Roles** (on `orgMembers.role`):
- `owner` — full authority, pre-approved for everything. Cannot do client/partner workflows.
- `admin` — full operational control (connections, workflows, approvals, members). No org management (billing, delete).
- `member` — assigned work, creates/updates work items, can message. No org structure changes.
- `viewer` — read-only.

**External Roles** (per-connection in `connectionParticipants` — Phase 1):
- `client` — portal access to own connections only. Submits client-side requests.
- `partner` — portal access to own connections only. Submits partner-side responses.

### Permission Utilities (all in `convex/_shared/permissions.ts`)
```ts
hasPermission(role, permission)     // boolean check
requireRole(role, permission)       // throws FORBIDDEN if not allowed
hasMinRole(role, minRole)           // hierarchy check
requireMinRole(role, minRole)       // throws if below minimum
requirePlanFeature(ctx, orgId, feature) // feature flag check
```

### Usage Pattern (MANDATORY)
```ts
// Backend — ALWAYS guard first, then logic
const { member } = await requireOrgMember(ctx, args.orgId);
requireRole(member.role, "members.remove"); // FIRST LINE after getting member

// Frontend
const can = useOrgPermission("members.remove");
if (!can) return null;
```

### Plan → Feature Mapping
```
free:        members.basic, connections.basic (max 5 connections)
starter:     members.full, connections.full, messaging.full, workflows.basic, approvals.basic
pro:         starter + workflows.full, approvals.full, reports.basic, dynamic_forms.basic, commissions.basic
enterprise:  pro + reports.full, dynamic_forms.full, commissions.full, custom_branding, api_access
```

**CRITICAL:** On plan downgrade — NEVER delete data. Only update `featureFlags.orgOverrides`. Data is preserved, inaccessible via UI. Re-upgrade restores everything immediately.

---

## 7. Build Phase Plan

### Phase 0 — Foundation (NEAR COMPLETE ✅)
**What's done:**
- All Convex base tables deployed ✅
- Auth: Password + GitHub + Google OAuth ✅
- Full RBAC system (permissions.ts, 21 permission unit tests) ✅
- Custom authenticated function builders (orgQuery/Mutation, superAdminQuery/Mutation) ✅
- Users module (26 tests) + Orgs module (25 tests) ✅
- Notifications + ActivityLogs helpers ✅
- 82 tests passing, 0 typecheck errors, 0 lint errors ✅
- 16 shadcn UI components ✅
- PostHogProvider (RSC pattern), ThemeProvider ✅
- Providers wired in layout.tsx ✅
- useAppRouter hook ✅
- features/_registry.ts ✅
- PermissionGate component ✅
- useOrgPermission hook ✅
- Signup page ✅
- middleware.ts fixed (default-deny, auth redirects active) ✅
- pnpm build — 0 errors ✅

**Still pending in Phase 0:**
- `convex/_functions/admin.ts` (adminQuery/Mutation) — low priority
- Dashboard shell (layout + sidebar + navbar) — **USER WILL DESIGN**
- Verify Sentry + PostHog working in browser (build passes, not yet browser-verified)
- Unauthenticated user → redirect to signin (middleware working, needs E2E check)

### Phase 1 — Connections & Orgs UI (NEXT)
1. `connectionParticipants` table + client/partner RBAC schema
2. User onboarding flow (create org after signup)
3. Org switcher in sidebar
4. Members page (invite, list, change roles)
5. Profile settings page
6. Org settings page

### Phase 2 — Notifications & Activity
- Notification bell with unread count
- Notification list (mark read, archive)
- Activity log display
- Email via Resend + Trigger.dev

### Phase 3 — Work Items
- CRUD, status transitions, assignment, list + detail pages

### Phase 4 — Workflows
- State machine engine, workflow config, transition rules, editor UI

### Phase 5 — Approvals
- Approval requests, inbox, resolution, email notifications

### Phase 6 — Connections + Messaging (Demo-Ready Milestone)
- Connections CRUD + kanban view
- Real-time messaging via Convex subscriptions

### Phase 7 — Dynamic Forms
- JSON schema → Zod → react-hook-form renderer, form builder UI

### Phase 8 — Settings + Billing
- Workspace settings, module toggles, Stripe integration

### Phase 9 — Reports + Commissions
- Dashboard, commission calc via Trigger.dev, CSV export

### Phase 10 — Polish
- Mobile 390px responsive, Arabic RTL, Lighthouse pass

---

## 8. Non-Negotiable Coding Rules

### Never Do
- ❌ Write code from AI training data memory — always fetch a live source first
- ❌ Use raw `query`/`mutation` for protected functions — use `orgQuery`, `orgMutation`, `superAdminQuery`
- ❌ Accept `userId`/`orgId` as auth arguments — derive from `ctx`
- ❌ Use `.filter()` in Convex queries — use `.withIndex()`
- ❌ Use `.collect()` on unbounded tables — use `.take(n)` or paginate
- ❌ Use `console.log` in production — use `lib/logger.ts` (pino)
- ❌ Use `any` types
- ❌ Hardcode locale in paths — use `useAppRouter()`
- ❌ Use zustand for server/fetched data
- ❌ Use `npm` or `yarn` — always `pnpm`
- ❌ Delete data on plan downgrade — use feature flags

### Always Do
- ✅ Call `requireRole()` as FIRST line after `requireOrgMember()` — before any DB reads
- ✅ Call `logActivity()` after every mutation
- ✅ Call `sendNotification()` where relevant
- ✅ Update `updatedAt: Date.now()` in every mutation patch
- ✅ Use `Doc<"tableName">` and `Id<"tableName">` for types — never `string`
- ✅ Run `pnpm typecheck` + `pnpm lint-check` + `pnpm test` after significant changes
- ✅ Build order: tables → constants → queries → mutations → frontend types → hooks → components → routes → registry

### Build Order for Every Feature Slice
1. Tables + indexes → `convex/[name]/tables.ts`
2. Constants → `convex/_shared/constants.ts`
3. Queries → `convex/[name]/queries.ts`
4. Mutations → `convex/[name]/mutations.ts` (include logActivity + notification)
5. Backend index → `convex/[name]/index.ts`
6. Frontend types → `features/[name]/types.ts`
7. Frontend hooks → `features/[name]/hooks/`
8. Components → `features/[name]/components/` (badge → card → list → detail → form)
9. Routes → `app/[locale]/dashboard/[name]/`
10. Register → `features/_registry.ts`

---

## 9. Key Files — Ground Truth Locations

| What | File |
|---|---|
| Full agent instructions | `.github/agents/base/AGENT.md` |
| Current build state | `.github/agents/base/context.md` |
| Active todos | `.github/agents/base/todos.md` |
| Phase checklists | `.github/agents/base/checklist.md` |
| All coding rules | `.github/agents/base/rules.md` |
| RBAC full reference | `.github/agents/base/rbac.md` |
| Schema design | `.github/agents/base/schema.md` |
| Tech stack | `.github/agents/base/tech-stack.md` |
| Folder structure target | `.github/agents/base/folder-structure.md` |
| Convex schema | `convex/schema.ts` |
| Permissions | `convex/_shared/permissions.ts` |
| Authenticated functions | `convex/_functions/authenticated.ts` |

---

## 10. Known Issues

- Pre-existing next-intl TS error in `.next/dev/types/validator.ts` — not our code, not actionable
- 3 lint warnings in generated/vendor files only — not in our code
- PostHog `bootstrapFlags` degrades gracefully: middleware doesn't seed PostHog cookie yet. Fix: compose postHogMiddleware into middleware.ts (deferred)
- Dashboard shell not built — user is designing it (no timeline)
- `convex/_functions/admin.ts` missing — low priority

---

## 11. Commands Reference

```bash
pnpm dev              # runs Next.js + Convex concurrently
pnpm build            # Next.js production build (must be 0 errors)
pnpm typecheck        # tsc --noEmit (must be 0 errors)
pnpm lint-check       # biome lint (0 errors in our code)
pnpm test             # vitest (82 passing, 1 skipped)
pnpm format           # biome format --write
```

---

## 12. Session Protocol

Before writing ANY code:
1. Read `.github/agents/base/context.md` — current build state
2. Read `.github/agents/base/todos.md` — what's pending
3. Read `.github/agents/base/checklist.md` — active phase checklist
4. **Ask before any architectural change**, file rename/move/delete, or auth/middleware/routing change
5. After completing work: update `context.md`, `todos.md`, `checklist.md`
6. Run `pnpm typecheck` + `pnpm test` + `pnpm lint-check` before ending

**Approval required before:** changing middleware, renaming files, restructuring folders, choosing between multiple valid approaches.
**If stuck:** Do NOT retry more than once. Ask the user with options.

---

## 13. What Is NOT Built Yet (Quick Reference)

- Dashboard UI (sidebar, navbar, layout) — 0% built
- Onboarding flow — 0%
- All feature modules (Connections, WorkItems, Workflows, Approvals, Messaging, Forms, Billing, Reports) — 0%
- admin.ts (adminQuery/Mutation functions) — 0%
- Stripe integration — 0%
- Arabic RTL translations (`messages/ar.json`) — 0%
- Mobile responsive pass — 0%
- Trigger.dev jobs (emails, PDFs, commissions) — SDK installed, no jobs built
- Sentry browser verification — pending
- PostHog browser verification — pending

---

<!-- code-review-graph MCP tools -->
## MCP Tools: code-review-graph

Use BEFORE Grep/Glob/Read. The graph gives structural context (callers, dependents, test coverage).

| Tool | Use when |
|------|----------|
| `detect_changes` | Reviewing code changes |
| `get_review_context` | Need source snippets |
| `get_impact_radius` | Blast radius of a change |
| `query_graph` | Tracing callers/callees/imports/tests |
| `semantic_search_nodes` | Find functions by name/keyword |
| `get_architecture_overview` | High-level structure |
