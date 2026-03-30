/**
 * RBAC Permission Utilities — convex/_shared/permissions.ts
 *
 * WHAT THIS FILE DOES:
 *   Single source of truth for all permission checks in Convex functions.
 *   Every protected mutation/query must go through these utilities.
 *   Never write inline role checks — always use `requireRole()` or `hasPermission()`.
 *
 * HOW IT WORKS:
 *   1. `PERMISSIONS` map defines which org roles are allowed for each module+action.
 *   2. `hasPermission(role, "module.action")` returns true/false.
 *   3. `requireRole(role, "module.action")` throws FORBIDDEN if not allowed.
 *   4. `hasMinRole(role, minRole)` checks role hierarchy (viewer < member < admin < owner).
 *
 * WHY THIS PATTERN:
 *   - Centralised: add new features by adding entries to PERMISSIONS — one place to change.
 *   - Type-safe: TypeScript catches typos in permission keys at compile time.
 *   - Testable: pure functions with no DB access.
 *   - Auditable: grep `requireRole` to find every permission enforcement point.
 *
 * USAGE PATTERN:
 *   ```ts
 *   // In a Convex mutation:
 *   import { requireRole } from "../_shared/permissions";
 *   const { member } = await requireOrgMember(ctx, args.orgId);
 *   requireRole(member.role, "members.remove");
 *   ```
 *
 * EXTERNAL PARTIES (client, partner):
 *   Client and partner permissions are defined in the Connections module (Phase 1).
 *   They are NOT in this file because they are not org members.
 *   Ref: .github/agents/base/rbac.md — External Party Roles
 *
 * Sources:
 * - https://github.com/get-convex/convex-saas/blob/main/convex/utils.ts
 * - https://casl.js.org/v6/en/guide/intro — CASL permission pattern (reference)
 * - .github/agents/base/rbac.md — master RBAC document
 */
import { ConvexError } from "convex/values";
import { type OrgRole, ORG_ROLE_RANK } from "./validators";
import { ERRORS } from "./errors";
import { PLAN_FEATURES } from "./constants";

// ─── Permission Map ───────────────────────────────────────────────────────────
//
// Format: "module.action" → array of org roles that are allowed.
// An empty array means NO org role can perform this action (super_admin only).
// Roles not in the list receive FORBIDDEN.
//
// IMPORTANT:
//   - `owner` should appear in every list where `admin` appears (owner ≥ admin).
//   - Partial exceptions are noted inline.
//   - When building new modules, ADD ENTRIES HERE and document the permission in rbac.md.

export const PERMISSIONS: Record<string, readonly OrgRole[]> = {
	// ── Org Settings ──────────────────────────────────────────────────────────
	"org.viewSettings": ["owner", "admin"],
	"org.editName": ["owner"],
	"org.editLogo": ["owner"],
	"org.editSettings": ["owner", "admin"], // currency, timezone
	"org.viewBilling": ["owner"],
	"org.initiatePlanChange": [], // super_admin only — no org role
	"org.delete": ["owner"],
	"org.viewFeatureFlags": [], // super_admin only — org members never see feature flags

	// ── Members ───────────────────────────────────────────────────────────────
	"members.view": ["owner", "admin", "member", "viewer"],
	"members.invite": ["owner", "admin"],
	"members.cancelInvitation": ["owner", "admin"],
	"members.remove": ["owner", "admin"], // admin cannot remove owner (enforced in mutation logic)
	"members.changeRole": ["owner"], // owner only — RBAC is owner-gated
	"members.leave": ["owner", "admin", "member", "viewer"], // everyone can leave

	// ── Connections (Phase 1 — NOT YET IMPLEMENTED) ──────────────────────────
	// Define permissions now so Phase 1 can import from here without touching this file.
	"connections.view": ["owner", "admin", "member", "viewer"],
	"connections.create": ["owner", "admin"],
	"connections.update": ["owner", "admin"],
	"connections.archive": ["owner", "admin"],
	"connections.addSelf": ["owner", "admin"],
	"connections.message": ["owner", "admin", "member"],
	// client/partner actions are in the Connections module (Phase 1)

	// ── Workflows (Phase 2 — NOT YET IMPLEMENTED) ────────────────────────────
	"workflows.view": ["owner", "admin", "member", "viewer"],
	"workflows.create": ["owner", "admin"],
	"workflows.editTemplate": ["owner", "admin"],
	"workflows.approve": ["owner", "admin"], // admin-side approval
	// client/partner-side actions in Connections module

	// ── Work Items (Phase 3 — NOT YET IMPLEMENTED) ───────────────────────────
	"workItems.view": ["owner", "admin", "member", "viewer"],
	"workItems.create": ["owner", "admin", "member"],
	"workItems.updateOwn": ["owner", "admin", "member"],
	"workItems.updateAny": ["owner", "admin"],
	"workItems.delete": ["owner", "admin"],
	"workItems.assign": ["owner", "admin"],

	// ── Messaging (Phase 1, within Connections) ───────────────────────────────
	"messaging.send": ["owner", "admin", "member"],
	"messaging.deleteOwn": ["owner", "admin", "member"],
	"messaging.deleteAny": ["owner", "admin"],
	"messaging.view": ["owner", "admin", "member", "viewer"],

	// ── Reports (Phase 5 — NOT YET IMPLEMENTED) ──────────────────────────────
	"reports.view": ["owner", "admin"],
	"reports.export": ["owner", "admin"],

	// ── Commissions (Phase 5 — NOT YET IMPLEMENTED) ──────────────────────────
	"commissions.view": ["owner", "admin"],
	"commissions.process": ["owner", "admin"],

	// ── Activity Logs ─────────────────────────────────────────────────────────
	"activityLogs.viewOrg": ["owner", "admin"],
	"activityLogs.viewOwn": ["owner", "admin", "member", "viewer"],

	// ── Notifications ─────────────────────────────────────────────────────────
	"notifications.viewOwn": ["owner", "admin", "member", "viewer"],
	"notifications.markRead": ["owner", "admin", "member", "viewer"],
} as const;

