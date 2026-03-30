# Build Context — Current State

> OVERWRITE this file at end of every session. Never create a new context file.
> Last Updated: 2026-03-29 | By: Base Agent (Session 6)

---

## Current Phase: 0 — Foundation (NEAR COMPLETE)

**Goal**: Get the base infrastructure running so any feature can be built on top.

**Phase 0 complete when**:
- Base Convex tables exist and deploy without errors ✅
- Auth: user can sign in and be identified ✅ (Password, GitHub, Google all configured)
- Dashboard shell renders with sidebar + navbar — **SKIPPED** (user will design UI)
- `pnpm typecheck` passes ✅
- `pnpm test` passes ✅ (82 passing, 1 skipped)
- `pnpm build` passes ✅ (0 errors, verified Session 7)
- `pnpm lint-check` — 0 errors in our code ✅ (3 in generated/vendor files only)

---

## What's Been Done So Far

### Session 7 — PostHog Build Fix ✅

**Fixed:**
- `components/providers/PostHogProvider.tsx` — removed `"use client"` (PostHogProvider from @posthog/next is a React Server Component; the client bundle doesn't export it, causing the build error). Added full `clientOptions` (capture_exceptions, debug, defaults).
- `instrumentation-client.ts` — removed posthog-js double-init; @posthog/next handles init via `ClientPostHogProvider`. Kept Sentry router transition export.
- `proxy.ts` → renamed to `middleware.ts` — Next.js only picks up middleware from `middleware.ts`; auth redirects were silently not running.
- `middleware.ts` — rewrote protection pattern from `isProtectedRoute` → `isPublicRoute` (default-deny). Fixed: (1) redirect loop caused by `/:locale` matching `/signin`; (2) PostHog 404s by excluding `/ingest/` from matcher so intlMiddleware doesn't locale-prefix PostHog requests before rewrites run.
- `context.md` — removed "OAuth buttons require real credentials" (creds confirmed set), added PostHog cookie seeding note.
- `AGENT.md` + `rules.md` — added R22 (ask before architectural changes), R23 (ask once before ending session).

**Verified:** `pnpm typecheck` ✅ | `pnpm test` 82 passed ✅ | `pnpm build` 0 errors ✅

**Installed:**
- `vite@8.0.3` — devDep for `vite/client` type definitions (fixes `import.meta.glob` TS errors)
- `@posthog/next@0.1.0` — official PostHog Next.js package
- **16 shadcn components via CLI**: card, input, dialog, badge, skeleton, table, tabs, sonner, label, separator, dropdown-menu, avatar, sheet, tooltip, scroll-area (+ existing button)

**Created:**
- `components/providers/ThemeProvider.tsx` — next-themes wrapper
- `components/providers/PostHogProvider.tsx` — @posthog/next wrapper with pageview tracking
- `lib/hooks/useAppRouter.ts` — locale-aware router hook (R9)
- `convex/_shared/types.ts` — shared TypeScript types
- `features/_registry.ts` — feature module registry
- `features/orgs/hooks/useOrgPermission.ts` — React permission hook
- `components/rbac/PermissionGate.tsx` — declarative permission gate
- `app/[locale]/signup/page.tsx` — signup route

**Updated:**
- `app/[locale]/layout.tsx` — all providers wired: PostHog → Theme → Convex → NextIntl → Tooltip + Toaster
- `convex/_shared/permissions.ts` — `org.viewFeatureFlags` = `[]` (super_admin only)
- `.github/agents/base/rules.md` — R19, R20, R21 added
- `.github/agents/base/rbac.md` — feature flags row updated
- `.github/agents/base/schema.md` — replaced duplicated code with file links
- `.github/agents/base/todos.md` — removed all duplicate sections

**Verified:** `pnpm test` 82 passed ✅ | `pnpm typecheck` 0 errors ✅ | `pnpm biome lint` 0 errors in our code ✅

### Sessions 1–5 Summary ✅
- All Convex base tables deployed
- Full RBAC system (permissions.ts, superAdmin guards, 21 permission tests)
- Auth (Password + GitHub + Google OAuth)
- Custom authenticated function builders
- Users module (26 tests) + Orgs module (25 tests)
- Notifications + ActivityLogs helpers
- All 8 MCPs connected
- vitest + convex-test setup

---

## Architecture Decisions

| Decision | Rationale |
|---|---|
| Convex as sole database | Real-time subscriptions, schema enforcement, file storage |
| Custom authenticated functions | Auto-injects user+org context, eliminates boilerplate |
| Separate `users` table from auth | Auth managed by @convex-dev/auth; `users` = app data |
| Org-based multi-tenancy | Every row has `orgId`; B2B from day one |
| `useAppRouter()` for routing | Never hardcode locale in paths (R9) |
| Zustand = UI state only | Convex handles all server state (R12) |
| Feature modules = vertical slices | Add/remove without touching base code |
| @posthog/next over posthog-js | Official Next.js package with SSR bootstrapFlags |
| Feature flags invisible to org | Only super_admin manages flags |

---

## What's Next

### Phase 0 — Remaining
- **P0-18**: Dashboard shell — **USER WILL DESIGN** (layout, sidebar, navbar)
- **P0-20**: Verify Sentry + PostHog working in browser

### Phase 1 — Connections & Orgs UI
1. `connectionParticipants` table + client/partner roles schema
2. Onboarding flow (create org after signup)
3. Org switcher, Members list, Profile settings, Org settings

---

## Known Issues

- Pre-existing next-intl TS error (not our code)
- 3 lint warnings in generated/vendor files (not actionable)
- PostHog cookie seeding note: `bootstrapFlags` reads `ph_<key>_posthog` cookie seeded by PostHog middleware. Our middleware.ts uses Convex Auth + next-intl only; PostHog identity cookie isn't seeded. Flags bootstrap degrades gracefully (client fetches on first load). To fix later: compose postHogMiddleware into middleware.ts.

---

## Session History

| Session | What Was Built |
|---|---|
| 1 | Agent base created. Docs documented. |
| 2 | Base Convex schema. All tables deployed. |
| 3 | MCPs connected. OAuth. Signin page. Convex modules (users, orgs). |
| 4 | Auth audit. JSDoc. vitest. 59 tests. |
| 5 | Full RBAC. permissions.ts. 82 tests. |
| 7 | PostHog build fix (remove "use client" from PostHogProvider, RSC pattern). Removed double posthog-js init from instrumentation-client.ts. Renamed proxy.ts → middleware.ts (auth redirects now active). Removed OAuth placeholder from Known Issues. |
