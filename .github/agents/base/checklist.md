# Build Checklists

> Phase-by-phase. Check off as you complete items. OVERWRITE this file — do not append.
> Format: `[x]` = done, `[ ]` = pending, `[-]` = in progress
> Last Updated: 2026-03-29 | Session 6

---

## Phase 0 — Foundation (NEAR COMPLETE)

### Tooling & Config
- [x] `convex dev` running with proper project ID
- [x] Convex Auth working — test user signs in, visible in dashboard
- [x] shadcn initialized, `cn()` utility in `lib/utils.ts` ✅
- [x] 16 shadcn components installed via CLI ✅
- [ ] `next-intl` locale routing working (`[locale]` segment)
- [x] Biome check passes — 0 errors in our code ✅
- [x] TypeScript strict mode, `pnpm typecheck` passes ✅
- [x] Sentry: test error visible in Sentry dashboard
- [-] PostHog: pageview visible in PostHog dashboard (build passes; verify in browser with `pnpm dev`)

### Convex Base Infrastructure
- [x] Delete demo `numbers` table from `convex/schema.ts`
- [x] Delete `convex/myFunctions.ts` (demo file)
- [x] Create `convex/_shared/validators.ts`
- [x] Create `convex/_shared/constants.ts`
- [x] Create `convex/_shared/types.ts` ✅ NEW
- [x] Create `convex/_shared/errors.ts`
- [x] Create `convex/_shared/permissions.ts` ✅
- [x] Create `convex/_functions/authenticated.ts` (superAdminQuery/Mutation included)
- [ ] Create `convex/_functions/admin.ts` (adminQuery/Mutation)
- [x] Implement all base tables in `convex/schema.ts` (users.platformRole added)
- [x] Create `convex/users/` module (queries, mutations, helpers)
- [x] Create `convex/orgs/` module (queries, mutations, helpers, listAll)
- [x] Create `convex/notifications/helpers.ts`
- [x] Create `convex/activityLogs/helpers.ts`
- [x] vitest + convex-test setup — 82 tests passing ✅
- [x] RBAC fully implemented ✅

### RBAC Completeness
- [x] `users.platformRole` schema field
- [x] `PERMISSIONS` map (30+ entries), all utility functions
- [x] `superAdminQuery`, `superAdminMutation`, `SuperAdminCtx`
- [x] `PLAN_FEATURES`, `PLAN_LIMITS`, `FEATURE_FLAGS` constants
- [x] R16–R21 rules in rules.md
- [x] `rbac.md` master document
- [x] 21 unit tests for permissions utilities
- [x] `useOrgPermission(permission)` React hook ✅ NEW
- [x] `<PermissionGate permission="...">` component ✅ NEW
- [x] `org.viewFeatureFlags` = `[]` (super_admin only) ✅ NEW
- [ ] client/partner external roles (Phase 1 — Connections module)

### Frontend Base Infrastructure
- [x] Create `lib/hooks/useAppRouter.ts` ✅ NEW
- [x] Create `components/providers/PostHogProvider.tsx` ✅ NEW
- [x] Create `components/providers/ThemeProvider.tsx` ✅ NEW
- [x] Update `app/[locale]/layout.tsx` with all providers ✅ NEW
- [x] Create `features/_registry.ts` ✅ NEW

### Dashboard Shell — SKIPPED (user will design)
- [ ] Create `app/[locale]/dashboard/layout.tsx` (auth guard)
- [ ] Create `components/dashboard/Sidebar.tsx`
- [ ] Create `components/dashboard/Navbar.tsx`
- [ ] Create `components/dashboard/UserMenu.tsx`
- [ ] Create `components/dashboard/NotificationBell.tsx`
- [ ] Dashboard home renders without errors

### Auth Pages
- [x] `/signin` page working with Convex Auth (Password + GitHub + Google)
- [x] `/signup` page created ✅ NEW
- [ ] Unauthenticated user → redirected to signin
- [ ] Authenticated user → redirected to dashboard

---

## Phase 1 — Connections & Orgs UI (PENDING)

- [ ] `connectionParticipants` table + client/partner RBAC schema
- [ ] User onboarding flow (create org, invite members)
- [ ] Org switcher in sidebar
- [ ] Members page (invite, list, change roles)
- [ ] Profile settings page
- [ ] Org settings page
- [ ] Role-based redirect on login

---

## Phase 2 — Notifications & Activity (PENDING)

- [ ] Notification bell with unread count
- [ ] Notification list (mark read, archive)
- [ ] Activity log display in entity detail pages
- [ ] Email notification (Resend integration)
- [ ] Trigger.dev task for email sending

---

## Phase 3 — Work Items (PENDING)

- [ ] Work items table + indexes
- [ ] CRUD operations
- [ ] Status transitions
- [ ] Assignment
- [ ] List + detail pages

---

## Phase 4 — Workflows (PENDING)

- [ ] Workflow config table
- [ ] State machine engine
- [ ] Transition rules + validation
- [ ] Workflow editor UI

---

## Phase 5 — Approvals (PENDING)

- [ ] Approval requests table
- [ ] Inbox view
- [ ] Resolution flow
- [ ] Email notifications via Trigger.dev

---

## Phase 6 — Connections + Messaging (PENDING — Demo-ready milestone)

- [ ] Connections table + indexes
- [ ] Connection CRUD
- [ ] Connection kanban view
- [ ] Messaging (real-time chat via Convex subscriptions)
- [ ] Demo-ready: end-to-end flow working

---

## Phase 7 — Dynamic Forms (PENDING)

- [ ] Form config table
- [ ] Form builder UI
- [ ] DynamicForm renderer
- [ ] Zod schema builder from config

---

## Phase 8 — Settings + Billing (PENDING)

- [ ] Workspace settings
- [ ] Module toggles
- [ ] Stripe integration
- [ ] Billing page (plan, usage, upgrade)

---

## Phase 9 — Reports + Commissions (PENDING)

- [ ] Reports dashboard
- [ ] Commission calculation via Trigger.dev
- [ ] Export to CSV

---

## Phase 10 — Polish (PENDING)

- [ ] Mobile responsive (390px viewport)
- [ ] Arabic RTL layout
- [ ] Lighthouse performance pass
- [x] `pnpm build` zero errors ✅
