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

export function AIChatPanel() {
	const sidebar_variant = usePreferencesStore((s) => s.sidebar_variant);
	const sidebar_collapsible = usePreferencesStore((s) => s.sidebar_collapsible);

	return (
		<Sidebar side="right" variant={sidebar_variant} collapsible={sidebar_collapsible}>
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
