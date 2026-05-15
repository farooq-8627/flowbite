"use client";

import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { ShellLayout } from "@/core/shell/shared/layouts";
import {
	DEFAULT_PROFILE_GROUP,
	PROFILE_GROUPS,
	PROFILE_SECTIONS,
	type ProfileGroupId,
} from "../config/profile-sections";
import { ProfileContent } from "./ProfileContent";

/**
 * ProfileDetailView — person detail page (/profile/[personCode]).
 *
 * Architectural notes (see FRONTEND-DECISIONS.md Rule 1 & 2):
 *   - A person is one identity — lead and contact share one URL keyed by
 *     personCode. This view is NOT an entity scaffold; it is its own module.
 *   - The page uses the same shell layout as /settings (left rail + topnav
 *     pills + scroll-safe content area) because both views share the same
 *     "sections-inside-groups" interaction pattern. Layout code lives in
 *     `core/shared/layouts/` and is imported here.
 *   - Content for each group is a thin dispatcher (`ProfileContent`) that
 *     lazily pulls the right tab. Every tab is a placeholder until the
 *     respective slice of the scaffold plan is built.
 *
 * Permissions:
 *   - `deals.view` gates the Deals tab.
 *   - `reminders.view` gates the Reminders tab.
 *   - Internal notes (isInternal: true) and deal values rely on further
 *     permission checks *inside* their tabs — not at the shell level.
 */
export function ProfileDetailView({
	orgSlug,
	personCode,
}: {
	orgSlug: string;
	personCode: string;
}) {
	const orgs = useQuery(api.orgs.queries.listMyOrgs);
	const orgEntry = orgs?.find((o) => o.org.slug === orgSlug);
	const orgId = orgEntry?.org._id;

	const permissions = useQuery(api.orgRoles.queries.getMyPermissions, orgId ? { orgId } : "skip");

	const isReady = !!orgId && permissions !== undefined;

	return (
		<ShellLayout
			title="Profile"
			groups={PROFILE_GROUPS}
			sections={PROFILE_SECTIONS}
			permissions={permissions}
			defaultGroupId={DEFAULT_PROFILE_GROUP}
			searchPlaceholder="Search this profile…"
			searchAriaLabel="Search profile"
			isReady={isReady}
			renderGroup={(groupId) => (
				<ProfileContent
					activeGroup={groupId as ProfileGroupId}
					personCode={personCode}
					orgSlug={orgSlug}
					orgId={orgId}
				/>
			)}
		/>
	);
}
