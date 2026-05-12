"use client";

import { GripVertical } from "lucide-react";
import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import { SidebarSkeleton } from "@/components/skeletons/SidebarSkeleton";
import { AppSheet } from "@/components/ui/app-sheet";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import {
	AIChatPanel,
	AIChatPanelContent,
} from "@/core/shell/components/ai-chat-panel/ai-chat-panel";
import { AppSidebar } from "@/core/shell/components/sidebar/app-sidebar";
import { SearchDialog } from "@/core/shell/components/sidebar/search-dialog";
import { TopNav } from "@/core/shell/components/TopNav";
import { NavSlotProvider } from "@/core/shell/context/nav-slot-context";
import { useIsBelowXl } from "@/hooks/use-tablet";
import type { SidebarCollapsible, SidebarVariant } from "@/lib/preferences/layout";

const CHAT_MIN_WIDTH = 280;
const CHAT_MAX_WIDTH = 600;
const CHAT_DEFAULT_WIDTH = 360;

/**
 * Width for the AI chat sheet on phones + iPads. `min(...)` clamps the sheet
 * at a sensible maximum on iPads while collapsing gracefully on phones.
 */
const CHAT_SHEET_WIDTH = "min(90vw, 28rem)";

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
	// `isBelowXl` is true for phones + every iPad (portrait, landscape, Pro).
	// The sidebar itself handles this automatically — `useIsMobile` inside the
	// shadcn `SidebarProvider` now fires at < 1280px, so the whole sidebar
	// switches to its built-in mobile Sheet for us. We only need this flag
	// here to route the AI chat panel the same way, since the chat panel is
	// owned by this layout.
	const isBelowXl = useIsBelowXl();

	const [chatOpen, setChatOpen] = useState(initialChatOpen);
	const [searchOpen, setSearchOpen] = useState(false);
	const [chatWidth, setChatWidth] = useState(CHAT_DEFAULT_WIDTH);
	const [isDragging, setIsDragging] = useState(false);
	const [isRTL, setIsRTL] = useState(false);
	const startX = useRef(0);
	const startWidth = useRef(0);

	// Detect RTL from <html dir> — updates when locale switches
	useEffect(() => {
		const check = () => setIsRTL(document.documentElement.dir === "rtl");
		check();
		const observer = new MutationObserver(check);
		observer.observe(document.documentElement, { attributes: true, attributeFilter: ["dir"] });
		return () => observer.disconnect();
	}, []);

	const toggleChat = useCallback(() => {
		const newState = !chatOpen;
		setChatOpen(newState);
		// biome-ignore lint/suspicious/noDocumentCookie: Cookie Store API is still unstable in Safari; sync document.cookie assignment is the cross-browser baseline.
		document.cookie = `chat_panel_state=${newState}; path=/; max-age=31536000`;
	}, [chatOpen]);

	const onMouseDown = useCallback(
		(e: React.MouseEvent) => {
			e.preventDefault();
			startX.current = e.clientX;
			startWidth.current = chatWidth;
			setIsDragging(true);

			const onMouseMove = (e: MouseEvent) => {
				// In RTL the grip is on the left edge of the panel — delta is reversed
				const delta = isRTL ? e.clientX - startX.current : startX.current - e.clientX;
				const newWidth = Math.min(
					CHAT_MAX_WIDTH,
					Math.max(CHAT_MIN_WIDTH, startWidth.current + delta),
				);
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
		},
		[chatWidth, isRTL],
	);

	// In RTL: sidebar is on the right, AI panel slides in from the left.
	// Only apply the inset margin on laptops — on iPads the chat is a Sheet
	// and must not shift the main content.
	const insetMarginStyle =
		!isBelowXl && chatOpen
			? isRTL
				? { marginLeft: chatWidth }
				: { marginRight: chatWidth }
			: {};

	const chatPanelPositionStyle = isRTL
		? { left: chatOpen ? 0 : -chatWidth }
		: { right: chatOpen ? 0 : -chatWidth };

	const gripPositionStyle = isRTL ? { left: chatWidth - 6 } : { right: chatWidth - 6 };

	return (
		<div className="flex h-screen w-full overflow-hidden">
			<SidebarProvider defaultOpen={initialSidebarOpen}>
				<Suspense fallback={<SidebarSkeleton />}>
					<AppSidebar
						variant={variant}
						collapsible={collapsible}
						orgSlug={orgSlug}
						side={isRTL ? "right" : "left"}
					/>
				</Suspense>
				<SidebarInset
					className="flex-1 flex flex-col"
					style={{
						...insetMarginStyle,
						transition: isDragging ? "none" : "margin 200ms ease",
					}}
				>
					<NavSlotProvider>
						<TopNav
							onToggleChat={toggleChat}
							onToggleSearch={() => setSearchOpen(true)}
						/>
						<SearchDialog open={searchOpen} onOpenChange={setSearchOpen} />
						<main className="flex-1 overflow-hidden sm:p-2">{children}</main>
					</NavSlotProvider>
				</SidebarInset>
			</SidebarProvider>

			{/* Laptop (xl+) — inline AI Chat Panel */}
			{!isBelowXl && (
				<div
					className="fixed top-0 h-full pointer-events-none z-40 transition-[left,right] duration-200 ease-linear"
					style={chatPanelPositionStyle}
				>
					<SidebarProvider
						open={chatOpen}
						onOpenChange={(v) => {
							setChatOpen(v);
							// biome-ignore lint/suspicious/noDocumentCookie: Cookie Store API is still unstable in Safari; sync document.cookie assignment is the cross-browser baseline.
							document.cookie = `chat_panel_state=${v}; path=/; max-age=31536000`;
						}}
						disableKeyboardShortcut
						style={
							{
								"--sidebar-width": `${chatWidth}px`,
								"--sidebar-width-icon": `${chatWidth}px`,
							} as React.CSSProperties
						}
						className="!w-0 !min-h-0"
					>
						{chatOpen && (
							// Keyboard-only users don't need a resize gesture (the panel
							// is toggled via the `cmd+/` shortcut), but a button is the
							// correct semantics for an interactive element that triggers
							// a mouse-driven resize — keeps screen readers happy and
							// satisfies useFocusableInteractive + useSemanticElements.
							<button
								type="button"
								className="group/handle pointer-events-auto fixed top-0 h-full z-50 w-4 flex items-center justify-center cursor-col-resize select-none bg-transparent border-0 p-0"
								style={gripPositionStyle}
								onMouseDown={onMouseDown}
								aria-label="Resize chat panel"
							>
								<GripVertical className="size-3.5 text-muted-foreground opacity-0 group-hover/handle:opacity-60 transition-opacity" />
							</button>
						)}
						<div className="pointer-events-auto">
							<AIChatPanel side={isRTL ? "left" : "right"} />
						</div>
					</SidebarProvider>
				</div>
			)}

			{/* Phones + iPads (< xl) — AI Chat Sheet */}
			{isBelowXl && (
				<AppSheet
					open={chatOpen}
					onOpenChange={setChatOpen}
					title="AI Assistant"
					side={isRTL ? "left" : "right"}
					width={CHAT_SHEET_WIDTH}
				>
					<AIChatPanelContent />
				</AppSheet>
			)}
		</div>
	);
}
