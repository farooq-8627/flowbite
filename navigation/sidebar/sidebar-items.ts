/**
 * Sidebar navigation items configuration
 */

import {
	LayoutDashboard,
	Users,
	Settings,
	FileText,
	FolderKanban,
	type LucideIcon,
} from "lucide-react";

export interface NavMainItem {
	title: string;
	url: string;
	icon?: LucideIcon;
	newTab?: boolean;
	comingSoon?: boolean;
	subItems?: NavMainItem[];
}

export interface NavGroup {
	id: string;
	label?: string;
	items: NavMainItem[];
}

export const sidebarItems: NavGroup[] = [
	{
		id: "main",
		label: "Main",
		items: [
			{
				title: "Dashboard",
				url: "/dashboard",
				icon: LayoutDashboard,
			},
			{
				title: "Projects",
				url: "/projects",
				icon: FolderKanban,
			},
		],
	},
	{
		id: "management",
		label: "Management",
		items: [
			{
				title: "Users",
				url: "/users",
				icon: Users,
			},
			{
				title: "Documents",
				url: "/documents",
				icon: FileText,
			},
		],
	},
	{
		id: "system",
		label: "System",
		items: [
			{
				title: "Settings",
				url: "/settings",
				icon: Settings,
			},
		],
	},
];
