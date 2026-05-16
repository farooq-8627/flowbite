/**
 * Shared test helpers for seeding org members with proper roleId.
 *
 * Permissions for each system role come from the SSOT catalog
 * (`convex/_shared/permissions/catalog.ts`) via `getDefaultPermissionsForRole`.
 * NEVER hardcode permission lists in this file — that breaks the SSOT contract
 * and silently drifts the moment a permission is added to the catalog.
 *
 * Source of truth: `_shared/permissions/derive.ts::getDefaultPermissionsForRole`.
 */

import type { SystemRoleName } from "../_shared/permissions/catalog";
import { getDefaultPermissionsForRole } from "../_shared/permissions/derive";

/**
 * Creates an orgRole and inserts an orgMember in one call.
 * Use in test setup where you need a member with a specific role.
 *
 * The role's permissions list comes straight from the SSOT catalog —
 * adding a permission to `_shared/permissions/catalog.ts` automatically
 * propagates here (no test-side update needed).
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function seedOrgMember(
	ctx: any,
	orgId: any,
	userId: any,
	roleName: "owner" | "admin" | "member" | "viewer",
) {
	const now = Date.now();
	const capitalize = (s: string) => (s.charAt(0).toUpperCase() + s.slice(1)) as SystemRoleName;
	const systemName = capitalize(roleName);

	const roleId = await ctx.db.insert("orgRoles", {
		orgId,
		name: systemName,
		permissions: [...getDefaultPermissionsForRole(systemName)],
		isSystem: true,
		isDefault: roleName === "member",
		createdAt: now,
		updatedAt: now,
	});

	const memberId = await ctx.db.insert("orgMembers", {
		orgId,
		userId,
		roleId,
		joinedAt: now,
	});

	return { roleId, memberId };
}
