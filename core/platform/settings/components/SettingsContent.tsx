import { PermissionGate } from "@/components/rbac/PermissionGate";
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
 * Defense-in-depth: admin-only groups are wrapped in `<PermissionGate>` so
 * even if a user navigates directly to `?group=workspace` via URL, the
 * content won't render without the required permission. This supplements
 * the group-level filtering in ShellLayout (which hides the nav item).
 *
 * NOTE: There is no longer a top-level `notes` group — Note Categories,
 * Reminders, Follow-ups, and Timeline live inside the CRM group as tabs
 * (see CRMGroup.tsx). Section ids preserve their `notes.*` prefix so
 * deep-links and search keywords stay stable.
 */
export function SettingsContent({ activeGroup, org, orgId, permissions }: Props) {
	switch (activeGroup) {
		case "workspace":
			return (
				<PermissionGate orgId={orgId} permission="org.editSettings">
					<WorkspaceGroup org={org} orgId={orgId} />
				</PermissionGate>
			);
		case "team":
			return (
				<PermissionGate orgId={orgId} permission="members.view">
					<TeamGroup orgId={orgId} permissions={permissions} />
				</PermissionGate>
			);
		case "modules":
			return (
				<PermissionGate orgId={orgId} permission="org.editSettings">
					<ModulesGroup org={org} orgId={orgId} />
				</PermissionGate>
			);
		case "crm":
			return (
				<PermissionGate orgId={orgId} permission="pipelines.manage">
					<CRMGroup org={org} orgId={orgId} />
				</PermissionGate>
			);
		case "ai":
			return (
				<PermissionGate orgId={orgId} permission="ai.manageTools">
					<AIGroup org={org} orgId={orgId} />
				</PermissionGate>
			);
		case "appearance":
			return <AppearanceGroup />;
		case "notifications":
			return <NotificationsGroup org={org} />;
		case "shortcuts":
			return <ShortcutsGroup />;
		case "billing":
			return (
				<PermissionGate orgId={orgId} permission="org.viewBilling">
					<BillingGroup org={org} orgId={orgId} />
				</PermissionGate>
			);
		case "data":
			return (
				<PermissionGate orgId={orgId} permission="org.editSettings">
					<DataGroup org={org} orgId={orgId} permissions={permissions} />
				</PermissionGate>
			);
		default:
			return null;
	}
}
