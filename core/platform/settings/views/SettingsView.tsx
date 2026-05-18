"use client";

import { useQuery } from "convex/react";
import { useMemo } from "react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { useCurrentOrg } from "@/core/shell/shared/hooks/useCurrentOrg";
import { useEntityLabels } from "@/core/shell/shared/hooks/useEntityLabels";
import type { ShellGroup, ShellSection } from "@/core/shell/shared/layouts";
import { ShellLayout } from "@/core/shell/shared/layouts";
import { SettingsContent } from "../components/SettingsContent";
import { DEFAULT_GROUP, getSettingsGroups, type SettingsGroupId } from "../config/settings-nav";
import { getSettingsSections } from "../config/settings-sections";
import type { OrgSettings } from "../types";

/**
 * SettingsView — org Settings page.
 *
 * Data flow:
 *   1. Resolve orgId via the shared `OrgProvider` context — no extra
 *      `listMyOrgs` subscription (per AGENTS.md "Identity/auth/labels via
 *      context, not subscriptions").
 *   2. Fetch org-wide settings + current user's permissions.
 *   3. Pull entity labels via `useEntityLabels()` so every section
 *      description + search keyword reflects the admin's rename choices
 *      (Lead → Inquiry, Company → Venue, …) instantly. The hook auto-detects
 *      the OrgProvider context too — no extra `getEntityLabels` subscription.
 *   4. Hand everything off to the generic ShellLayout — the layout takes care
 *      of the left rail, topnav pill toolbar, mobile sheet, scrollspy, search
 *      filtering, URL query-param persistence, and scroll-without-layout-shift.
 *
 * Adding a new settings group:
 *   - Add a row to SETTINGS_GROUPS (core/settings/config/settings-nav.ts)
 *   - Add its sections to `getSettingsSections()` (core/settings/config/settings-sections.ts)
 *   - Add a new <Group /> component case to SettingsContent's renderGroup switch.
 * No changes here.
 */
export function SettingsView({ orgSlug: _orgSlug }: { orgSlug: string }) {
	const { orgId } = useCurrentOrg();

	const settings = useQuery(api.orgs.queries.getFullSettings, orgId ? { orgId } : "skip");
	const permissions = useQuery(api.orgRoles.queries.getMyPermissions, orgId ? { orgId } : "skip");

	// Entity labels drive section descriptions + search keywords. When the
	// admin renames "Lead" → "Inquiry", Convex reactivity flows through here
	// and the toolbar pills, mobile sheet, and search index all update.
	const labels = useEntityLabels();
	const dynamicSections = useMemo(() => getSettingsSections(labels), [labels]);
	const dynamicGroups = useMemo(() => getSettingsGroups(labels), [labels]);

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
			groups={dynamicGroups as ShellGroup[]}
			sections={dynamicSections as ShellSection[]}
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
