import type { Id } from "@/convex/_generated/dataModel";
import type { SettingsGroupId } from "../config/settings-nav";
import type { OrgSettings } from "../types";
import { AIGroup } from "./groups/AIGroup";
import { AppearanceGroup } from "./groups/AppearanceGroup";
import { BillingGroup } from "./groups/BillingGroup";
import { CRMGroup } from "./groups/CRMGroup";
import { DataGroup } from "./groups/DataGroup";
import { ModulesGroup } from "./groups/modules";
import { NotificationsGroup } from "./groups/NotificationsGroup";
import { ShortcutsGroup } from "./groups/ShortcutsGroup";
import { TeamGroup } from "./groups/TeamGroup";
import { WorkspaceGroup } from "./groups/WorkspaceGroup";

type Props = {
	activeGroup: SettingsGroupId;
	org: OrgSettings;
	orgId: Id<"orgs">;
	permissions: string[];
};

/**
 * SettingsContent — dispatches to the correct group component.
 *
 * The scroll container, search filtering, and toolbar are provided by the
 * shared ShellLayout one level up. This component is intentionally small: the
 * active group decides what renders, everything else is the shell's concern.
 *
 * Search mode is handled by ShellLayout (wraps children in SearchFilterProvider
 * and calls `renderGroup` once per matching group). Individual <SettingsSection>
 * cards read that context and hide themselves if they don't match — so search
 * filtering here is automatic and invisible.
 */
export function SettingsContent({ activeGroup, org, orgId, permissions }: Props) {
	switch (activeGroup) {
		case "workspace":
			return <WorkspaceGroup org={org} orgId={orgId} />;
		case "team":
			return <TeamGroup orgId={orgId} permissions={permissions} />;
		case "modules":
			return <ModulesGroup org={org} orgId={orgId} />;
		case "crm":
			return <CRMGroup org={org} orgId={orgId} />;
		case "ai":
			return <AIGroup org={org} orgId={orgId} />;
		case "appearance":
			return <AppearanceGroup />;
		case "notifications":
			return <NotificationsGroup org={org} />;
		case "shortcuts":
			return <ShortcutsGroup />;
		case "billing":
			return <BillingGroup org={org} orgId={orgId} />;
		case "data":
			return <DataGroup org={org} orgId={orgId} permissions={permissions} />;
		default:
			return null;
	}
}
