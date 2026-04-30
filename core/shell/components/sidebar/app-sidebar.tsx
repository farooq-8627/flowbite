/**
 * App Sidebar Component
 * STATUS: IMPLEMENTED
 * 
 * Main navigation sidebar with org-scoped navigation items.
 * Supports dynamic variants (inset/sidebar/floating) and collapsible modes (icon/offcanvas).
 * 
 * Features:
 * - Dynamic variant based on user preferences
 * - Collapsible modes (icon/offcanvas)
 * - Org-specific navigation items
 * - Support card in footer
 * - User menu in footer
 * 
 * @see navigation/sidebar/sidebar-items.ts for nav configuration
 * @see lib/preferences/layout.ts for variant types
 * @see lib/stores/preferences-store.ts for preference management
 * 
 * @example
 * <AppSidebar orgSlug="acme" />
 */
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
