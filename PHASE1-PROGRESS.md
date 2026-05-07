# Orbitly — Phase 1 Progress
> Updated: 2026-05-07  
> Status: **✅ COMPLETE**  
> TypeScript: 0 errors | Tests: 102 passing

---

## Phase 1 is Complete

All items from the original analysis have been addressed. Phase 2 can start.

---

## What Was Completed This Session

| Item | Status |
|---|---|
| `entityCodeCounters` table in schema | ✅ |
| `orbitLinks` table in schema | ✅ |
| `platformTemplates` table in schema | ✅ |
| `convex/_shared/recordCodes.ts` — generatePersonCode, generateEntityCode | ✅ |
| `convex/notifications/queries.ts` — listMine, getSummary | ✅ |
| `convex/notifications/mutations.ts` — markRead, markAllRead | ✅ |
| `convex/featureFlags/queries.ts` — getForOrg | ✅ |
| `core/shell/hooks/useModuleEnabled.ts` — wired to real query | ✅ |
| `convex/orgs/queries.ts` — getDashboardStats | ✅ |
| Dashboard home page — Get Started card + metrics + activity | ✅ |
| Dead code removed (7 files) | ✅ |
| `vitest.convex.config.ts` — dedicated convex test config | ✅ |
| 102 tests passing | ✅ |
| `users/mutations.ts` updateProfile — accepts dismissedCards | ✅ |

---

## Full Phase 1 Inventory

### Backend (Convex) — All Complete ✅

| Module | Files | Status |
|---|---|---|
| Auth | convex/auth.ts, auth.config.ts | ✅ |
| Users | users/queries.ts, mutations.ts, helpers.ts | ✅ |
| Orgs | orgs/queries.ts (+ getDashboardStats), mutations.ts, helpers.ts | ✅ |
| OrgRoles | orgRoles/queries.ts, mutations.ts, index.ts | ✅ |
| OrgMembers | In orgs schema, dual role+roleId | ✅ |
| Invitations | invitations/queries.ts, mutations.ts (accept assigns roleId) | ✅ |
| Notifications | notifications/helpers.ts, queries.ts, mutations.ts | ✅ |
| ActivityLogs | activityLogs/helpers.ts | ✅ |
| FeatureFlags | featureFlags/queries.ts | ✅ |
| Pipelines | crm/fields/pipelines/mutations.ts (seedDefault) | ✅ |
| Permissions | _shared/permissions.ts (DB-backed requirePermission) | ✅ |
| RecordCodes | _shared/recordCodes.ts (generatePersonCode, generateEntityCode) | ✅ |

### Schema Tables — All Complete ✅

| Table | Purpose |
|---|---|
| users | App-level user profiles |
| orgs | Multi-tenant root (+ codePrefixes, aiContext) |
| orgMembers | User ↔ org mapping (roleId + legacy role) |
| orgRoles | Dynamic RBAC roles per org |
| invitations | Token-based org invitations |
| notifications | In-app notifications |
| activityLogs | Audit trail (actorType: user/ai/integration/system) |
| featureFlags | Kill-switch / rollout flags |
| pipelines | Deal pipelines with inline stages |
| entityCodeCounters | Per-org, per-type atomic counters for record codes |
| orbitLinks | Lateral connections between entities |
| platformTemplates | Industry templates in DB |

### Frontend — All Complete ✅

| Area | Files |
|---|---|
| Auth | core/auth/components/ (6 pages) + AuthShellLayout |
| Onboarding | core/onboarding/ (wizard + 3 steps + guard) |
| Shell | DashboardLayout, DashboardLayoutClient, AppSidebar, TopNav, WorkspaceSwitcher, NavUser, ModuleGuard |
| Dashboard | app/[locale]/[orgSlug]/dashboard/page.tsx |
| Hooks | useModuleEnabled, useViewToggle, useOrgPermission |
| RBAC | PermissionGate (accepts orgId), useOrgPermission (DB-backed) |

---

## Deferred to Phase 3+

| Item | Reason |
|---|---|
| Route group `(private)/` restructure | middleware.ts works; restructure with landing page |
| `platformOrgIdCounter` (sequential ORB-001) | Current ORB-XXXXX works; switch in Phase 4 |
| Record code prefix rename background job | Needed for Settings → Record Codes page |
| PostHog events | Add alongside Phase 2 CRM events |
| E2E Playwright tests | Add in Phase 2 |

---

## Phase 2 Starting Point

The architecture is ready. Every Phase 2 mutation should follow:

```
requirePermission() → dedup → generatePersonCode/EntityCode() → db.insert() 
→ createOrbitLinks() → logActivity() → sendNotification() → scheduleEntityContextRebuild()
```

Start with: `convex/crm/entities/leads/mutations.ts` + `queries.ts`
