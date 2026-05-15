import type { LucideIcon } from "lucide-react";
import {
	BarChart2,
	Bell,
	BellRing,
	Bot,
	Brain,
	Building2,
	CreditCard,
	Database,
	Keyboard,
	LayoutDashboard,
	LayoutList,
	Lock,
	Mail,
	MousePointer,
	Palette,
	Receipt,
	Settings,
	Shield,
	Sparkles,
	Sun,
	Tag,
	Target,
	UserCog,
	Users,
	Workflow,
} from "lucide-react";
import {
	ENTITY_LABEL_DEFAULTS,
	type EntityLabels,
} from "@/core/shell/shared/hooks/useEntityLabels";

export type SettingsSubGroup = {
	id: string;
	label: string;
	icon: LucideIcon;
	description: string;
};

export type SettingsGroup = {
	id: string;
	label: string;
	icon: LucideIcon;
	permission?: string;
	ownerOnly?: boolean;
	subGroups: SettingsSubGroup[];
};

/**
 * Build the settings-groups tree using the current entity labels.
 *
 * Pass the output of `useEntityLabels()` so sub-group labels and descriptions
 * under the **Modules** group reflect admin renames. The rest of the tree is
 * static — only Modules changes with entity labels.
 *
 * Called with no arguments → returns groups using English defaults (same
 * shape as the static `SETTINGS_GROUPS` export, for non-reactive callers
 * and backwards compatibility).
 */
export function getSettingsGroups(labels: EntityLabels = ENTITY_LABEL_DEFAULTS): SettingsGroup[] {
	return [
		{
			id: "workspace",
			label: "Workspace",
			icon: Settings,
			permission: "org.viewSettings",
			subGroups: [
				{
					id: "workspace.general",
					label: "General",
					icon: Building2,
					description: "Organization name, logo, and basic info",
				},
				{
					id: "workspace.roles",
					label: "Roles",
					icon: Shield,
					description: "Manage roles and permission sets",
				},
				{
					id: "workspace.profile",
					label: "Your Profile",
					icon: UserCog,
					description: "Your personal name, avatar, and preferences",
				},
			],
		},
		{
			id: "team",
			label: "Team",
			icon: Users,
			permission: "members.view",
			subGroups: [
				{
					id: "team.members",
					label: "Members",
					icon: Users,
					description: "Invite and manage workspace members",
				},
				{
					id: "team.invitations",
					label: "Invitations",
					icon: Mail,
					description: "Pending and sent invitations",
				},
			],
		},
		{
			id: "modules",
			label: "Modules",
			icon: LayoutList,
			permission: "org.viewSettings",
			subGroups: [
				{
					id: "modules.lead",
					label: labels.lead.plural,
					icon: Target,
					description: `Display, custom fields, and pipelines for ${labels.lead.plural.toLowerCase()}`,
				},
				{
					id: "modules.contact",
					label: labels.contact.plural,
					icon: Users,
					description: `Display and custom fields for ${labels.contact.plural.toLowerCase()}`,
				},
				{
					id: "modules.deal",
					label: labels.deal.plural,
					icon: Workflow,
					description: `Display, custom fields, and pipelines for ${labels.deal.plural.toLowerCase()}`,
				},
				{
					id: "modules.company",
					label: labels.company.plural,
					icon: Building2,
					description: `Display and custom fields for ${labels.company.plural.toLowerCase()}`,
				},
			],
		},
		{
			id: "crm",
			label: "CRM",
			icon: Target,
			permission: "pipelines.view",
			subGroups: [
				{
					id: "crm.tags",
					label: "Tags",
					icon: Tag,
					description: "Manage tags used across CRM records",
				},
			],
		},
		{
			id: "ai",
			label: "AI",
			icon: Bot,
			permission: "ai.viewHistory",
			subGroups: [
				{
					id: "ai.context",
					label: "AI Context",
					icon: Brain,
					description: "Business context fed to the AI assistant",
				},
				{
					id: "ai.features",
					label: "AI Features",
					icon: Sparkles,
					description: "Enable or disable AI-powered features",
				},
			],
		},
		{
			id: "appearance",
			label: "Appearance",
			icon: Palette,
			subGroups: [
				{
					id: "appearance.theme",
					label: "Theme",
					icon: Sun,
					description: "Color theme and dark/light mode",
				},
				{
					id: "appearance.layout",
					label: "Layout",
					icon: LayoutDashboard,
					description: "Sidebar style, density, and radius",
				},
			],
		},
		{
			id: "notifications",
			label: "Notifications",
			icon: BellRing,
			subGroups: [
				{
					id: "notifications.in_app",
					label: "In-App",
					icon: Bell,
					description: "Notification preferences inside the app",
				},
				{
					id: "notifications.email",
					label: "Email",
					icon: Mail,
					description: "Email digest and alert settings",
				},
			],
		},
		{
			id: "shortcuts",
			label: "Shortcuts",
			icon: Keyboard,
			subGroups: [
				{
					id: "shortcuts.reference",
					label: "Reference",
					icon: MousePointer,
					description: "All keyboard shortcuts in one place",
				},
			],
		},
		{
			id: "billing",
			label: "Billing",
			icon: CreditCard,
			ownerOnly: true,
			subGroups: [
				{
					id: "billing.plan",
					label: "Plan",
					icon: Receipt,
					description: "Current plan, usage, and upgrades",
				},
				{
					id: "billing.invoices",
					label: "Invoices",
					icon: BarChart2,
					description: "Past invoices and payment history",
				},
			],
		},
		{
			id: "data",
			label: "Data & Security",
			icon: Database,
			permission: "org.viewSettings",
			subGroups: [
				{
					id: "data.export",
					label: "Export",
					icon: Database,
					description: "Export your CRM data as CSV or JSON",
				},
				{
					id: "data.security",
					label: "Security",
					icon: Lock,
					description: "Two-factor auth and session management",
				},
			],
		},
	];
}

export const SETTINGS_GROUPS: SettingsGroup[] = getSettingsGroups();

export type SettingsGroupId =
	| "workspace"
	| "team"
	| "modules"
	| "crm"
	| "ai"
	| "appearance"
	| "notifications"
	| "shortcuts"
	| "billing"
	| "data";

export const DEFAULT_GROUP: SettingsGroupId = "workspace";
