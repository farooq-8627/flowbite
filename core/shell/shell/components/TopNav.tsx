"use client";

import { useMutation, useQuery } from "convex/react";
import { Bell, Bot, CheckCheck, Search } from "lucide-react";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { api } from "@/convex/_generated/api";
import { useNavSlotNode } from "@/core/shell/shell/context/nav-slot-context";
import { formatChatSidebarTime } from "@/lib/datetime";
import { cn } from "@/lib/utils";
import { matchesShortcut, useShortcut } from "@/stores/shortcuts/shortcuts-store";
import { AutoBreadcrumb } from "./AutoBreadcrumb";
import { QuickAddMenu } from "./QuickAddMenu";

/**
 * TopNav — Icon-only top navigation bar.
 *
 * Left:  sidebar trigger (⌘B by default, editable) + page-specific slot
 * Right: search + notifications + separator + AI chat toggle
 *
 * All shortcuts read from useShortcutsStore — editing /settings/shortcuts
 * updates tooltips here instantly.
 */
export function TopNav({
	onToggleChat,
	onToggleSearch,
	onToggleNotifications,
}: {
	onToggleChat?: () => void;
	onToggleSearch?: () => void;
	onToggleNotifications?: () => void;
}) {
	const scAI = useShortcut("toggleAIPanel");
	const scSearch = useShortcut("search");
	const slot = useNavSlotNode();

	useEffect(() => {
		function handleKeyDown(e: KeyboardEvent) {
			if (matchesShortcut(e, scAI)) {
				e.preventDefault();
				onToggleChat?.();
			}
			if (matchesShortcut(e, scSearch)) {
				e.preventDefault();
				onToggleSearch?.();
			}
		}
		document.addEventListener("keydown", handleKeyDown);
		return () => document.removeEventListener("keydown", handleKeyDown);
	}, [scAI, scSearch, onToggleChat, onToggleSearch]);

	return (
		<header
			className={cn(
				"flex h-12 shrink-0 items-center gap-2 border-b rounded-t-[var(--radius)] transition-[width,height] ease-linear group-has-data-[collapsible=icon]/sidebar-wrapper:h-12",
				"[html[data-navbar-style=sticky]_&]:sticky [html[data-navbar-style=sticky]_&]:top-0 [html[data-navbar-style=sticky]_&]:z-50 [html[data-navbar-style=sticky]_&]:bg-background/80 [html[data-navbar-style=sticky]_&]:backdrop-blur-md",
			)}
		>
			<div className="relative flex w-full items-center px-4 lg:px-6">
				{/* Left: trigger + breadcrumb */}
				<div className="flex shrink-0 items-center gap-2">
					<SidebarTriggerWithTooltip />
					<AutoBreadcrumb />
				</div>

				{/* Center: route-specific slot — absolutely centered so it never shifts left/right */}
				{slot && (
					<div className="pointer-events-none absolute inset-0 hidden items-center justify-center xl:flex">
						<div className="pointer-events-auto flex w-fit items-center gap-2 rounded-[var(--radius)] bg-muted/60 px-3 py-1.5">
							{slot}
						</div>
					</div>
				)}

				{/* Spacer */}
				<div className="flex-1" />

				{/* Right */}
				<div className="flex shrink-0 items-center sm:gap-1">
					<QuickAddMenu />
					<Tooltip>
						<TooltipTrigger asChild>
							<Button
								size="icon"
								variant="ghost"
								onClick={onToggleSearch}
								aria-label="Search"
								className="size-8 text-muted-foreground hover:text-foreground"
							>
								<Search className="size-4" />
							</Button>
						</TooltipTrigger>
						<TooltipContent side="bottom" className="flex items-center gap-1">
							Search <Kbd>{scSearch.display}</Kbd>
						</TooltipContent>
					</Tooltip>

					<NotificationBell onToggleNotifications={onToggleNotifications} />

					<Tooltip>
						<TooltipTrigger asChild>
							<Button
								size="icon"
								variant="ghost"
								onClick={onToggleChat}
								aria-label="Toggle AI Assistant"
								className="size-8 text-muted-foreground hover:text-foreground"
							>
								<Bot className="size-4" />
							</Button>
						</TooltipTrigger>
						<TooltipContent side="bottom" className="flex items-center gap-1">
							AI Assistant <Kbd>{scAI.display}</Kbd>
						</TooltipContent>
					</Tooltip>
				</div>
			</div>
		</header>
	);
}

/** Sidebar trigger reads its shortcut from the store */
function SidebarTriggerWithTooltip() {
	const sc = useShortcut("toggleSidebar");
	return (
		<Tooltip>
			<TooltipTrigger asChild>
				<SidebarTrigger className="-ms-1" />
			</TooltipTrigger>
			<TooltipContent side="bottom" className="flex items-center gap-1">
				Toggle sidebar <Kbd>{sc.display}</Kbd>
			</TooltipContent>
		</Tooltip>
	);
}

