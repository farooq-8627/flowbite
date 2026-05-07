/**
 * PermissionGate — conditionally renders children based on org permission.
 *
 * HOW IT WORKS:
 *   Uses useOrgPermission() to check if the current user's org role
 *   allows the specified permission. If yes, renders children. If no,
 *   renders the fallback (default: nothing).
 *
 * WHY THIS PATTERN:
 *   Declarative permission checks in JSX. Prevents scattered if-checks
 *   and makes permission requirements visible in the component tree.
 *
 * USAGE:
 *   ```tsx
 *   <PermissionGate permission="members.invite">
 *     <InviteButton />
 *   </PermissionGate>
 *
 *   <PermissionGate permission="reports.view" fallback={<UpgradeBanner />}>
 *     <ReportsDashboard />
 *   </PermissionGate>
 *   ```
 *
 * Sources:
 * - features/orgs/hooks/useOrgPermission.ts — permission hook
 * - .github/agents/base/rbac.md — RBAC master document
 */
"use client";

import type { ReactNode } from "react";
import { useOrgPermission } from "@/features/orgs/hooks/useOrgPermission";
import type { Id } from "@/convex/_generated/dataModel";

interface PermissionGateProps {
	/** Org ID to check permission against */
	orgId?: Id<"orgs">;
	/** Permission key to check (e.g. "members.invite", "connections.create") */
	permission: string;
	/** Content to render if permission is granted */
	children: ReactNode;
	/** Content to render if permission is denied (default: null) */
	fallback?: ReactNode;
}

export function PermissionGate({ orgId, permission, children, fallback = null }: PermissionGateProps) {
	const allowed = useOrgPermission(orgId, permission);

	if (!allowed) return <>{fallback}</>;

	return <>{children}</>;
}