// ─── Core permission checks ───────────────────────────────────────────────────

/**
 * Returns true if the given org role is allowed to perform the action.
 *
 * HOW IT WORKS:
 *   Looks up the permission key in the PERMISSIONS map and checks if the role
 *   is in the allowed list. Returns false for unknown permission keys.
 *
 * USAGE:
 *   ```ts
 *   if (hasPermission(member.role, "connections.create")) {
 *     // show create button
 *   }
 *   ```
 */
export function hasPermission(role: OrgRole, permission: string): boolean {
	const allowed = PERMISSIONS[permission];
	if (!allowed) return false;
	return (allowed as readonly string[]).includes(role);
}

/**
 * Throws ConvexError(FORBIDDEN) if the role is NOT allowed to perform the action.
 *
 * HOW IT WORKS:
 *   Call this at the start of any protected mutation/query handler, immediately
 *   after getting the member from `requireOrgMember`. If the role is insufficient,
 *   execution stops with a FORBIDDEN error — no further code runs.
 *
 * WHY THROW RATHER THAN RETURN:
 *   Throwing early is the correct pattern for auth guards. It prevents accidentally
 *   continuing past a failed permission check (no forgotten `if (!allowed) return`).
 *q
 * USAGE:
 *   ```ts
 *   const { member } = await requireOrgMember(ctx, args.orgId);
 *   requireRole(member.role, "members.remove");  // throws if not owner/admin
 *   ```
 *
 * Sources:
 * - https://github.com/get-convex/convex-saas/blob/main/convex/utils.ts
 */
export function requireRole(role: OrgRole, permission: string): void {
	if (!hasPermission(role, permission)) {
		throw new ConvexError(ERRORS.FORBIDDEN);
	}
}

/**
 * Returns true if the role meets or exceeds the minimum required role in the hierarchy.
 *
 * Role hierarchy (low → high): viewer(0) < member(1) < admin(2) < owner(3)
 *
 * HOW IT WORKS:
 *   Compares numeric ranks from ORG_ROLE_RANK. Useful for "at least admin" checks.
 *
 * USAGE:
 *   ```ts
 *   if (hasMinRole(member.role, "admin")) {
 *     // admin OR owner can proceed
 *   }
 *   ```
 */
export function hasMinRole(role: OrgRole, minRole: OrgRole): boolean {
	return ORG_ROLE_RANK[role] >= ORG_ROLE_RANK[minRole];
}

/**
 * Throws ConvexError(FORBIDDEN) if the role is below the minimum required level.
 *
 * USAGE:
 *   ```ts
 *   requireMinRole(member.role, "admin"); // throws if member or viewer
 *   ```
 */
export function requireMinRole(role: OrgRole, minRole: OrgRole): void {
	if (!hasMinRole(role, minRole)) {
		throw new ConvexError(ERRORS.FORBIDDEN);
	}
}

/**
 * Checks if a plan includes a specific feature.
 * Used when enforcing plan limits in mutations.
 *
 * HOW IT WORKS:
 *   Imports PLAN_FEATURES from constants and checks membership.
 *   Throws FEATURE_DISABLED if the feature is not in the plan's feature list.
 *
 * NOTE:
 *   For runtime feature flag checks (respecting orgOverrides), use the
 *   `isFeatureEnabled(ctx, orgId, featureKey)` helper in featureFlags module (Phase 0+).
 *
 * USAGE:
 *   ```ts
 *   requirePlanFeature(org.plan, "reports.basic"); // throws if plan doesn't include it
 *   ```
 */
export function requirePlanFeature(plan: string, featureKey: string): void {
	const features = PLAN_FEATURES[plan as keyof typeof PLAN_FEATURES] ?? ([] as readonly string[]);
	if (!(features as readonly string[]).includes(featureKey)) {
		throw new ConvexError(ERRORS.FEATURE_DISABLED);
	}
}
