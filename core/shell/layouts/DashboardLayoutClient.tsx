"use client";

import { useState, useCallback, useRef } from "react";
import { GripVertical } from "lucide-react";
import { AppSidebar } from "@/core/shell/components/sidebar/app-sidebar";
import { AIChatPanel } from "@/core/shell/components/ai-chat-panel/ai-chat-panel";
import { TopNav } from "@/core/shell/components/TopNav";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import type { SidebarCollapsible, SidebarVariant } from "@/lib/preferences/layout";

const CHAT_MIN_WIDTH = 280;
const CHAT_MAX_WIDTH = 600;
const CHAT_DEFAULT_WIDTH = 360;

export function DashboardLayoutClient({
	children,
	orgSlug,
	variant,
	collapsible,
	initialSidebarOpen,
	initialChatOpen,
}: {
	children: React.ReactNode;
	orgSlug: string;
	variant: SidebarVariant;
	collapsible: SidebarCollapsible;
	initialSidebarOpen: boolean;
	initialChatOpen: boolean;
}) {
	const [chatOpen, setChatOpen] = useState(initialChatOpen);
	const [chatWidth, setChatWidth] = useState(CHAT_DEFAULT_WIDTH);
	const [isDragging, setIsDragging] = useState(false);
	const startX = useRef(0);
	const startWidth = useRef(0);

	const toggleChat = () => {
		const newState = !chatOpen;
		setChatOpen(newState);
		document.cookie = `chat_panel_state=${newState}; path=/; max-age=31536000`;
	};

	const onMouseDown = useCallback((e: React.MouseEvent) => {
		e.preventDefault();
		startX.current = e.clientX;
		startWidth.current = chatWidth;
		setIsDragging(true);

		const onMouseMove = (e: MouseEvent) => {
			const delta = startX.current - e.clientX;
			const newWidth = Math.min(CHAT_MAX_WIDTH, Math.max(CHAT_MIN_WIDTH, startWidth.current + delta));
			setChatWidth(newWidth);
		};

		const onMouseUp = () => {
			setIsDragging(false);
			document.removeEventListener("mousemove", onMouseMove);
			document.removeEventListener("mouseup", onMouseUp);
			document.body.style.cursor = "";
			document.body.style.userSelect = "";
		};

		document.body.style.cursor = "col-resize";
		document.body.style.userSelect = "none";
		document.addEventListener("mousemove", onMouseMove);
		document.addEventListener("mouseup", onMouseUp);
	}, [chatWidth]);

	return (
		<div className="flex h-screen w-full">
			{/* Left Sidebar */}
			<SidebarProvider
				defaultOpen={initialSidebarOpen}
				style={{ "--sidebar-width": "16rem", "--sidebar-width-icon": "3rem" } as React.CSSProperties}
			>
				<AppSidebar variant={variant} collapsible={collapsible} orgSlug={orgSlug} />
				<SidebarInset
					className="flex-1"
					style={{
						marginRight: chatOpen ? chatWidth : 0,
						transition: isDragging ? "none" : "margin 200ms ease",
					}}
				>
					<TopNav orgSlug={orgSlug} onToggleChat={toggleChat} />
					<div className="h-full p-4 md:p-6">{children}</div>
				</SidebarInset>
			</SidebarProvider>

			{/* Right AI Chat Panel */}
			<div
				className={`fixed right-0 top-0 h-full flex z-40 ${
					chatOpen ? "translate-x-0" : "translate-x-full"
				}`}
				style={{
					width: chatWidth,
					transition: isDragging ? "none" : "transform 200ms ease",
				}}
			>
				{/* Grip handle */}
				<div
					className="group/handle relative z-50 w-4 shrink-0 -mr-4 flex items-center justify-center cursor-col-resize select-none"
					onMouseDown={onMouseDown}
				>
					<GripVertical className="size-3.5 text-muted-foreground opacity-0 group-hover/handle:opacity-60 transition-opacity" />
				</div>
				<SidebarProvider
					defaultOpen={true}
					style={{ "--sidebar-width": `${chatWidth}px`, "--sidebar-width-icon": `${chatWidth}px` } as React.CSSProperties}
				>
					<AIChatPanel />
				</SidebarProvider>
			</div>
		</div>
	);
}
