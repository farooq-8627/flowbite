# RBAC — Role-Based Access Control

> Single source of truth for all roles, permissions, and access rules.
> When building any feature, consult this document first.
> **Never hardcode permission logic** — import from `convex/_shared/permissions.ts`.
> Last Updated: 2026-03-29 | Author: Base Agent

---

## Roles Overview

The system has **two levels** of roles:

### Platform Roles (stored on `users.platformRole`)

| Role | Scope | Description |
|---|---|---|
| `super_admin` | Platform | Controls all organisations from *outside*. Cannot enter or operate within any org. |
| *(none)* | Default | Regular user who belongs to one or more orgs. |

### Org Roles (stored on `orgMembers.role`)

| Role | Scope | Description |
|---|---|---|
| `owner` | Org | Full authority within their org. Pre-approved for every action. CANNOT perform client/partner-side workflows (safety rule). |
| `admin` | Org | Full operational control. Manages connections, workflows, approvals, members. Everything owner can do operationally — just no org management (billing, settings, delete). |
| `member` | Org | Regular team member. Assigned work, can create and update work items. Cannot manage org structure. |
| `viewer` | Org | Read-only. Cannot create, update, or delete anything. |

### External Party Roles (managed per-connection in Connections module — NOT in orgMembers)

| Role | Scope | Description |
|---|---|---|
| `client` | Connection | External client with portal access. Scoped to their own connections only. Can submit client-side requests. |
| `partner` | Connection | External partner with portal access. Scoped to their own connections only. Can respond to partner-side tasks. |

> **Important:** `client` and `partner` are NOT org team members. They access specific
> connections through a portal. They are managed in the `connectionParticipants` table
> (defined in the Connections module — Phase 1). They DO have Convex user accounts but their
> `orgMembers` role is separate from their connection-level access.

---

## Permission Matrix — Module by Module

### Legend
- ✅ Full access
- 👁️ Read-only
- 🔒 Super admin only (platform-level)
- ❌ No access
- `own` = only their own data / connections they belong to

---

### 🔒 Platform Management (super_admin only, no org membership needed)

| Action | super_admin | Notes |
|---|---|---|
| List all organisations | ✅ | Read-only directory |
| View org metadata (name, plan, slug) | ✅ | |
| Upgrade / downgrade org plan | ✅ | Data preserved — features paused via flags |
| Enable / disable feature flag (global) | ✅ | Affects all orgs |
| Enable / disable feature flag (per org) | ✅ | `featureFlags.orgOverrides` |
| Add / remove org features | ✅ | |
| View org members list (read-only) | 👁️ | Cannot modify |
| Enter org / perform org operations | ❌ | Super admin is **outside** orgs |
| Perform client / partner workflows | ❌ | Platform role only |

---

### 🏢 Org Settings

| Action | owner | admin | member | viewer |
|---|---|---|---|---|
| View org profile (name, logo) | ✅ | ✅ | ❌ | ❌ |
| Edit org name / logo | ✅ | ❌ | ❌ | ❌ |
| Edit org settings (currency, timezone) | ✅ | ✅ | ❌ | ❌ |
| View billing / current plan | ✅ | ❌ | ❌ | ❌ |
| Initiate plan change (Stripe portal) | ✅ | ❌ | ❌ | ❌ |
| View which features are enabled | ❌ | ❌ | ❌ | ❌ | *(super_admin only — org members never see feature flags)* |
| Delete organisation (soft) | ✅ | ❌ | ❌ | ❌ |

---

### 👥 Members

| Action | owner | admin | member | viewer |
|---|---|---|---|---|
| View members list | ✅ | ✅ | ✅ | ✅ |
| Invite (admin / member / viewer roles) | ✅ | ✅ | ❌ | ❌ |
| Cancel pending invitation | ✅ | ✅ | ❌ | ❌ |
| Remove member (non-owner) | ✅ | ✅ | ❌ | ❌ |
| Remove owner | ✅ (self) | ❌ | ❌ | ❌ |
| Change member role | ✅ | ❌ | ❌ | ❌ |
| Leave org (self-remove) | ✅ | ✅ | ✅ | ✅ |

> **Rule:** An org must always have at least 1 owner. Cannot remove the last owner.

---

### 🔗 Connections (Phase 1 — NOT YET IMPLEMENTED)

> **Status:** NOT IMPLEMENTED — build in Phase 1.
> Connections represent B2B relationships between the org and external clients/partners.

| Action | owner | admin | member | viewer | client | partner |
|---|---|---|---|---|---|---|
| View connections list | ✅ | ✅ | ✅ | 👁️ | own | own |
| View connection detail | ✅ | ✅ | ✅ | 👁️ | own | own |
| Create connection | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ |
| Update connection (status, details) | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ |
| Assign self to connection | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ |
| Archive / close connection | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ |
| Send message in connection | ✅ | ✅ | ✅ | ❌ | ✅ | ✅ |
| Submit client-side request | ❌ | ❌ | ❌ | ❌ | ✅ | ❌ |
| Submit partner-side response | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ |

