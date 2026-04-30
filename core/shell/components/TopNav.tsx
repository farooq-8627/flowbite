"use client";

import Link from "next/link";
import { Bot, Globe } from "lucide-react";

import { AccountSwitcher } from "@/core/shell/components/sidebar/account-switcher";
import { LayoutControls } from "@/core/shell/components/sidebar/layout-controls";
import { SearchDialog } from "@/core/shell/components/sidebar/search-dialog";
import { ThemeSwitcher } from "@/core/shell/components/sidebar/theme-switcher";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { cn } from "@/lib/utils";

/**
 * TopNav - Top navigation bar with search, theme controls, and user menu
 * Supports sticky and scroll navbar styles via CSS data attributes
 * @param orgSlug - Organization slug for routing
 * @param onToggleChat - Callback to toggle AI chat panel
 */
export function TopNav({ orgSlug, onToggleChat }: { orgSlug: string; onToggleChat?: () => void }) {
	// Mock users - replace with actual data
	const users = [
		{
			id: "1",
			name: "User",
			email: "user@example.com",
			avatar: "",
			role: "admin",
		},
	];

	return (
		<header
			className={cn(
				"flex h-12 shrink-0 items-center gap-2 border-b transition-[width,height] ease-linear group-has-data-[collapsible=icon]/sidebar-wrapper:h-12",
				"[html[data-navbar-style=sticky]_&]:sticky [html[data-navbar-style=sticky]_&]:top-0 [html[data-navbar-style=sticky]_&]:z-50 [html[data-navbar-style=sticky]_&]:overflow-hidden [html[data-navbar-style=sticky]_&]:rounded-t-[inherit] [html[data-navbar-style=sticky]_&]:bg-background/50 [html[data-navbar-style=sticky]_&]:backdrop-blur-md",
			)}
		>
			<div className="flex w-full items-center justify-between px-4 lg:px-6">
				<div className="flex items-center gap-1 lg:gap-2">
					<SidebarTrigger className="-ml-1" />
					<Separator
						orientation="vertical"
						className="mx-2 data-[orientation=vertical]:h-4 data-[orientation=vertical]:self-center"
					/>
					<SearchDialog />
				</div>
				<div className="flex items-center gap-2">
					<LayoutControls />
					<ThemeSwitcher />
					<Button asChild size="icon">
						<Link
							prefetch={false}
							href="https://github.com/yourusername/flowbite"
							target="_blank"
							rel="noreferrer"
							aria-label="Open GitHub repository"
						>
							<Globe className="size-4" />
						</Link>
					</Button>
					<Button
						size="icon"
						variant="outline"
						onClick={onToggleChat}
						aria-label="Toggle AI Assistant"
					>
						<Bot className="size-4" />
					</Button>
					<AccountSwitcher users={users} />
				</div>
			</div>
		</header>
	);
}
