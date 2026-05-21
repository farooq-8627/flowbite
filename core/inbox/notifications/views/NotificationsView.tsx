"use client";

import { useMutation, useQuery } from "convex/react";
import { Bell, BellOff, CheckCheck, ExternalLink, Inbox, Mail, MailOpen } from "lucide-react";
import { useParams, useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { api } from "@/convex/_generated/api";
import type { Doc } from "@/convex/_generated/dataModel";
import { formatChatSidebarTime } from "@/lib/datetime";
import { cn } from "@/lib/utils";

type Tab = "all" | "unread" | "read";

const TABS: Array<{ id: Tab; label: string; Icon: typeof Inbox }> = [
	{ id: "all", label: "All", Icon: Inbox },
	{ id: "unread", label: "Unread", Icon: Mail },
	{ id: "read", label: "Read", Icon: MailOpen },
];

function notificationIcon(type: string) {
	if (type.startsWith("message")) return "💬";
	if (type.startsWith("deal")) return "🤝";
	if (type.startsWith("lead")) return "🎯";
	if (type.startsWith("contact")) return "👤";
	if (type.startsWith("reminder")) return "⏰";
	if (type.startsWith("note")) return "📝";
	if (type.startsWith("conversation")) return "💬";
	if (type.startsWith("member") || type.startsWith("role")) return "👥";
	if (type.startsWith("ai")) return "🤖";
	if (type.startsWith("billing")) return "💳";
	if (type.startsWith("csv")) return "📊";
	return "🔔";
}

export function NotificationsView() {
	const [tab, setTab] = useState<Tab>("all");
	const params = useParams<{ orgSlug?: string }>();
	const orgSlug = params?.orgSlug;
	const router = useRouter();

	const notifications = useQuery(api.notifications.queries.listMine, {
		onlyUnread: tab === "unread" ? true : undefined,
	});
	const markRead = useMutation(api.notifications.mutations.markRead);
	const markAllRead = useMutation(api.notifications.mutations.markAllRead);

	const filtered = useMemo(() => {
		if (!notifications) return [];
		if (tab === "read") return notifications.filter((n) => n.read);
		return notifications;
	}, [notifications, tab]);

	const unreadCount = useMemo(
		() => notifications?.filter((n) => !n.read).length ?? 0,
		[notifications],
	);

	const buildHref = (n: Doc<"notifications">) => {
		if (n.actionUrl && orgSlug) return `/${orgSlug}${n.actionUrl}`;
		return null;
	};

	const handleCardClick = (n: Doc<"notifications">) => {
		if (!n.read) markRead({ notificationId: n._id });
		const href = buildHref(n);
		if (href) router.push(href);
	};

	const handleMarkRead = (e: React.MouseEvent, n: Doc<"notifications">) => {
		e.stopPropagation();
		if (!n.read) markRead({ notificationId: n._id });
	};

	const handleOpen = (e: React.MouseEvent, n: Doc<"notifications">) => {
		e.stopPropagation();
		if (!n.read) markRead({ notificationId: n._id });
		const href = buildHref(n);
		if (href) router.push(href);
	};

	return (
		<div className="mx-auto flex h-full max-w-3xl flex-col">
			{/* Header */}
			<div className="flex items-center justify-between border-b border-border px-6 py-5">
				<div className="flex items-center gap-3">
					<div className="flex size-9 items-center justify-center rounded-[var(--radius)] bg-primary/10">
						<Bell className="size-4.5 text-primary" />
					</div>
					<div>
						<h1 className="text-lg font-semibold text-foreground">Notifications</h1>
						<p className="text-xs text-muted-foreground">
							{unreadCount > 0
								? `${unreadCount} unread notification${unreadCount > 1 ? "s" : ""}`
								: "You're all caught up"}
						</p>
					</div>
				</div>
				{unreadCount > 0 && (
					<Button
						type="button"
						size="sm"
						variant="default"
						onClick={() => markAllRead({})}
						className="h-8 gap-1.5 text-xs"
					>
						<CheckCheck className="size-3.5" />
						Mark all as read
					</Button>
				)}
			</div>

			{/* Tabs */}
			<div className="flex items-center gap-1 border-b border-border px-6 py-2.5">
				{TABS.map(({ id, label, Icon }) => (
					<button
						key={id}
						type="button"
						onClick={() => setTab(id)}
						className={cn(
							"flex items-center gap-1.5 rounded-[var(--radius)] px-3 py-1.5 text-xs font-medium transition-colors",
							tab === id
								? "bg-primary text-primary-foreground shadow-sm"
								: "text-muted-foreground hover:bg-muted hover:text-foreground",
						)}
					>
						<Icon className="size-3.5" />
						{label}
						{id === "unread" && unreadCount > 0 && (
							<Badge
								variant="secondary"
								className="ms-1 h-4 min-w-4 rounded-full px-1 text-[10px]"
							>
								{unreadCount}
							</Badge>
						)}
					</button>
				))}
			</div>

			{/* List */}
			<div className="min-h-0 flex-1 overflow-y-auto">
				{notifications === undefined ? (
					<div className="flex items-center justify-center py-20">
						<span className="text-sm text-muted-foreground">Loading…</span>
					</div>
				) : filtered.length === 0 ? (
					<div className="flex flex-col items-center justify-center gap-3 py-20">
						<div className="flex size-14 items-center justify-center rounded-full bg-muted">
							<BellOff className="size-6 text-muted-foreground/50" />
						</div>
						<p className="text-sm font-medium text-muted-foreground">
							{tab === "unread"
								? "You're all caught up!"
								: tab === "read"
									? "No read notifications yet."
									: "No notifications yet."}
						</p>
					</div>
				) : (
					<ul className="divide-y divide-border">
						{filtered.map((n) => {
							const href = buildHref(n);
							return (
								<li key={n._id}>
									<button
										type="button"
										onClick={() => handleCardClick(n)}
										className={cn(
											"flex w-full items-start gap-4 px-6 py-4 text-start transition-colors",
											!n.read
												? "bg-primary/[0.04] hover:bg-primary/[0.08]"
												: "hover:bg-muted/50",
										)}
									>
										{/* Icon */}
										<div
											className={cn(
												"flex size-10 shrink-0 items-center justify-center rounded-full text-lg",
												!n.read ? "bg-primary/10" : "bg-muted",
											)}
										>
											{notificationIcon(n.type)}
										</div>

										{/* Content */}
										<div className="flex min-w-0 flex-1 flex-col gap-1">
											<div className="flex items-start justify-between gap-3">
												<p
													className={cn(
														"text-sm leading-snug",
														!n.read
															? "font-semibold text-foreground"
															: "font-medium text-foreground/80",
													)}
												>
													{n.title}
												</p>
												<span className="shrink-0 text-[11px] tabular-nums text-muted-foreground">
													{formatChatSidebarTime(n.createdAt)}
												</span>
											</div>
											{n.body && (
												<p className="text-xs leading-relaxed text-muted-foreground line-clamp-2">
													{n.body}
												</p>
											)}

											{/* Actions row */}
											<div className="mt-1.5 flex items-center gap-2">
												{href && (
													<Button
														type="button"
														size="sm"
														variant="outline"
														className="h-7 gap-1 px-2.5 text-[11px]"
														onClick={(e) => handleOpen(e, n)}
													>
														<ExternalLink className="size-3" />
														Open
													</Button>
												)}
												{!n.read && (
													<Button
														type="button"
														size="sm"
														variant="ghost"
														className="h-7 gap-1 px-2.5 text-[11px] text-muted-foreground"
														onClick={(e) => handleMarkRead(e, n)}
													>
														<MailOpen className="size-3" />
														Mark as read
													</Button>
												)}
											</div>
										</div>

										{/* Unread indicator */}
										{!n.read && (
											<span className="mt-2 size-2.5 shrink-0 rounded-full bg-primary" />
										)}
									</button>
								</li>
							);
						})}
					</ul>
				)}
			</div>
		</div>
	);
}
