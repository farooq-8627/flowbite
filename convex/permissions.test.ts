/// <reference types="vite/client" />
/**
 * Unit tests for convex/_shared/permissions.ts
 *
 * WHAT IS BEING TESTED:
 *   Pure permission utility functions:
 *   - `hasPermission(role, key)` — returns true/false
 *   - `requireRole(role, key)` — throws FORBIDDEN if not allowed
 *   - `hasMinRole(role, minRole)` — role hierarchy comparison
 *   - `requireMinRole(role, minRole)` — throws FORBIDDEN if below min
 *   - `requirePlanFeature(plan, key)` — throws FEATURE_DISABLED if plan lacks the feature
 *
 * WHY PURE UNIT TESTS (no DB):
 *   These are pure functions with no DB access. Testing them directly is
 *   faster and more reliable than wrapping in a full convex-test context.
 *
 * Sources:
 * - https://github.com/get-convex/convex-test — convex-test official package
 * - .github/agents/base/rbac.md — permission definitions
 * - convex/_shared/permissions.ts — source being tested
 */
import { describe, expect, it } from "vitest";
import {
	hasPermission,
	hasMinRole,
	requireMinRole,
	requirePlanFeature,
	requireRole,
} from "./_shared/permissions";
import { ERRORS } from "./_shared/errors";

// ─── hasPermission ────────────────────────────────────────────────────────────

describe("hasPermission", () => {
	it("returns true for owner on all non-super-admin permissions", () => {
		/**
		 * owner should pass every org-level permission.
		 * The only exceptions are super_admin-only operations (empty array in PERMISSIONS).
		 */
		expect(hasPermission("owner", "members.view")).toBe(true);
		expect(hasPermission("owner", "members.invite")).toBe(true);
		expect(hasPermission("owner", "members.remove")).toBe(true);
		expect(hasPermission("owner", "members.changeRole")).toBe(true);
		expect(hasPermission("owner", "connections.create")).toBe(true);
		expect(hasPermission("owner", "workflows.approve")).toBe(true);
		expect(hasPermission("owner", "reports.view")).toBe(true);
	});

	it("returns true for admin on operational permissions", () => {
		expect(hasPermission("admin", "members.view")).toBe(true);
		expect(hasPermission("admin", "members.invite")).toBe(true);
		expect(hasPermission("admin", "connections.create")).toBe(true);
		expect(hasPermission("admin", "workflows.approve")).toBe(true);
	});

	it("returns false for admin on owner-only permissions", () => {
		/**
		 * changeRole and org.editName are owner-only.
		 * Admin should not be able to perform these.
		 */
		expect(hasPermission("admin", "members.changeRole")).toBe(false);
		expect(hasPermission("admin", "org.editName")).toBe(false);
		expect(hasPermission("admin", "org.viewBilling")).toBe(false);
	});

	it("returns true for member on assigned-work permissions", () => {
		expect(hasPermission("member", "members.view")).toBe(true);
		expect(hasPermission("member", "workItems.create")).toBe(true);
		expect(hasPermission("member", "messaging.send")).toBe(true);
	});

	it("returns false for member on admin-level permissions", () => {
		expect(hasPermission("member", "members.invite")).toBe(false);
		expect(hasPermission("member", "members.remove")).toBe(false);
		expect(hasPermission("member", "connections.create")).toBe(false);
	});

	it("returns true for viewer on view-only permissions", () => {
		expect(hasPermission("viewer", "members.view")).toBe(true);
		expect(hasPermission("viewer", "connections.view")).toBe(true);
		expect(hasPermission("viewer", "activityLogs.viewOwn")).toBe(true);
	});

	it("returns false for viewer on any write permission", () => {
		expect(hasPermission("viewer", "members.invite")).toBe(false);
		expect(hasPermission("viewer", "workItems.create")).toBe(false);
		expect(hasPermission("viewer", "messaging.send")).toBe(false);
	});

	it("returns false for unknown permission key", () => {
		/**
		 * Safeguard: typos in permission keys should fail closed, not open.
		 * If a key doesn't exist in the PERMISSIONS map, no role should pass.
		 */
		expect(hasPermission("owner", "nonexistent.permission")).toBe(false);
	});

	it("returns false for all roles on super_admin-only permissions", () => {
		/**
		 * `org.initiatePlanChange` has an empty array in PERMISSIONS —
		 * no org role can perform it, only super_admin (handled at platform level).
		 */
		expect(hasPermission("owner", "org.initiatePlanChange")).toBe(false);
		expect(hasPermission("admin", "org.initiatePlanChange")).toBe(false);
		expect(hasPermission("member", "org.initiatePlanChange")).toBe(false);
		expect(hasPermission("viewer", "org.initiatePlanChange")).toBe(false);
	});
});

