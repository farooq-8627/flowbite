"use client";

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

type Props = {
	activeGroup: SettingsGroupId;
	activeSubGroup: string | null;
	org: OrgSettings;
	orgId: Id<"orgs">;
	permissions: string[];
};

export function SettingsContent({ activeGroup, org, orgId, permissions }: Props) {
	return (
		<main className="flex-1 overflow-y-auto p-6 bg-sidebar rounded-[var(--radius)]">
			<div className="max-w-full space-y-6">
				{activeGroup === "workspace"     && <WorkspaceGroup     org={org} orgId={orgId} />}
				{activeGroup === "team"          && <TeamGroup          orgId={orgId} permissions={permissions} />}
				{activeGroup === "crm"           && <CRMGroup           org={org} orgId={orgId} />}
				{activeGroup === "ai"            && <AIGroup            org={org} orgId={orgId} />}
				{activeGroup === "appearance"    && <AppearanceGroup    />}
				{activeGroup === "notifications" && <NotificationsGroup org={org} />}
				{activeGroup === "shortcuts"     && <ShortcutsGroup     />}
				{activeGroup === "billing"       && <BillingGroup       org={org} orgId={orgId} />}
				{activeGroup === "data"          && <DataGroup          org={org} orgId={orgId} permissions={permissions} />}
			</div>
		</main>
	);
}
