"use client";

import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { useMe } from "@/core/shell/shared/hooks/useCurrentOrg";
import { InvitationsSection } from "./team/InvitationsSection";
import { MembersSection } from "./team/MembersSection";
import { RolesSection } from "./team/RolesSection";

export function TeamGroup({ orgId, permissions }: { orgId: Id<"orgs">; permissions: string[] }) {
	// Read the authenticated user from the shared `OrgProvider` context —
	// no extra `users.getCurrent` subscription per AGENTS.md "Identity/auth/
	// labels via context, not subscriptions".
	const me = useMe();
	const roles = useQuery(api.orgRoles.queries.list, { orgId });

	const canManage = permissions.includes("members.invite");
	const isOwner = permissions.includes("org.delete");

	return (
		<div className="grid gap-6">
			<MembersSection
				orgId={orgId}
				roles={roles}
				currentUserId={me?._id}
				canManage={canManage}
			/>
			<InvitationsSection orgId={orgId} canManage={canManage} />
			{isOwner && <RolesSection orgId={orgId} />}
		</div>
	);
}
