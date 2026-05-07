"use client";

import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";

/**
 * useOrgPermission — checks if the current user has a specific permission in an org.
 *
 * Loads the user's membership (roleId) then the role's permissions[] from DB.
 * Falls back to the legacy `role` string + PERMISSIONS map if no roleId set.
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

	// DB-backed: check role.permissions[]
	if (role !== undefined && role !== null) {
		return role.permissions.includes(permission);
	}

	// Legacy fallback: role string → static PERMISSIONS map
	if (membership.role) {
		return LEGACY_PERMISSIONS[permission]?.includes(membership.role) ?? false;
	}

	return false;
}

// Minimal legacy fallback — mirrors the server-side PERMISSIONS map for common checks
const LEGACY_PERMISSIONS: Record<string, string[]> = {
	"members.view":   ["owner", "admin", "member", "viewer"],
	"members.invite": ["owner", "admin"],
	"members.remove": ["owner", "admin"],
	"leads.view":     ["owner", "admin", "member", "viewer"],
	"leads.create":   ["owner", "admin", "member"],
	"deals.view":     ["owner", "admin", "member", "viewer"],
	"deals.create":   ["owner", "admin", "member"],
	"org.viewSettings": ["owner", "admin"],
	"org.editSettings": ["owner", "admin"],
};
