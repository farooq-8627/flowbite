"use client";

import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { InvitationsSection } from "./team/InvitationsSection";
import { MembersSection } from "./team/MembersSection";
import { RolesSection } from "./team/RolesSection";

export function TeamGroup({ orgId, permissions }: { orgId: Id<"orgs">; permissions: string[] }) {
	const me = useQuery(api.users.queries.getCurrent);
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
