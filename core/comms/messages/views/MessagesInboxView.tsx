"use client";

/**
 * MessagesInboxView — org-wide messages page (`/{orgSlug}/messages`).
 *
 * Composes the locked Sidebar/Main split (CORE-FEATURES-ARCHITECTURE.md §3.1):
 *   - `<MessagesSidebar>`: conversation list, filter dropdown, search.
 *   - `<MessagesThread>`:  active thread (header + list + composer).
 *   - `<MessagesEmptyState>`: shown before the user picks a thread.
 *
 * 2026-05-16 update — mobile sidebar via existing `Sheet` primitive:
 *   - At `md+` the sidebar is inline (`hidden md:flex`).
 *   - Below `md` the sidebar lives inside a `<Sheet>` opened by a hamburger
 *     in `ThreadHeader` / `MessagesEmptyState`. Selecting a conversation
 *     auto-closes the Sheet so the user lands on the thread.
 *
 * 2026-05-17 update (per user direction):
 *   - The Sheet now uses logical `side="start"` so it slides in from the
 *     correct edge under RTL automatically.
 *   - The Sheet's built-in close X was overlapping the sidebar's search
 *     button. We disable it (`showCloseButton={false}`) — the Sheet is
 *     dismissable via overlay tap, Escape, or selecting a conversation.
 *   - Stale-while-revalidate on conversation switch: the previous selection
 *     is kept rendered while the new conversation's queries hydrate, so
 *     there's no full-blank loading flicker. We use the React `startTransition`
 *     primitive to keep the new selection responsive.
 *
 * Page-local UI state (selected conversation, sheet open) is plain
 * `useState` per FRONTEND-DECISIONS Rule 1 — never Zustand for ephemeral
 * page state.
 */
import { Menu } from "lucide-react";
import { startTransition, useDeferredValue, useState } from "react";
import { Button } from "@/components/ui/button";
import {
	Sheet,
	SheetContent,
	SheetDescription,
	SheetHeader,
	SheetTitle,
} from "@/components/ui/sheet";
import type { Id } from "@/convex/_generated/dataModel";
import { MessagesEmptyState } from "@/core/comms/messages/components/MessagesEmptyState";
import { MessagesSidebar } from "@/core/comms/messages/components/MessagesSidebar";
import { MessagesThread } from "@/core/comms/messages/components/MessagesThread";
import { useCurrentOrg } from "@/core/shell/shared/hooks/useCurrentOrg";

export function MessagesInboxView() {
	const { orgId, isLoading } = useCurrentOrg();
	const [selected, setSelected] = useState<Id<"conversations"> | null>(null);
	const [mobileSheetOpen, setMobileSheetOpen] = useState(false);

	// Stale-while-revalidate on conversation switch: `useDeferredValue` keeps
	// the previous selection rendered (so the thread doesn't blank out)
	// while the new selection's queries hydrate. This is React's official
	// SWR-for-rendering primitive — no third-party library needed.
	const renderedSelection = useDeferredValue(selected);

	if (isLoading || !orgId) {
		return (
			<div className="flex h-full items-center justify-center p-8">
				<p className="text-sm text-muted-foreground">Loading workspace…</p>
			</div>
		);
	}

	const handleSelect = (id: Id<"conversations">) => {
		// Mark this state update as a transition so React keeps the previous
		// thread on screen while the new conversation's queries warm up.
		startTransition(() => {
			setSelected(id);
		});
		setMobileSheetOpen(false);
	};

	return (
		<div className="flex h-full min-h-0 w-full overflow-hidden">
			{/* Desktop sidebar — inline at md+ */}
			<MessagesSidebar
				orgId={orgId}
				selectedConversationId={renderedSelection}
				onSelect={handleSelect}
				className="hidden w-72 shrink-0 md:flex"
			/>

			{/* Mobile sidebar — Sheet at <md */}
			<Sheet open={mobileSheetOpen} onOpenChange={setMobileSheetOpen}>
				<SheetContent
					side="start"
					showCloseButton={false}
					className="w-80 max-w-[85vw] gap-0 p-0"
					aria-describedby={undefined}
				>
					<SheetHeader className="sr-only">
						<SheetTitle>Conversations</SheetTitle>
						<SheetDescription>Pick a conversation or start a new one.</SheetDescription>
					</SheetHeader>
					<MessagesSidebar
						orgId={orgId}
						selectedConversationId={renderedSelection}
						onSelect={handleSelect}
						className="h-full w-full"
					/>
				</SheetContent>
			</Sheet>

			<div className="flex min-h-0 min-w-0 flex-1 flex-col">
				{renderedSelection ? (
					<MessagesThread
						orgId={orgId}
						conversationId={renderedSelection}
						onOpenSidebar={() => setMobileSheetOpen(true)}
					/>
				) : (
					<div className="flex h-full flex-1 flex-col">
						<header className="flex h-14 shrink-0 items-center gap-2 border-b border-border px-4 md:hidden">
							<Button
								type="button"
								size="icon"
								variant="ghost"
								className="size-8"
								onClick={() => setMobileSheetOpen(true)}
								aria-label="Open conversation list"
							>
								<Menu className="size-4" aria-hidden="true" />
							</Button>
							<span className="text-sm font-semibold text-foreground">Messages</span>
						</header>
						<div className="flex flex-1 items-center justify-center">
							<MessagesEmptyState />
						</div>
					</div>
				)}
			</div>
		</div>
	);
}
