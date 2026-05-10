"use client";

import type { SettingsGroupId } from "../config/settings-nav";
import type { Id } from "@/convex/_generated/dataModel";
import type { OrgSettings } from "../types";

import { WorkspaceGroup }     from "./groups/WorkspaceGroup";
import { AppearanceGroup }    from "./groups/AppearanceGroup";
import { NotificationsGroup } from "./groups/NotificationsGroup";
import { ShortcutsGroup }     from "./groups/ShortcutsGroup";

type Props = {
	activeGroup:    SettingsGroupId;
	activeSubGroup: string | null;
	org:            OrgSettings;
	orgId:          Id<"orgs">;
	permissions:    string[];
};

export function SettingsContent({ activeGroup, org, orgId }: Props) {
	return (
		<main className="flex-1 overflow-y-auto p-6 bg-sidebar rounded-[var(--radius)]">
			<div className="max-w-full space-y-6">
				{activeGroup === "workspace"     && <WorkspaceGroup org={org} orgId={orgId} />}
				{activeGroup === "appearance"    && <AppearanceGroup />}
				{activeGroup === "notifications" && <NotificationsGroup org={org} />}
				{activeGroup === "shortcuts"     && <ShortcutsGroup />}

				{!["workspace", "appearance", "notifications", "shortcuts"].includes(activeGroup) && (
					<div className="rounded-[var(--radius)] border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
						Coming soon
					</div>
				)}
			</div>
		</main>
	);
}
