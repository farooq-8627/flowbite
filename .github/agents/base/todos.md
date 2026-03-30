# Active Todos

> OVERWRITE this file — never append. Status: `pending` | `in_progress` | `done` | `blocked`
> Updated: 2026-03-29 | Phase: 0 — Foundation (Session 6)

---

## Done (Phase 0 — Foundation)

| ID | Task | Status |
|---|---|---|
| P0-01 | Clean demo files (delete `myFunctions.ts`, `numbers` table) | **done** ✅ |
| P0-02 | `convex/_shared/validators.ts` | **done** ✅ |
| P0-03 | `convex/_shared/constants.ts` | **done** ✅ |
| P0-05 | `convex/_shared/errors.ts` | **done** ✅ |
| P0-06 | Base schema tables in `convex/schema.ts` | **done** ✅ |
| P0-07 | `convex/_functions/authenticated.ts` | **done** ✅ |
| P0-09 | `convex/users/` module (queries, mutations, helpers) | **done** ✅ |
| P0-10 | `convex/orgs/` module (queries, mutations, helpers) | **done** ✅ |
| P0-11 | `convex/notifications/helpers.ts` | **done** ✅ |
| P0-12 | `convex/activityLogs/helpers.ts` | **done** ✅ |
| AUTH-01 | GitHub OAuth provider | **done** ✅ |
| AUTH-02 | Google OAuth provider | **done** ✅ |
| AUTH-03 | Signin page with providers | **done** ✅ |
| AUTH-04 | Set OAuth env vars | **done** ✅ |
| RBAC-01–14 | Full RBAC system (permissions.ts, superAdmin, 82 tests) | **done** ✅ |
| AUDIT-01–07 | R2 violations fixed, JSDoc added to all modules | **done** ✅ |
| TEST-01–07 | vitest + convex-test setup, 82 tests passing | **done** ✅ |

---

## Phase 0 — Remaining

| ID | Task | Status | Files |
|---|---|---|---|
| P0-04 | Create `convex/_shared/types.ts` | pending | `convex/_shared/types.ts` |
| P0-08 | Create `convex/_functions/admin.ts` | pending | `convex/_functions/admin.ts` |
| P0-13 | `lib/hooks/useAppRouter.ts` | pending | `lib/hooks/useAppRouter.ts` |
| P0-14 | Add shadcn components via CLI | **done** ✅ | `components/ui/*.tsx` |
| P0-15 | Create providers (PostHog, Theme) | pending | `components/providers/*.tsx` |
| P0-16 | Update root layout with all providers | pending | `app/[locale]/layout.tsx` |
| P0-17 | Create `features/_registry.ts` | pending | `features/_registry.ts` |
| P0-18 | Dashboard shell (layout + sidebar + navbar) | **skipped** — user will design | — |
| P0-19 | Auth pages (signup page) | pending | `app/[locale]/signup/` |
| P0-RBAC-A | `useOrgPermission(permission)` React hook | pending | `features/orgs/hooks/useOrgPermission.ts` |
| P0-RBAC-B | `<PermissionGate permission="...">` component | pending | `components/rbac/PermissionGate.tsx` |
| P0-20 | Verify Sentry + PostHog | pending | instrumentation |
| P0-21 | `pnpm typecheck` passes | pending | — |
| P0-22 | `pnpm lint-check` passes | pending | — |

---

## Blocked

| ID | Task | Blocker |
|---|---|---|
| AUTH-05 | Activate GitHub OAuth | Need real OAuth app credentials |
| AUTH-06 | Activate Google OAuth | Need real OAuth app credentials |

---

## Discovered (during build)

- Pre-existing `.next/dev/types/validator.ts` TS error from next-intl (not our code)
- `vite` added as devDependency for `vite/client` type definitions in test files