// ─── Notification Bell ────────────────────────────────────────────────────────

function NotificationBell({
	onToggleNotifications: _onToggleNotifications,
}: {
	onToggleNotifications?: () => void;
}) {
	const [open, setOpen] = useState(false);
	const sc = useShortcut("notifications");
	const params = useParams<{ orgSlug?: string }>();
	const orgSlug = params?.orgSlug;
	const router = useRouter();

	const summary = useQuery(api.notifications.queries.getSummary);
	const markRead = useMutation(api.notifications.mutations.markRead);
	const markAllRead = useMutation(api.notifications.mutations.markAllRead);

	const unread = summary?.unreadCount ?? 0;
	const preview = summary?.preview ?? [];

	useEffect(() => {
		function handleKeyDown(e: KeyboardEvent) {
			if (matchesShortcut(e, sc)) {
				e.preventDefault();
				setOpen((prev) => !prev);
			}
		}
		document.addEventListener("keydown", handleKeyDown);
		return () => document.removeEventListener("keydown", handleKeyDown);
	}, [sc]);

	return (
		<Popover open={open} onOpenChange={setOpen}>
			<Tooltip>
				<TooltipTrigger asChild>
					<PopoverTrigger asChild>
						<Button
							size="icon"
							variant="ghost"
							aria-label="Notifications"
							className="relative size-8 text-muted-foreground hover:text-foreground"
						>
							<Bell className="size-4" />
							{unread > 0 && (
								<span className="absolute end-1.5 top-1.5 size-2 rounded-full bg-destructive" />
							)}
						</Button>
					</PopoverTrigger>
				</TooltipTrigger>
				<TooltipContent side="bottom" className="flex items-center gap-1">
					Notifications <Kbd>{sc.display}</Kbd>
				</TooltipContent>
			</Tooltip>

			<PopoverContent align="end" className="w-80 p-0" sideOffset={8}>
				<div className="flex items-center justify-between border-b px-4 py-3">
					<span className="text-sm font-semibold">Notifications</span>
					{unread > 0 && (
						<button
							type="button"
							onClick={() => markAllRead({})}
							className="flex items-center gap-1 text-xs text-muted-foreground transition-colors hover:text-foreground"
						>
							<CheckCheck className="size-3.5" />
							Mark all read
						</button>
					)}
				</div>

				<div className="max-h-80 overflow-y-auto">
					{preview.length === 0 ? (
						<div className="px-4 py-8 text-center text-xs text-muted-foreground">
							No notifications yet
						</div>
					) : (
						preview.map((n) => {
							const actionUrl =
								n.actionUrl && orgSlug ? `/${orgSlug}${n.actionUrl}` : null;
							return (
								<button
									type="button"
									key={n._id}
									className={cn(
										"flex w-full gap-3 border-b px-4 py-3 text-start last:border-0 transition-colors",
										!n.read && "bg-muted/30",
										"hover:bg-muted/50",
									)}
									onClick={() => {
										if (!n.read) markRead({ notificationId: n._id });
										if (actionUrl) {
											setOpen(false);
											router.push(actionUrl);
										}
									}}
								>
									<span
										className={cn(
											"mt-1.5 size-2 shrink-0 rounded-full",
											!n.read ? "bg-primary" : "bg-transparent",
										)}
									/>
									<div className="min-w-0 flex-1">
										<p className="text-sm font-medium leading-tight">
											{n.title}
										</p>
										{n.body && (
											<p className="mt-0.5 truncate text-xs text-muted-foreground">
												{n.body}
											</p>
										)}
										<span className="mt-1 text-[11px] text-muted-foreground/60">
											{formatChatSidebarTime(n.createdAt)}
										</span>
									</div>
								</button>
							);
						})
					)}
				</div>

				<div className="border-t px-4 py-2.5">
					<button
						type="button"
						onClick={() => {
							setOpen(false);
							if (orgSlug) router.push(`/${orgSlug}/notifications`);
						}}
						className="block w-full text-center text-xs text-muted-foreground transition-colors hover:text-foreground"
					>
						View all notifications
					</button>
				</div>
			</PopoverContent>
		</Popover>
	);
}

/** Kbd badge — explicit foreground so it's always visible regardless of tooltip bg */
function Kbd({ children }: { children: React.ReactNode }) {
	return (
		<kbd className="rounded border border-white/20 bg-white/10 px-1 py-0.5 font-mono text-[10px] leading-none text-white">
			{children}
		</kbd>
	);
}
