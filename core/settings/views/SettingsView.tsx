"use client";

import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { ShellLayout } from "@/core/shared/layouts";
import type { ShellGroup, ShellSection } from "@/core/shared/layouts";
import { SettingsContent } from "../components/SettingsContent";
import {
	DEFAULT_GROUP,
	SETTINGS_GROUPS,
	type SettingsGroupId,
} from "../config/settings-nav";
import { SETTINGS_SECTIONS } from "../config/settings-sections";
import type { OrgSettings } from "../types";

/**
 * SettingsView — org Settings page.
 *
 * Data flow:
 *   1. Resolve orgSlug → orgId via listMyOrgs.
 *   2. Fetch org-wide settings + current user's permissions.
 *   3. Hand everything off to the generic ShellLayout — the layout takes care
 *      of the left rail, topnav pill toolbar, mobile sheet, scrollspy, search
 *      filtering, URL query-param persistence, and scroll-without-layout-shift.
 *
 * Adding a new settings group means:
 *   - Add a row to SETTINGS_GROUPS (core/settings/config/settings-nav.ts)
 *   - Add its sections to SETTINGS_SECTIONS (core/settings/config/settings-sections.ts)
 *   - Add a new <Group /> component case to SettingsContent's renderGroup switch.
 * No changes here.
 *
 * UI is identical to the pre-extraction implementation — the shell scaffolding
 * is now shared with /profile/[personCode].
 */
export function SettingsView({ orgSlug }: { orgSlug: string }) {
	const orgs = useQuery(api.orgs.queries.listMyOrgs);
	const orgEntry = orgs?.find((o) => o.org.slug === orgSlug);
	const orgId = orgEntry?.org._id;

	const settings = useQuery(
		api.orgs.queries.getFullSettings,
		orgId ? { orgId } : "skip",
	);
	const permissions = useQuery(
		api.orgRoles.queries.getMyPermissions,
		orgId ? { orgId } : "skip",
	);

	const isReady = !!orgId && settings !== undefined && permissions !== undefined;

	if (isReady && !settings) {
		return (
			<div className="flex h-full items-center justify-center text-sm text-muted-foreground">
				Organization not found.
			</div>
		);
	}

	return (
		<ShellLayout
			title="Settings"
			groups={SETTINGS_GROUPS as ShellGroup[]}
			sections={SETTINGS_SECTIONS as ShellSection[]}
			permissions={permissions}
			defaultGroupId={DEFAULT_GROUP}
			searchPlaceholder="Search settings…"
			searchAriaLabel="Search settings"
			isReady={isReady}
			renderGroup={(groupId) =>
				settings && permissions && orgId ? (
					<SettingsContent
						activeGroup={groupId as SettingsGroupId}
						org={settings as OrgSettings}
						orgId={orgId as Id<"orgs">}
						permissions={permissions}
					/>
				) : null
			}
		/>
	);
}
