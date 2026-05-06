# Active Todos

> OVERWRITE this file — never append.
> Status: `pending` | `in_progress` | `done` | `blocked`
> Updated: 2026-05-07

---

## Phase 0 — Foundation ✅ COMPLETE

All done: Auth (Password, GitHub, Google), RBAC (102 tests), invitations, 16 shadcn components, PostHog + Sentry, PermissionGate, features/_registry.ts, theme presets, preferences library, Zustand store, all MODULE.md files.

---

## Phase 0 — Remaining (Small Items)

| ID | Task | Status | Notes |
|---|---|---|---|
| DX-01 | Fix `pnpm lint-check` Biome baseline | pending | `biome lint --check .` invalid for installed Biome v2 |

---

## Shell — Current State ✅ MOSTLY COMPLETE

| ID | Task | Status | Notes |
|---|---|---|---|
| SHELL-01 | `core/shell/config/navigation.ts` | ✅ done | Dynamic, workspace-driven. buildNavigation() + resolveModuleType() |
| SHELL-02 | `app/[locale]/[orgSlug]/dashboard/layout.tsx` | ✅ done | ErrorBoundary + OnboardingGuard + DashboardLayout |
| SHELL-03 | `core/shell/layouts/DashboardLayout.tsx` | ✅ done | Server component, reads cookies for preferences |
| SHELL-04 | `core/shell/layouts/DashboardLayoutClient.tsx` | ✅ done | Sidebar + TopNav + SearchDialog + AI chat panel. Gap fix: !p-0 |
| SHELL-05 | `core/shell/components/sidebar/app-sidebar.tsx` | ✅ done | Compact padding, WorkspaceSwitcher in header, SidebarSupportCard + NavUser in footer |
| SHELL-06 | `core/shell/components/TopNav.tsx` | ✅ done | Search (⌘J) + Bell + ThemeSwitcher + AI toggle (⌘.) |
| SHELL-07 | `core/shell/components/sidebar/nav-user.tsx` | ✅ done | Compact (h-5 avatar, text-xs), lowercase email, Settings in dropdown |
| SHELL-08 | `core/shell/components/sidebar/theme-switcher.tsx` | ✅ done | Button variant used in TopNav |
| SHELL-09 | `core/shell/components/ModuleGuard.tsx` | ✅ done | Module access gating |
| SHELL-10 | `components/scripts/theme-boot.tsx` | ✅ done | FOUC prevention |
| SHELL-11 | Root layout font fix | ✅ done | Uses .variable classes + ThemeBootScript |
| SHELL-12 | Auth guard | ✅ done | middleware.ts handles globally |
| SHELL-13 | Onboarding guard | ✅ done | OnboardingGuard client component in dashboard layout |
| SHELL-14 | `core/shell/components/sidebar/workspace-switcher.tsx` | ✅ done | Org list + platformOrgId + create/join/logout |
| SHELL-15 | Dashboard home page | pending | Get Started card + metrics |
| SHELL-16 | Delete dead code | pending | nav-main, nav-documents, nav-secondary, layout-controls, account-switcher, sidebar-support-card, data/users.ts, navigation/sidebar/ |

---

## Auth — Current State ✅ COMPLETE

| ID | Task | Status | Notes |
|---|---|---|---|
| AUTH-01 | SignInPage | ✅ done | Email/password + OAuth. toast.authError(). Forgot password link. |
| AUTH-02 | SignUpPage | ✅ done | Email/password + OAuth. Password mismatch check. toast.authError() |
| AUTH-03 | AuthShellLayout | ✅ done | Split-screen. Panel uses rounded-[calc(var(--radius)*3)] |
| AUTH-04 | Toast error mapping | ✅ done | lib/toast.ts maps Convex codes → human-readable |
| AUTH-05 | Email verification | ✅ done | /verify-email?email=... — Convex Auth flow: email-verification + resend-verification |
| AUTH-06 | Password reset | ✅ done | /forgot-password → /reset-password?email=... — Convex Auth flow: reset + reset-verification |
| AUTH-07 | Join-org flow | ✅ done | /join (enter token) + /join/[token] (accept). Full backend + UI. |