> **Owner rule:** Owner CAN access connections, add themselves, and message. Owner
> CANNOT perform client-side or partner-side workflow actions. This is a safety
> boundary — client/partner actions are role-specific portal interactions.

---

### ⚙️ Workflows / Approvals (Phase 2 — NOT YET IMPLEMENTED)

> **Status:** NOT IMPLEMENTED — build in Phase 2.
> Workflows are approval chains and state machines. Approvals are instances of workflows.

| Action | owner | admin | member | viewer | client | partner |
|---|---|---|---|---|---|---|
| View workflows | ✅ | ✅ | ✅ | 👁️ | own | own |
| Create / edit workflow template | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ |
| Approve / reject (admin side) | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ |
| Submit request (client side) | ❌ | ❌ | ❌ | ❌ | ✅ | ❌ |
| Approve / reject (partner side) | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ |
| View approval status | ✅ | ✅ | ✅ | 👁️ | own | own |

---

### 📋 Work Items (Phase 3 — NOT YET IMPLEMENTED)

> **Status:** NOT IMPLEMENTED — build in Phase 3.

| Action | owner | admin | member | viewer |
|---|---|---|---|---|
| View work items | ✅ | ✅ | ✅ | 👁️ |
| Create work item | ✅ | ✅ | ✅ | ❌ |
| Update work item (assigned to self) | ✅ | ✅ | ✅ | ❌ |
| Update any work item | ✅ | ✅ | ❌ | ❌ |
| Delete work item | ✅ | ✅ | ❌ | ❌ |
| Assign work item | ✅ | ✅ | ❌ | ❌ |

---

### 💬 Messaging (Phase 1 — NOT YET IMPLEMENTED, within Connections)

> **Status:** NOT IMPLEMENTED — part of Connections module (Phase 1).

| Action | owner | admin | member | viewer | client | partner |
|---|---|---|---|---|---|---|
| Send message | ✅ | ✅ | ✅ | ❌ | ✅ (own) | ✅ (own) |
| View messages | ✅ | ✅ | ✅ | 👁️ | own | own |
| Delete own message | ✅ | ✅ | ✅ | ❌ | ✅ (own) | ✅ (own) |
| Delete any message | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ |

---

### 📊 Reports / Commissions (Phase 5 — NOT YET IMPLEMENTED)

> **Status:** NOT IMPLEMENTED — build in Phase 5.

| Action | owner | admin | member | viewer | client | partner |
|---|---|---|---|---|---|---|
| View org reports | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ |
| Export reports | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ |
| View commissions | ✅ | ✅ | ❌ | ❌ | ❌ | own |
| Process commissions | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ |

---

### 📋 Activity Logs

| Action | owner | admin | member | viewer |
|---|---|---|---|---|
| View full org activity log | ✅ | ✅ | ❌ | ❌ |
| View own activity | ✅ | ✅ | ✅ | ✅ |

---

### 🔔 Notifications

| Action | all org roles | client | partner |
|---|---|---|---|
| View own notifications | ✅ | ✅ | ✅ |
| Mark as read / archive | ✅ | ✅ | ✅ |

---

## Plan → Feature Flags Mapping

> When a plan is changed, only the feature flag state changes. **Data is NEVER deleted.**
> Features become "paused" — data is preserved and automatically re-enabled on upgrade.

```
free:        members.basic, connections.basic (max 5)
starter:     members.full, connections.full, messaging.full, workflows.basic, approvals.basic
pro:         starter + workflows.full, approvals.full, reports.basic, dynamic_forms.basic, commissions.basic
enterprise:  pro + reports.full, dynamic_forms.full, commissions.full, custom_branding, api_access, audit_logs.full
```

### Plan Limits

| Plan | Max Members | Max Connections | Notes |
|---|---|---|---|
| free | 3 | 5 | Base plan |
| starter | 10 | unlimited | — |
| pro | 25 | unlimited | — |
| enterprise | unlimited | unlimited | Custom contracts |

### Data Preservation Rule (CRITICAL)

When downgrading from pro → starter:
1. `featureFlags.orgOverrides[orgId]` is updated to disable pro features
2. Reports data, dynamic forms data → **preserved, inaccessible via UI**
3. No rows deleted — soft disabled only
4. UI shows "Upgrade to access" placeholder
5. Re-upgrade → features re-enable, all data reappears immediately

This is enforced at the Convex function level via `checkFeatureEnabled(ctx, orgId, "reports.full")`.

---

