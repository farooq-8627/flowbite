"use client";

import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";

/**
 * useOrgPermission — checks if the current user has a specific permission in an org.
 *
 * Loads the user's membership (roleId) then the role's permissions[] from DB.
 *
 * Returns:
 *   - `true`  — user has the permission
 *   - `false` — user does not have the permission
 *   - `null`  — still loading (use for skeleton/disabled states)
 */
export function useOrgPermission(
	orgId: Id<"orgs"> | undefined,
	permission: string,
): boolean | null {
	const membership = useQuery(
		api.orgs.queries.getMyMembership,
		orgId ? { orgId } : "skip",
	);

	const role = useQuery(
		api.orgRoles.queries.get,
		membership?.roleId ? { roleId: membership.roleId } : "skip",
	);

	// Still loading
	if (membership === undefined) return null;
	// Not a member
	if (membership === null) return false;

	// Role still loading
	if (role === undefined) return null;
	// Role not found (shouldn't happen)
	if (role === null) return false;

	return role.permissions.includes(permission);
}
