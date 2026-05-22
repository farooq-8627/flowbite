"use client";
import { Sidebar, SidebarContent } from "@/components/ui/sidebar";
/**
 * core/shell/shell/components/ai-chat-panel/ai-chat-panel.tsx
 *
 * Shell-level mount point for the AI chat panel.
 * Thin wrapper — all logic lives in core/ai/components/ChatSheet.tsx.
 *
 * Two variants:
 *   AIChatPanel       — Desktop sidebar slot (uses Sidebar primitives)
 *   AIChatPanelContent — Mobile Sheet content (plain div)
 */
import { ChatSheet } from "@/core/ai/components/ChatSheet";
import { usePreferencesStore } from "@/lib/stores/preferences-store";

export function AIChatPanel({ side = "right" }: { side?: "left" | "right" }) {
	const sidebar_variant = usePreferencesStore((s) => s.sidebar_variant);

	return (
		<Sidebar side={side} variant={sidebar_variant} collapsible="offcanvas">
			<SidebarContent className="p-0">
				<ChatSheet />
			</SidebarContent>
		</Sidebar>
	);
}

export function AIChatPanelContent() {
	return <ChatSheet />;
}
