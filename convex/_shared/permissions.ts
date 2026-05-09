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

	// ── Leads (Phase 2 — CRM Core) ────────────────────────────────────────────
	// qualify = advance a lead through scoring stages without converting it.
	// convert = create Contact+Deal from a Lead (destructive for the Lead record).
	"leads.view": ["owner", "admin", "member", "viewer"],
	"leads.create": ["owner", "admin", "member"],
	"leads.update": ["owner", "admin", "member"],
	"leads.delete": ["owner", "admin"],
	"leads.assign": ["owner", "admin"],
	"leads.qualify": ["owner", "admin", "member"],
	"leads.convert": ["owner", "admin"],

	// ── Contacts (Phase 2 — CRM Core) ────────────────────────────────────────
	"contacts.view": ["owner", "admin", "member", "viewer"],
	"contacts.create": ["owner", "admin", "member"],
	"contacts.update": ["owner", "admin", "member"],
	"contacts.delete": ["owner", "admin"],
	"contacts.assign": ["owner", "admin"],

	// ── Companies (Phase 2 — CRM Core) ───────────────────────────────────────
	"companies.view": ["owner", "admin", "member", "viewer"],
	"companies.create": ["owner", "admin", "member"],
	"companies.update": ["owner", "admin", "member"],
	"companies.delete": ["owner", "admin"],

	// ── Deals (Phase 2 — CRM Core) ───────────────────────────────────────────
	// changeStage = move a deal card between pipeline stages.
	// close = set wonAt/lostAt via closeAsDone() — separate from generic update.
	"deals.view": ["owner", "admin", "member", "viewer"],
	"deals.create": ["owner", "admin", "member"],
	"deals.update": ["owner", "admin", "member"],
	"deals.delete": ["owner", "admin"],
	"deals.assign": ["owner", "admin"],
	"deals.changeStage": ["owner", "admin", "member"],
	"deals.close": ["owner", "admin"],

	// ── Notes (Phase 2 — CRM Core) ───────────────────────────────────────────
	// updateOwn/deleteOwn = author only. deleteAny = admin override.
	"notes.view": ["owner", "admin", "member", "viewer"],
	"notes.viewInternal": ["owner", "admin"], // internal notes visible only to admin+
	"notes.create": ["owner", "admin", "member"],
	"notes.updateOwn": ["owner", "admin", "member"],
	"notes.deleteOwn": ["owner", "admin", "member"],
	"notes.deleteAny": ["owner", "admin"],
	"notes.pin": ["owner", "admin"],

	// ── Reminders (Phase 2 — CRM Core) ───────────────────────────────────────
	// manage = create/update/delete/complete reminders.
	"reminders.view": ["owner", "admin", "member", "viewer"],
	"reminders.create": ["owner", "admin", "member"],
	"reminders.manage": ["owner", "admin", "member"],

	// ── Tags (Phase 2 — CRM Core) ─────────────────────────────────────────────
	// manage = create/delete org-wide tags. attach = apply tags to entities.
	"tags.view": ["owner", "admin", "member", "viewer"],
	"tags.manage": ["owner", "admin"],
	"tags.attach": ["owner", "admin", "member"],

	// ── Saved Views (Phase 2 — CRM Core) ─────────────────────────────────────
	// createPersonal = save a view for yourself only.
	// createOrg = save a view visible to all org members.
	"savedViews.view": ["owner", "admin", "member", "viewer"],
	"savedViews.createPersonal": ["owner", "admin", "member"],
	"savedViews.createOrg": ["owner", "admin"],
	"savedViews.delete": ["owner", "admin"],

	// ── Pipelines (Phase 2 — CRM Core) ───────────────────────────────────────
	// manage = create/edit/delete pipelines and stages. view = just read.
	"pipelines.view": ["owner", "admin", "member", "viewer"],
	"pipelines.manage": ["owner", "admin"],

	// ── Dynamic Field Definitions (Phase 2 — CRM Core) ───────────────────────
	// manage = create/edit/delete custom fields. view = all roles.
	"fieldDefinitions.view": ["owner", "admin", "member", "viewer"],
	"fieldDefinitions.manage": ["owner", "admin"],

	// ── AI Assistant (Phase 3 — AI Native) ───────────────────────────────────
	// use    = trigger AI queries + actions. viewer CANNOT use AI (read-only seat).
	// manageTools = enable/disable individual AI tools per org. admin-gated.
	// viewHistory = see AI conversation log. viewer can read but not trigger.
	"ai.use": ["owner", "admin", "member"],
	"ai.manageTools": ["owner", "admin"],
	"ai.viewHistory": ["owner", "admin", "member", "viewer"],
} as const;