// ─── requireRole ─────────────────────────────────────────────────────────────

describe("requireRole", () => {
	it("does not throw when role is allowed", () => {
		/**
		 * owner calling members.invite — should pass silently.
		 */
		expect(() => requireRole("owner", "members.invite")).not.toThrow();
		expect(() => requireRole("admin", "members.invite")).not.toThrow();
	});

	it("throws FORBIDDEN when role is not allowed", () => {
		/**
		 * viewer calling members.invite — FORBIDDEN.
		 * The thrown ConvexError message must match ERRORS.FORBIDDEN.
		 */
		expect(() => requireRole("viewer", "members.invite")).toThrow(ERRORS.FORBIDDEN);
		expect(() => requireRole("member", "members.changeRole")).toThrow(ERRORS.FORBIDDEN);
	});

	it("throws FORBIDDEN for owner on super_admin-only action", () => {
		/**
		 * Even owner cannot initiate plan change — that's super_admin only.
		 */
		expect(() => requireRole("owner", "org.initiatePlanChange")).toThrow(ERRORS.FORBIDDEN);
	});
});

// ─── hasMinRole ───────────────────────────────────────────────────────────────

describe("hasMinRole", () => {
	it("owner meets all role thresholds", () => {
		expect(hasMinRole("owner", "viewer")).toBe(true);
		expect(hasMinRole("owner", "member")).toBe(true);
		expect(hasMinRole("owner", "admin")).toBe(true);
		expect(hasMinRole("owner", "owner")).toBe(true);
	});

	it("admin meets admin and below", () => {
		expect(hasMinRole("admin", "viewer")).toBe(true);
		expect(hasMinRole("admin", "member")).toBe(true);
		expect(hasMinRole("admin", "admin")).toBe(true);
		expect(hasMinRole("admin", "owner")).toBe(false);
	});

	it("member meets member and below", () => {
		expect(hasMinRole("member", "viewer")).toBe(true);
		expect(hasMinRole("member", "member")).toBe(true);
		expect(hasMinRole("member", "admin")).toBe(false);
	});

	it("viewer only meets viewer threshold", () => {
		expect(hasMinRole("viewer", "viewer")).toBe(true);
		expect(hasMinRole("viewer", "member")).toBe(false);
		expect(hasMinRole("viewer", "admin")).toBe(false);
		expect(hasMinRole("viewer", "owner")).toBe(false);
	});
});

// ─── requireMinRole ───────────────────────────────────────────────────────────

describe("requireMinRole", () => {
	it("does not throw when role meets minimum", () => {
		expect(() => requireMinRole("admin", "member")).not.toThrow();
		expect(() => requireMinRole("owner", "admin")).not.toThrow();
	});

	it("throws FORBIDDEN when role is below minimum", () => {
		expect(() => requireMinRole("viewer", "admin")).toThrow(ERRORS.FORBIDDEN);
		expect(() => requireMinRole("member", "owner")).toThrow(ERRORS.FORBIDDEN);
	});
});

// ─── requirePlanFeature ───────────────────────────────────────────────────────

describe("requirePlanFeature", () => {
	it("does not throw when plan includes the feature", () => {
		expect(() => requirePlanFeature("pro", "reports.basic")).not.toThrow();
		expect(() => requirePlanFeature("enterprise", "api_access")).not.toThrow();
		expect(() => requirePlanFeature("free", "members.basic")).not.toThrow();
	});

	it("throws FEATURE_DISABLED when plan does not include the feature", () => {
		/**
		 * Free plan does not include reports.
		 * Pro plan does not include api_access.
		 */
		expect(() => requirePlanFeature("free", "reports.basic")).toThrow(ERRORS.FEATURE_DISABLED);
		expect(() => requirePlanFeature("starter", "api_access")).toThrow(ERRORS.FEATURE_DISABLED);
		expect(() => requirePlanFeature("pro", "api_access")).toThrow(ERRORS.FEATURE_DISABLED);
	});

	it("throws FEATURE_DISABLED for unknown feature key", () => {
		expect(() => requirePlanFeature("enterprise", "nonexistent.feature")).toThrow(ERRORS.FEATURE_DISABLED);
	});
});