---

## Onboarding — Current State

| ID | Task | Status | Notes |
|---|---|---|---|
| ONBOARD-01 | OnboardingPage 3-step wizard | ✅ done | Workspace → Industry → Complete |
| ONBOARD-02 | Toast error handling | ✅ done | All mutations use toast.mutationError() |
| ONBOARD-03 | Seed default pipeline on industry selection | pending | Pipeline seeding mutations not built |
| ONBOARD-04 | Resume from last step | pending | Read org.onboardingStep on mount |
| ONBOARD-05 | Guard: redirect completed users away from /onboarding | pending | |
| ONBOARD-06 | Product tour (onborda) | pending | Plan documented in MODULE.md. Build after dashboard home page. |

---

## RBAC Refactor ✅ COMPLETE

| ID | Task | Status | Notes |
|---|---|---|---|
| RBAC-01 | `orgRoles` table in schema | ✅ done | name, permissions[], isSystem, isDefault, color |
| RBAC-02 | `orgMembers.roleId` field added | ✅ done | Optional during migration, will become required |
| RBAC-03 | `convex/orgRoles/` queries + mutations | ✅ done | list, get, create, update, remove |
| RBAC-04 | Seed 3 default roles on org creation | ✅ done | Owner(isSystem), Admin(isSystem), Member(isSystem, isDefault) |
| RBAC-05 | `requirePermission()` DB lookup | ✅ done | _shared/permissions.ts — DB lookup with legacy fallback |
| RBAC-06 | Update `invitations/mutations.ts` — accept uses `roleId` | pending | Currently uses legacy role string |
| RBAC-07 | Update `useOrgPermission` hook — load from DB | pending | |
| RBAC-08 | Update all 102 tests | pending | Tests still use legacy role string |

---

## CRM Structure

| ID | Task | Status | Notes |
|---|---|---|---|
| CRM-01 | convex/crm/entities/ subfolder | ✅ done | leads, contacts, deals, companies, entity5, entityCodeCounters |
| CRM-02 | convex/crm/shared/ subfolder | ✅ done | notes, reminders, tags, savedViews, orbitLinks |
| CRM-03 | convex/crm/fields/ | ✅ done | fieldDefinitions, fieldValues, pipelines, dedup |
| CRM-04 | Implement leads mutations/queries | pending | Phase 2 |
| CRM-05 | Implement contacts mutations/queries | pending | Phase 2 |
| CRM-06 | Implement deals mutations/queries | pending | Phase 2 |
| CRM-07 | Implement pipeline stages as DB entities | pending | Phase 2 |

---

## Phase 1 Remaining (Before Phase 2)

| ID | Task | Priority | Notes |
|---|---|---|---|
| P1-01 | Dashboard home page | HIGH | Get Started card + metric cards |
| P1-02 | Seed default pipeline on industry selection | HIGH | Needed for CRM to work |
| P1-03 | Update invitations.accept to use roleId | MEDIUM | Assign Member role by default |
| P1-04 | Update useOrgPermission hook | MEDIUM | Load from DB instead of hardcoded map |
| P1-05 | Update 102 tests for new roleId field | MEDIUM | Tests still use legacy role string |
| P1-06 | Delete dead code from core/shell/ | LOW | nav-main, nav-documents, etc. |
| P1-07 | Product tour (onborda) | LOW | After dashboard home page |

---

## Blocked

| ID | Task | Blocker |
|---|---|---|
| All CRM UI | Phase 2 features | P1-01 (dashboard) + P1-02 (pipeline seeding) must be done first |

---

## Known Issues

- `pnpm lint-check` fails (`biome lint --check .` invalid for Biome v2)
- Dead code in sidebar folder (nav-main, nav-documents, etc.) — cleanup pending
- Old `navigation/sidebar/sidebar-items.ts` — dead, replaced by `core/shell/config/navigation.ts`
- 102 tests still use legacy `role` string — need update after RBAC-06/07
