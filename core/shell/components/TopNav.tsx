"use client";

import { useEffect } from "react";
import { Bell, Bot, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { ThemeSwitcher } from "@/core/shell/components/sidebar/theme-switcher";
import { cn } from "@/lib/utils";

/**
 * TopNav — Minimal top navigation bar.
 *
 * Left: sidebar trigger + separator + page-specific slot (breadcrumbs, tabs, filters)
 * Right: search (⌘J) + notification bell + theme switcher + AI chat toggle (⌘.)
 *
 * Page-specific content is passed via `children` prop from each page layout.
 */
export function TopNav({
	onToggleChat,
	onToggleSearch,
	children,
}: {
	onToggleChat?: () => void;
	onToggleSearch?: () => void;
	children?: React.ReactNode;
}) {
	// Keyboard shortcuts
	useEffect(() => {
		function handleKeyDown(e: KeyboardEvent) {
			if ((e.metaKey || e.ctrlKey) && e.key === ".") {
				e.preventDefault();
				onToggleChat?.();
			}
			if ((e.metaKey || e.ctrlKey) && e.key === "j") {
				e.preventDefault();
				onToggleSearch?.();
			}
		}
		document.addEventListener("keydown", handleKeyDown);
		return () => document.removeEventListener("keydown", handleKeyDown);
	}, [onToggleChat, onToggleSearch]);

	return (
		<header
			className={cn(
				"flex h-12 shrink-0 items-center gap-2 border-b rounded-t-[var(--radius)] transition-[width,height] ease-linear group-has-data-[collapsible=icon]/sidebar-wrapper:h-12",
				"[html[data-navbar-style=sticky]_&]:sticky [html[data-navbar-style=sticky]_&]:top-0 [html[data-navbar-style=sticky]_&]:z-50 [html[data-navbar-style=sticky]_&]:bg-background/80 [html[data-navbar-style=sticky]_&]:backdrop-blur-md",
			)}
		>
			<div className="flex w-full items-center justify-between px-4 lg:px-6">
				{/* Left: sidebar trigger + page content */}
				<div className="flex items-center gap-1 lg:gap-2">
					<SidebarTrigger className="-ms-1" />
					{children}
				</div>

				{/* Right: search + bell + theme + AI */}
				<div className="flex items-center gap-1">
					{/* Search button: icon + ⌘J hint */}
					<Button
						size="sm"
						variant="ghost"
						onClick={onToggleSearch}
						aria-label="Search (⌘J)"
						className="flex items-center gap-1.5 px-2 text-muted-foreground hover:text-foreground"
					>
						<Search className="size-4" />
						<span className="hidden items-center gap-0.5 text-xs sm:flex">
							<kbd className="rounded-[--radius] border border-border bg-muted px-1 py-0.5 font-mono text-[10px] leading-none">⌘</kbd>
							<kbd className="rounded-[--radius] border border-border bg-muted px-1 py-0.5 font-mono text-[10px] leading-none">J</kbd>
						</span>
					</Button>

					<Separator orientation="vertical" className="h-4" />

					{/* Notification bell */}
					<Button size="icon" variant="ghost" aria-label="Notifications" className="relative">
						<Bell className="size-4" />
						{/* TODO: Wire to real notification count query */}
						<span className="absolute top-1.5 end-1.5 size-2 rounded-full bg-destructive" />
					</Button>

					{/* Theme switcher */}
					<ThemeSwitcher variant="button" />

					{/* AI chat toggle */}
					<Button
						size="icon"
						variant="ghost"
						onClick={onToggleChat}
						aria-label="Toggle AI Assistant (⌘.)"
						title="AI Assistant (⌘.)"
					>
						<Bot className="size-4" />
					</Button>
				</div>
			</div>
		</header>
	);
}
