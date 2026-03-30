/**
 * useOrgPermission — React hook for frontend permission gates.
 *
 * HOW IT WORKS:
 *   Reads the current user's org membership role from Convex and checks it
 *   against the PERMISSIONS map. Returns a boolean indicating whether the
 *   current user can perform the given action.
 *
 * WHY CLIENT-SIDE:
 *   Backend still enforces permissions via requireRole(). This hook is for
 *   UI-level gating (hide/show buttons, disable actions). It is NOT a
 *   security boundary — that's the backend's job.
 *
 * USAGE:
 *   ```tsx
 *   const canInvite = useOrgPermission("members.invite");
 *   if (canInvite) return <InviteButton />;
 *   ```
 *
 * Sources:
 * - convex/_shared/permissions.ts — PERMISSIONS map and hasPermission()
 * - .github/agents/base/rbac.md — RBAC master document
 */
"use client";

import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { hasPermission } from "@/convex/_shared/permissions";
import type { OrgRole } from "@/convex/_shared/validators";

/**
 * Returns true if the current user's org role allows the given permission.
 * Returns false if loading, not authenticated, or not a member of any org.
 */
export function useOrgPermission(permission: string): boolean {
	const user = useQuery(api.users.queries.me);
	const orgId = user?.defaultOrgId;
	const members = useQuery(api.orgs.queries.listMembers, orgId ? { orgId } : "skip");

	if (!user || !orgId || !members) return false;

	const myMembership = members.find((m: { userId: string }) => m.userId === user._id);
	if (!myMembership) return false;

	return hasPermission(myMembership.role as OrgRole, permission);
}
