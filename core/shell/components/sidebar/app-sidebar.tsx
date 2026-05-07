"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LifeBuoy, BookOpen } from "lucide-react";

import {
	Sidebar,
	SidebarContent,
	SidebarFooter,
	SidebarGroup,
	SidebarGroupContent,
	SidebarGroupLabel,
	SidebarHeader,
	SidebarMenu,
	SidebarMenuButton,
	SidebarMenuItem,
} from "@/components/ui/sidebar";
import { usePreferencesStore } from "@/lib/stores/preferences-store";
import { buildNavigation, DEFAULT_MODULES, type NavGroup } from "@/core/shell/config/navigation";
import { NavUser } from "./nav-user";
import { WorkspaceSwitcher } from "./workspace-switcher";

/**
 * AppSidebar — Dynamic, workspace-driven sidebar navigation.
 *
 * Structure:
 * - Header: App logo + name
 * - Content: Dynamic CRM nav groups (from org module config)
 * - Footer: Support card → User menu (Settings + Theme are in TopNav/NavUser dropdown)
 */
export function AppSidebar({
	orgSlug,
	...props
}: React.ComponentProps<typeof Sidebar> & { orgSlug?: string }) {
	const sidebar_variant = usePreferencesStore((s) => s.sidebar_variant);
	const sidebar_collapsible = usePreferencesStore((s) => s.sidebar_collapsible);
	const pathname = usePathname();

	// TODO: Replace DEFAULT_MODULES with org's module config from Convex query
	const navGroups = buildNavigation(orgSlug ?? "", DEFAULT_MODULES);

	return (
		<Sidebar {...props} variant={sidebar_variant} collapsible={sidebar_collapsible}>
			<SidebarHeader className="py-2">
				<WorkspaceSwitcher currentOrgSlug={orgSlug ?? ""} />
			</SidebarHeader>

			<SidebarContent className="gap-0">
				{navGroups.map((group) => (
					<NavGroupSection
						key={group.id}
						group={group}
						pathname={pathname}
					/>
				))}
			</SidebarContent>

			<SidebarFooter className="py-2">
				<SidebarSupportCard />
				<NavUser orgSlug={orgSlug} />
			</SidebarFooter>
		</Sidebar>
	);
}

// ─── Support Card ─────────────────────────────────────────────────────────────

function SidebarSupportCard() {
	return (
		<SidebarGroup>
			<SidebarGroupContent>
				<SidebarMenu>
					<SidebarMenuItem>
						<SidebarMenuButton asChild tooltip="Documentation" className="h-8">
							<a href="https://docs.orbitly.app" target="_blank" rel="noopener noreferrer">
								<BookOpen />
								<span>Documentation</span>
							</a>
						</SidebarMenuButton>
					</SidebarMenuItem>
					<SidebarMenuItem>
						<SidebarMenuButton asChild tooltip="Support" className="h-8">
							<a href="mailto:support@orbitly.app">
								<LifeBuoy />
								<span>Support</span>
							</a>
						</SidebarMenuButton>
					</SidebarMenuItem>
				</SidebarMenu>
			</SidebarGroupContent>
		</SidebarGroup>
	);
}

// ─── Nav Group Section ────────────────────────────────────────────────────────

function NavGroupSection({
	group,
	pathname,
}: {
	group: NavGroup;
	pathname: string;
}) {
	return (
		<SidebarGroup className="py-1">
			{group.label && <SidebarGroupLabel className="h-6 px-2">{group.label}</SidebarGroupLabel>}
			<SidebarGroupContent>
				<SidebarMenu>
					{group.items.map((item) => (
						<SidebarMenuItem key={item.url}>
							<SidebarMenuButton
								asChild
								isActive={
									item.url === pathname ||
									(item.url !== `/dashboard/` && pathname.startsWith(item.url + "/"))
								}
								tooltip={item.title}
								className="h-8"
							>
								<Link prefetch={false} href={item.url}>
									<item.icon />
									<span>{item.title}</span>
								</Link>
							</SidebarMenuButton>
						</SidebarMenuItem>
					))}
				</SidebarMenu>
			</SidebarGroupContent>
		</SidebarGroup>
	);
}
