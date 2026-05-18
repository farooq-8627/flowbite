"use client";

import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { useMe } from "@/core/shell/shared/hooks/useCurrentOrg";
import { InvitationsSection } from "./team/InvitationsSection";
import { MembersSection } from "./team/MembersSection";
import { RolesSection } from "./team/RolesSection";

/**
 * TeamGroup — owns the *single* `orgRoles.queries.list` subscription for the
 * Team settings tab and fans the result out to its three children
 * (`MembersSection`, `RolesSection`, `InviteMemberDialog`).
 *
 * Before this lift each child subscribed to the same query independently —
 * three subscriptions for the exact same role list while the tab was open
 * (per AGENTS.md "Per-row data on a list view comes from one batched
 * query"). Convex deduplicates the wire transport but each `useQuery`
 * still registers a function execution and triggers an independent
 * re-render, so hoisting saves both server calls AND React renders.
 */
export function TeamGroup({ orgId, permissions }: { orgId: Id<"orgs">; permissions: string[] }) {
	// Read the authenticated user from the shared `OrgProvider` context —
	// no extra `users.getCurrent` subscription per AGENTS.md "Identity/auth/
	// labels via context, not subscriptions".
	const me = useMe();

	// Single role-list subscription for the whole Team tab. Children read
	// from the prop, never their own `useQuery`.
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
			{isOwner && <RolesSection orgId={orgId} roles={roles} />}
		</div>
	);
}
