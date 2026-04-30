/**
 * Nav Secondary Component
 * STATUS: IMPLEMENTED
 * 
 * Renders secondary navigation items in the sidebar (e.g., settings, help, support).
 * Simpler than NavMain - no nesting or collapsible sections.
 * 
 * Features:
 * - Flat navigation structure
 * - Icon support
 * - Active state highlighting
 * 
 * @see navigation/sidebar/sidebar-items.ts for nav structure
 * 
 * @example
 * <NavSecondary items={secondaryItems} />
 */
"use client";

import type * as React from "react";

import type { LucideIcon } from "lucide-react";

import {
	SidebarGroup,
	SidebarGroupContent,
	SidebarMenu,
	SidebarMenuButton,
	SidebarMenuItem,
} from "@/components/ui/sidebar";

export function NavSecondary({
	items,
	...props
}: {
	items: {
		title: string;
		url: string;
		icon: LucideIcon;
	}[];
} & React.ComponentPropsWithoutRef<typeof SidebarGroup>) {
	return (
		<SidebarGroup {...props}>
			<SidebarGroupContent>
				<SidebarMenu>
					{items.map((item) => (
						<SidebarMenuItem key={item.title}>
							<SidebarMenuButton asChild>
								<a href={item.url}>
									<item.icon />
									<span>{item.title}</span>
								</a>
							</SidebarMenuButton>
						</SidebarMenuItem>
					))}
				</SidebarMenu>
			</SidebarGroupContent>
		</SidebarGroup>
	);
}
