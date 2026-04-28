"use client";

import Link from "next/link";
import { Command } from "lucide-react";

import {
	Sidebar,
	SidebarContent,
	SidebarFooter,
	SidebarHeader,
	SidebarMenu,
	SidebarMenuButton,
	SidebarMenuItem,
} from "@/components/ui/sidebar";
import { APP_CONFIG } from "@/config/app-config";
import { rootUser } from "@/data/users";
import { sidebarItems } from "@/navigation/sidebar/sidebar-items";
import { usePreferencesStore } from "@/lib/stores/preferences-store";

import { NavMain } from "./nav-main";
import { NavUser } from "./nav-user";
import { SidebarSupportCard } from "./sidebar-support-card";

export function AppSidebar({
	orgSlug,
	...props
}: React.ComponentProps<typeof Sidebar> & { orgSlug?: string }) {
	const sidebar_variant = usePreferencesStore((s) => s.sidebar_variant);
	const sidebar_collapsible = usePreferencesStore((s) => s.sidebar_collapsible);

	return (
		<Sidebar {...props} variant={sidebar_variant} collapsible={sidebar_collapsible}>
			<SidebarHeader>
				<SidebarMenu>
					<SidebarMenuItem>
						<SidebarMenuButton asChild>
							<Link prefetch={false} href="/dashboard">
								<Command />
								<span className="font-semibold text-base">{APP_CONFIG.name}</span>
							</Link>
						</SidebarMenuButton>
					</SidebarMenuItem>
				</SidebarMenu>
			</SidebarHeader>
			<SidebarContent>
				<NavMain items={sidebarItems} />
			</SidebarContent>
			<SidebarFooter>
				<SidebarSupportCard />
				<NavUser user={rootUser} />
			</SidebarFooter>
		</Sidebar>
	);
}
