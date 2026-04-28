"use client";

import { useState, useCallback, useRef } from "react";
import { GripVertical } from "lucide-react";
import { AppSidebar } from "@/core/shell/components/sidebar/app-sidebar";
import { AIChatPanel, AIChatPanelContent } from "@/core/shell/components/ai-chat-panel/ai-chat-panel";
import { TopNav } from "@/core/shell/components/TopNav";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { useIsTablet } from "@/hooks/use-tablet";
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
	const isTablet = useIsTablet();
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

		// Disable transitions on all sidebar elements AND the main content during drag
		const allElements = document.querySelectorAll('[data-sidebar="sidebar"], .sidebar-container, [data-side="right"], [data-sidebar="inset"]');
		allElements.forEach((el) => {
			const element = el as HTMLElement;
			element.style.transition = 'none';
			element.style.transform = element.style.transform; // Force style recalc
		});

		const onMouseMove = (e: MouseEvent) => {
			const delta = startX.current - e.clientX;
			const newWidth = Math.min(CHAT_MAX_WIDTH, Math.max(CHAT_MIN_WIDTH, startWidth.current + delta));
			setChatWidth(newWidth);
		};

		const onMouseUp = () => {
			setIsDragging(false);
			
			// Re-enable transitions on all elements
			allElements.forEach((el) => {
				const element = el as HTMLElement;
				element.style.transition = '';
			});
			
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
						marginRight: (!isTablet && chatOpen) ? chatWidth : 0,
						transition: isDragging ? "none" : "margin 200ms ease",
					}}
				>
					<TopNav orgSlug={orgSlug} onToggleChat={toggleChat} />
					<div className="h-full p-4 md:p-6">{children}</div>
				</SidebarInset>
			</SidebarProvider>

			{/* Right AI Chat Panel — desktop only, completely removed from DOM when closed */}
			{!isTablet && chatOpen && (
				<div className="fixed top-0 right-0 h-full pointer-events-none z-40">
					<SidebarProvider
						open={chatOpen}
						onOpenChange={(v) => { setChatOpen(v); document.cookie = `chat_panel_state=${v}; path=/; max-age=31536000`; }}
						style={{ "--sidebar-width": `${chatWidth}px`, "--sidebar-width-icon": `${chatWidth}px` } as React.CSSProperties}
						className="!w-0 !min-h-0"
					>
						{/* Grip handle — icon only on hover */}
						<div
							className="group/handle pointer-events-auto fixed top-0 h-full z-50 w-4 flex items-center justify-center cursor-col-resize select-none"
							style={{ right: chatWidth - 6 }}
							onMouseDown={onMouseDown}
						>
							<GripVertical className="size-3.5 text-muted-foreground opacity-0 group-hover/handle:opacity-60 transition-opacity" />
						</div>
						<div className="pointer-events-auto">
							<AIChatPanel />
						</div>
					</SidebarProvider>
				</div>
			)}

			{/* Tablet + Mobile Sheet (< 1024px) */}
			{isTablet && (
				<Sheet open={chatOpen} onOpenChange={setChatOpen}>
					<SheetContent
						side="right"
						className="!w-[85vw] !max-w-[85vw] p-0 [&>button]:hidden"
					>
						<SheetHeader className="sr-only">
							<SheetTitle>AI Assistant</SheetTitle>
							<SheetDescription>AI chat panel</SheetDescription>
						</SheetHeader>
						<AIChatPanelContent />
					</SheetContent>
				</Sheet>
			)}
		</div>
	);
}
