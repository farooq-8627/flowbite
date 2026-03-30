# Database Schema — Convex Tables

> Single source of truth for schema design rules and table overview.
> For actual table definitions, see → [`convex/schema.ts`](../../convex/schema.ts)
> For shared validators, see → [`convex/_shared/validators.ts`](../../convex/_shared/validators.ts)
> For shared types, see → [`convex/_shared/types.ts`](../../convex/_shared/types.ts)
> Update this file when schema design rules change.

---

## Design Rules

1. Every row has `orgId` (except `users` and `orgs`)
2. No unbounded arrays in documents — use separate table with FK
3. Soft-delete via `deletedAt: v.optional(v.number())`
4. Timestamps: `createdAt` + `updatedAt` (epoch ms) on every table
5. Indexes include all query fields — format: `by_field1_and_field2`
6. Separate high-churn data from stable profile data

---

## Base Tables (implemented in `convex/schema.ts`)

| Table | Key Fields | Indexes | Notes |
|---|---|---|---|
| `users` | email, tokenIdentifier, platformRole, onboardingCompleted | `by_tokenIdentifier`, `by_email` | Separate from auth tables |
| `orgs` | name, slug, plan, settings, stripe IDs | `by_slug`, `by_stripeCustomerId` | Multi-tenant root |
| `orgMembers` | orgId, userId, role (owner/admin/member/viewer) | `by_orgId_and_userId`, `by_userId`, `by_orgId_and_role` | Role hierarchy: viewer < member < admin < owner |
| `invitations` | orgId, email, role, status, token, expiresAt | `by_orgId_and_email`, `by_token`, `by_orgId_and_status` | 48h TTL |
| `notifications` | orgId, userId, type, title, read | `by_userId_and_read`, `by_orgId_and_userId`, `by_userId_and_createdAt` | In-app notifications |
| `activityLogs` | orgId, userId, action, entityType, entityId | `by_orgId_and_createdAt`, `by_entityType_and_entityId`, `by_userId_and_createdAt` | Audit trail |
| `featureFlags` | key, enabled, rolloutPercent, orgOverrides | `by_key` | Kill-switch/rollout. Org members NEVER see these (super_admin only) |

## Auth Tables (managed by @convex-dev/auth — DO NOT touch)

Tables: `authSessions`, `authAccounts`, `authRefreshTokens`, `authVerificationCodes`, `authRateLimits`
Spread into schema via `...authTables`

---

## Feature Tables (added per phase)

| Table | Phase | Status |
|---|---|---|
| `connections` | Phase 1 | [TODO] |
| `connectionParticipants` | Phase 1 | [TODO] |
| `workItems` | Phase 3 | [TODO] |
| `workflows` | Phase 4 | [TODO] |
| `approvals` | Phase 5 | [TODO] |
| `messages` | Phase 6 | [TODO] |
| `dynamicForms` | Phase 7 | [TODO] |
| `invoices` | Phase 10 | [TODO] |

---

## Shared Validators → [`convex/_shared/validators.ts`](../../convex/_shared/validators.ts)

Key exports: `orgScoped`, `timestamps`, `softDelete`, `createdBy`, `orgRoleValidator`, `orgPlanValidator`, `platformRoleValidator`, `ORG_ROLE_RANK`

## Shared Constants → [`convex/_shared/constants.ts`](../../convex/_shared/constants.ts)

Key exports: `PLAN_FEATURES`, `PLAN_LIMITS`, `FEATURE_FLAGS`, `INVITATION_EXPIRY_MS`, `ENTITY_TYPES`

## Permissions → [`convex/_shared/permissions.ts`](../../convex/_shared/permissions.ts)

Key exports: `PERMISSIONS`, `hasPermission()`, `requireRole()`, `hasMinRole()`, `requireMinRole()`, `requirePlanFeature()`

---

## Current State

**Status**: ✅ All base tables implemented and deployed
**Tests**: 82 passing, 1 skipped
**Sources**: [convex-saas](https://github.com/get-convex/convex-saas/blob/main/convex/schema.ts), [convex-tenants](https://github.com/dbjpanda/convex-tenants/blob/main/example/convex/tenants.ts)
