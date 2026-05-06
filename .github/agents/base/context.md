# Build Context — Current State

> OVERWRITE this file at end of every session. Never create a new context file.
> Last Updated: 2026-05-07

---

## Current Phase: 1 — Shell + RBAC Refactor (MOSTLY COMPLETE)

**Phase 0: ✅ COMPLETE** — Auth, RBAC (102 tests), invitations, preferences, theme presets, Zustand store.
**Shell: 95% DONE** — Layout, sidebar, TopNav, WorkspaceSwitcher, all auth flows, RBAC refactor done. Missing: dashboard home page, dead code cleanup.
**RBAC Refactor: 80% DONE** — Schema, orgRoles CRUD, seeding, requirePermission() DB lookup done. Missing: update tests, update invitations.accept, update useOrgPermission hook.

---

## Architecture State

| Layer | Status |
|---|---|
| Root layout + fonts + ThemeBootScript | ✅ Working (zero FOUC) |
| `core/shell/config/navigation.ts` | ✅ Dynamic, workspace-driven |
| `core/shell/layouts/` | ✅ DashboardLayout + DashboardLayoutClient |
| `core/shell/components/TopNav.tsx` | ✅ Search (⌘J) + Bell + ThemeSwitcher + AI toggle |
| `core/shell/components/sidebar/app-sidebar.tsx` | ✅ Compact padding, WorkspaceSwitcher in header |
| `core/shell/components/sidebar/workspace-switcher.tsx` | ✅ Org list + platformOrgId + create/join/logout |
| `core/shell/components/sidebar/nav-user.tsx` | ✅ Compact, lowercase email, Settings in dropdown |
| `core/shell/components/ModuleGuard.tsx` | ✅ Module access gating |
| `components/scripts/theme-boot.tsx` | ✅ FOUC prevention |
| `convex/schema.ts` | ✅ orgRoles + updated users/orgs/orgMembers |
| `convex/orgRoles/` | ✅ queries (list, get) + mutations (create, update, remove) |
| `convex/_shared/permissions.ts` | ✅ requirePermission() DB lookup + legacy fallback |
| Auth flows (signin, signup, verify, reset, join) | ✅ All built |
| Dashboard home page | ⬜ Pending |
| Dead code cleanup | ⬜ Pending |
| Update 102 tests for roleId | ⬜ Pending |

---

## Key Design Decisions (This Session)

1. **WorkspaceSwitcher**: Logo click opens dropdown. Shows `org.platformOrgId` (e.g. `ORB-XXXXX`) under org name so users can share their org ID. Create workspace → `/onboarding`. Join workspace → `/join`.

2. **Sidebar Padding**: `SidebarHeader/Footer className="px-2 py-1.5"`. Groups `py-1`. All buttons `size="sm"`. NavUser avatar `h-5 w-5`, text `text-xs/[10px]`.

3. **Auth Flows**: All built using Convex Auth Password provider flows. Email verification: `flow: "email-verification"`. Password reset: `flow: "reset"` → `flow: "reset-verification"`. Join-org: `invitations.queries.getByToken` (public) + `invitations.mutations.accept`.

4. **RBAC Seeding**: `createOrg` now seeds 3 system roles (Owner/Admin/Member) and sets `orgMembers.roleId` for the owner. Member role has `isDefault: true`.

5. **requirePermission()**: DB-backed. Loads `orgRoles` doc via `member.roleId`, checks `role.permissions[]`. Falls back to legacy `role` string + PERMISSIONS map if no `roleId`.

6. **Product Tour**: Documented in `core/onboarding/MODULE.md`. Will use `onborda` library (https://github.com/uixmat/onborda). Triggers after first dashboard visit. State tracked in `users.dismissedCards["product_tour_v1"]`.

---

## What's Next (Exact Order)

1. Dashboard home page (`app/[locale]/[orgSlug]/dashboard/page.tsx`) — Get Started card + metric cards
2. Seed default pipeline on industry selection (needed for CRM)
3. Update `invitations.mutations.accept` to assign Member roleId
4. Update `useOrgPermission` hook to load from DB
5. Update 102 tests for new roleId field
6. Delete dead code from `core/shell/`
7. Product tour (onborda) — after dashboard home page

---

## `pnpm typecheck`: ✅ 0 errors