// ─── Core permission checks ───────────────────────────────────────────────────

/**
 * Returns true if the member's permissions array includes the required permission.
 *
 * DB-BACKED: Checks against the permissions[] resolved from orgRoles table.
 * Custom roles work without code changes — just add permissions to the role doc.
 *
 * USAGE:
 *   ```ts
 *   if (hasPermission(member.permissions, "connections.create")) {
 *     // show create button
 *   }
 *   ```
 */
export function hasPermission(permissions: string[], permission: string): boolean {
	return permissions.includes(permission);
}

/**
 * Throws ConvexError(FORBIDDEN) if the member's permissions don't include the required one.
 *
 * DB-BACKED: Checks against the permissions[] resolved from orgRoles table.
 * Custom roles work without code changes — just add permissions to the role doc.
 *
 * USAGE:
 *   ```ts
 *   const { member } = await requireOrgMember(ctx, args.orgId);
 *   requireRole(member.permissions, "members.remove");  // throws if permission missing
 *   ```
 */
export function requireRole(permissions: string[], permission: string): void {
	if (!permissions.includes(permission)) {
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

// ─── DB-backed permission check (Phase 1 RBAC refactor) ──────────────────────
//
// These functions replace the hardcoded PERMISSIONS map for runtime checks.
// They load the member's role from `orgRoles` and check `role.permissions[]`.
// Falls back to legacy string role + PERMISSIONS map if no roleId is set.
//
// USAGE in mutations:
//   ```ts
//   await requirePermission(ctx, args.orgId, ctx.userId, "leads.create");
//   ```

/**
 * DB-backed permission check. Loads the member's role from `orgRoles` and
 * checks `role.permissions[]`.
 *
 * Throws ConvexError(FORBIDDEN) if the user does not have the permission.
 *
 * @param ctx - Convex query or mutation context (must have ctx.db)
 * @param orgId - The org to check membership in
 * @param userId - The user to check
 * @param permission - Permission key e.g. "leads.create"
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function requirePermission(ctx: { db: any }, orgId: string, userId: string, permission: string): Promise<void> {
	const member = await ctx.db
		.query("orgMembers")
		.withIndex("by_orgId_and_userId", (q: { eq: (f: string, v: string) => { eq: (f: string, v: string) => unknown } }) =>
			q.eq("orgId", orgId).eq("userId", userId),
		)
		.first();

	if (!member || member.deletedAt !== undefined) {
		throw new ConvexError(ERRORS.FORBIDDEN);
	}

	// Resolve permissions from roleId (sole source of truth)
	const role = await ctx.db.get(member.roleId);
	if (!role || !Array.isArray(role.permissions)) {
		throw new ConvexError(ERRORS.FORBIDDEN);
	}
	if (!role.permissions.includes(permission)) {
		throw new ConvexError(ERRORS.FORBIDDEN);
	}
}

/**
 * DB-backed permission check — returns boolean instead of throwing.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function hasPermissionFromDB(ctx: { db: any }, orgId: string, userId: string, permission: string): Promise<boolean> {
	try {
		await requirePermission(ctx, orgId, userId, permission);
		return true;
	} catch {
		return false;
	}
}