## RBAC Implementation Pattern

### In Convex Functions

```ts
// ✅ CORRECT — use permission utility
import { hasPermission, requireRole } from "../_shared/permissions";

export const removeMember = orgMutation({
  args: { orgId: v.id("orgs"), userId: v.id("users") },
  handler: async (ctx, args) => {
    const { member } = await requireOrgMember(ctx, args.orgId);
    requireRole(member.role, "members.remove"); // throws FORBIDDEN if not allowed
    // ... rest of logic
  },
});

// ❌ WRONG — inline permission checks
if (member.role !== "owner" && member.role !== "admin") throw new ConvexError(ERRORS.FORBIDDEN);
```

### In React Components

```tsx
// ✅ CORRECT
import { useOrgPermission } from "@/features/orgs/hooks/useOrgPermission";

export function RemoveMemberButton() {
  const can = useOrgPermission("members.remove");
  if (!can) return null;
  return <Button>Remove</Button>;
}
```

### For Super Admin Routes

```ts
export const setOrgPlan = superAdminMutation({
  args: { orgId: v.id("orgs"), plan: orgPlanValidator },
  handler: async (ctx, args) => {
    // ctx.user.platformRole === "super_admin" is already verified
    // ... update plan and apply feature flag overrides
  },
});
```

---

## Role Hierarchy Summary

```
super_admin         Platform control only. NO org access.
    │
    └── (manages from outside)
    
owner               Full org authority (pre-approved). NO client/partner workflows.
    │
    └── Everything admin can do, PLUS:
        - Edit org name / logo
        - View billing
        - Initiate plan change  
        - Change member roles
        - Delete org

admin               Full operational control.
    │               Same as owner for operations.
    └── Manages connections, workflows, approvals, members (non-role-change)

member              Assigned worker.
    └── Work items (own), view connections, message

viewer              Read-only.
    └── View only — no mutations allowed

client (external)   Portal access. Own connections only.
    └── Submit client-side requests, view own data, message

partner (external)  Portal access. Own connections only.
    └── Submit partner-side responses, view own data, message
```

---

## Files Implementing This

| File | Purpose |
|---|---|
| `convex/_shared/permissions.ts` | `hasPermission()`, `requireRole()`, `PERMISSIONS` map |
| `convex/_shared/validators.ts` | `platformRoleValidator`, `orgRoleValidator` |
| `convex/_shared/constants.ts` | `PLAN_FEATURES`, `PLAN_LIMITS` |
| `convex/_functions/authenticated.ts` | `superAdminQuery`, `superAdminMutation`, `requireSuperAdmin` |
| `convex/schema.ts` | `users.platformRole`, `orgMembers.role` |
| `features/orgs/hooks/useOrgPermission.ts` | React hook for frontend permission checks |

---

## Implementation Status

| Module | Backend | Frontend | Tests |
|---|---|---|---|
| Platform roles (`platformRole`) | ✅ Done | ⬜ Pending | ✅ 2 tests |
| Org roles (`orgMembers.role`) | ✅ Done | ⬜ Pending | ✅ Covered in orgs.test.ts |
| `permissions.ts` utilities | ✅ Done | N/A | ⬜ Pending unit tests |
| `superAdminQuery/Mutation` | ✅ Done | N/A | ✅ 2 tests |
| Connections (client/partner access) | ⬜ Phase 1 | ⬜ Phase 1 | ⬜ Phase 1 |
| `useOrgPermission` React hook | ⬜ Pending | ⬜ Pending | ⬜ Pending |
| Frontend gate components | ⬜ Pending | ⬜ Pending | ⬜ Pending |

---

## Data Preservation Rule (CRITICAL)

> **NEVER delete org data on plan downgrade.**

When `super_admin` changes an org from `pro` → `starter`:
1. Update `orgs.plan` to the new plan.
2. Write `featureFlags.orgOverrides[orgId]` with the new plan's feature set.
3. All `pro`-only data (reports, commissions, etc.) is **preserved but inaccessible**.
4. On upgrade back to `pro`: clear the override and all data becomes accessible again.

This is enforced via `PLAN_FEATURES` constant in `_shared/constants.ts`.
Never write a mutation that deletes documents based on plan tier.

---

## What's Next

- [ ] **Phase 0 (current):** Add `permissions.test.ts` unit tests for `hasPermission()`, `requireRole()`, `hasMinRole()`
- [ ] **Phase 0 (current):** Add `useOrgPermission(permission: string)` React hook in `features/orgs/hooks/`
- [ ] **Phase 1 (Connections):** Build `connectionParticipants` table + client/partner RBAC
- [ ] **Phase 1 (Connections):** Add `externalRoleValidator` to connections schema
- [ ] **Frontend gates:** `<PermissionGate permission="members.invite">` component
