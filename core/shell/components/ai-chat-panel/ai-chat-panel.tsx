"use client";

import { Bot, Send } from "lucide-react";
import {
	Sidebar,
	SidebarContent,
	SidebarFooter,
	SidebarHeader,
	SidebarMenu,
	SidebarMenuButton,
	SidebarMenuItem,
} from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { usePreferencesStore } from "@/lib/stores/preferences-store";

/**
 * AIChatPanel - Right sidebar AI assistant panel for desktop
 * Uses Sidebar primitives and adapts to user's sidebar variant preference
 */
export function AIChatPanel() {
	const sidebar_variant = usePreferencesStore((s) => s.sidebar_variant);

	return (
		<Sidebar side="right" variant={sidebar_variant} collapsible="offcanvas">
			<SidebarHeader>
				<SidebarMenu>
					<SidebarMenuItem>
						<SidebarMenuButton>
							<Bot />
							<span className="font-semibold text-base">AI Assistant</span>
						</SidebarMenuButton>
					</SidebarMenuItem>
				</SidebarMenu>
			</SidebarHeader>
			<SidebarContent>
				<ScrollArea className="flex-1 p-4">
					<div className="space-y-4">
						<div className="flex items-start gap-3">
							<div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary">
								<Bot className="size-4 text-primary-foreground" />
							</div>
							<p className="flex-1 text-sm">
								Hello! I'm your AI assistant. How can I help you today?
							</p>
						</div>
					</div>
				</ScrollArea>
			</SidebarContent>
			<SidebarFooter>
				<div className="flex gap-2 p-2">
					<Input placeholder="Ask me anything..." className="flex-1" />
					<Button size="icon">
						<Send className="size-4" />
					</Button>
				</div>
			</SidebarFooter>
		</Sidebar>
	);
}

/**
 * AIChatPanelContent - Standalone chat panel content for mobile/tablet Sheet
 * Does not use Sidebar primitives to avoid conflicts with Sheet component
 */
export function AIChatPanelContent() {
	return (
		<div className="flex h-full flex-col bg-sidebar text-sidebar-foreground">
			<div className="flex items-center gap-2 border-b border-sidebar-border p-4 shrink-0">
				<Bot className="size-4" />
				<span className="font-semibold text-base">AI Assistant</span>
			</div>
			<ScrollArea className="flex-1 p-4">
				<div className="space-y-4">
					<div className="flex items-start gap-3">
						<div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary">
							<Bot className="size-4 text-primary-foreground" />
						</div>
						<p className="flex-1 text-sm">
							Hello! I'm your AI assistant. How can I help you today?
						</p>
					</div>
				</div>
			</ScrollArea>
			<div className="border-t border-sidebar-border p-4 shrink-0">
				<div className="flex gap-2">
					<Input placeholder="Ask me anything..." className="flex-1" />
					<Button size="icon">
						<Send className="size-4" />
					</Button>
				</div>
			</div>
		</div>
	);
}
