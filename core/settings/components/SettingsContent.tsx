"use client";

import { useMemo } from "react";
import type { SettingsGroupId } from "../config/settings-nav";
import type { Id } from "@/convex/_generated/dataModel";
import type { OrgSettings } from "../types";

import { WorkspaceGroup } from "./groups/WorkspaceGroup";
import { AppearanceGroup } from "./groups/AppearanceGroup";
import { NotificationsGroup } from "./groups/NotificationsGroup";
import { ShortcutsGroup } from "./groups/ShortcutsGroup";
import { TeamGroup } from "./groups/TeamGroup";
import { CRMGroup } from "./groups/CRMGroup";
import { AIGroup } from "./groups/AIGroup";
import { BillingGroup } from "./groups/BillingGroup";
import { DataGroup } from "./groups/DataGroup";

import { useSettingsSearch } from "../hooks/useSettingsSearch";
import { SearchFilterProvider } from "../context/search-filter";

type Props = {
	activeGroup: SettingsGroupId;
	activeSubGroup: string | null;
	org: OrgSettings;
	orgId: Id<"orgs">;
	permissions: string[];
	query: string;
};

/** Factory for each group component — avoids a switch inside the render. */
function renderGroup(
	id: SettingsGroupId,
	props: { org: OrgSettings; orgId: Id<"orgs">; permissions: string[] },
) {
	const { org, orgId, permissions } = props;
	switch (id) {
		case "workspace":     return <WorkspaceGroup     org={org} orgId={orgId} />;
		case "team":          return <TeamGroup          orgId={orgId} permissions={permissions} />;
		case "crm":           return <CRMGroup           org={org} orgId={orgId} />;
		case "ai":            return <AIGroup            org={org} orgId={orgId} />;
		case "appearance":    return <AppearanceGroup    />;
		case "notifications": return <NotificationsGroup org={org} />;
		case "shortcuts":     return <ShortcutsGroup     />;
		case "billing":       return <BillingGroup       org={org} orgId={orgId} />;
		case "data":          return <DataGroup          org={org} orgId={orgId} permissions={permissions} />;
		default:              return null;
	}
}

export function SettingsContent({ activeGroup, org, orgId, permissions, query }: Props) {
	const isSearching = query.trim().length > 0;
	const hits = useSettingsSearch(query, permissions);

	// Groups that have at least one matching section, in rank order (first hit per group).
	const { matchingIds, groupOrder } = useMemo(() => {
		const ids = new Set<string>();
		const seenGroups = new Set<SettingsGroupId>();
		const order: SettingsGroupId[] = [];
		for (const hit of hits) {
			ids.add(hit.id);
			const gid = hit.groupId as SettingsGroupId;
			if (!seenGroups.has(gid)) {
				seenGroups.add(gid);
				order.push(gid);
			}
		}
		return { matchingIds: ids, groupOrder: order };
	}, [hits]);

	return (
		<main className="flex-1 overflow-y-auto p-4 md:p-6 bg-sidebar rounded-[var(--radius)]">
			<div className="max-w-full space-y-6">
				{isSearching ? (
					hits.length === 0 ? (
						<div className="flex flex-col items-center justify-center gap-2 rounded-[var(--radius)] border border-dashed py-16 text-center">
							<p className="text-sm font-medium">No settings match “{query}”.</p>
							<p className="text-xs text-muted-foreground">
								Try a different word, or clear the search to see everything.
							</p>
						</div>
					) : (
						<>
							<div className="px-1 text-xs text-muted-foreground">
								{hits.length} {hits.length === 1 ? "result" : "results"} for “{query}”
							</div>
							<SearchFilterProvider matchingIds={matchingIds}>
								<div className="space-y-6">
									{groupOrder.map((gid) => (
										<div key={gid}>{renderGroup(gid, { org, orgId, permissions })}</div>
									))}
								</div>
							</SearchFilterProvider>
						</>
					)
				) : (
					renderGroup(activeGroup, { org, orgId, permissions })
				)}
			</div>
		</main>
	);
}
