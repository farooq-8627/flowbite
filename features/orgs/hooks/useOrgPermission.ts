"use client";

import { useCurrentOrg } from "@/core/shell/shared/hooks/useCurrentOrg";

/**
 * useOrgPermission — checks if the current user has a specific permission
 * in the *current org* (i.e. the one served by the surrounding
 * `<OrgProvider>`).
 *
 * History — used to subscribe to `orgs.getMyMembership` AND `orgRoles.get`
 * independently, returning `null | true | false`. As of 2026-05-18 it
 * reads from the shared `OrgProvider` context: there's no extra
 * subscription, the permission list is already resolved server-side, and
 * the `orgId` argument is ignored. Kept as a thin wrapper so existing
 * callers continue to work without a refactor.
 *
 * Returns:
 *   - `true`  — user has the permission
 *   - `false` — user does not have the permission
 *   - `null`  — still loading
 */
export function useOrgPermission(_orgId: unknown, permission: string): boolean | null {
	const { membership } = useCurrentOrg();
	if (membership === undefined) return null; // loading
	if (membership === null) return false; // not a member of this org
	return membership.permissions.includes(permission);
}
