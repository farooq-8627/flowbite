"use client";

import { useMutation, useQuery } from "convex/react";
import {
	Bell,
	BellOff,
	Bot,
	Briefcase,
	CheckCheck,
	CreditCard,
	ExternalLink,
	Inbox,
	Mail,
	MailOpen,
	MessageSquare,
	StickyNote,
	Target,
	Timer,
	UserCircle2,
	Users,
} from "lucide-react";
import { useParams, useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { api } from "@/convex/_generated/api";
import type { Doc } from "@/convex/_generated/dataModel";
import { resolveNotificationHref } from "@/core/inbox/notifications/utils/resolveNotificationHref";
import { useEntityLabels } from "@/core/shell/shared/hooks/useEntityLabels";
import { formatChatSidebarTime } from "@/lib/datetime";
import { cn } from "@/lib/utils";

/**
 * NotificationsView — full-screen notifications inbox.
 *
 * Layout
 * ──────
 * - Full-width on laptop/iPad (no max-width clamp); the parent shell already
 *   handles outer padding so we let the page breathe to the edges.
 * - Header: count + "Mark all as read" action.
 * - Tabs: BY CATEGORY (All, Messages, Deals, Leads, Contacts, Reminders,
 *   Notes, Members, AI, System) + an Unread filter pill.
 * - List: rich rows; per-notification mark-as-read + open. Click anywhere on
 *   the row routes to the entity via `actionUrl`.
 *
 * Why category tabs (vs the old All/Unread/Read trio)
 * ───────────────────────────────────────────────────
 * Users come to the notifications page looking for "what's new in
 * messages?" or "what changed on my deals?" — not "what's still unread?".
 * The unread filter is now a single pill on the right, kept as a quick
 * way to triage. Categories are derived from `notification.type` prefixes
 * (e.g. `message.created`, `deal.stage.changed`).
 *
 * Nested-button safety (Next.js HMR caught this 2026-05-22)
 * ─────────────────────────────────────────────────────────
 * The previous version wrapped each row in `<button>` and rendered our
 * `<Button>` action chips inside it — the React DOM-validation throws
 * "<button> cannot contain a nested <button>". Fixed by making each row a
 * `<div role="button">` with an onClick handler; the inner Buttons remain
 * real buttons and stop propagation so they don't double-fire the row
 * action.
 */

type CategoryId =
	| "all"
	| "messages"
	| "deals"
	| "leads"
	| "contacts"
	| "reminders"
	| "notes"
	| "members"
	| "ai"
	| "system";

type CategoryDef = {
	id: CategoryId;
	label: string;
	Icon: typeof Inbox;
	/** Returns true if a notification belongs to this category. */
	matches: (n: Doc<"notifications">) => boolean;
};

/**
 * Category dispatchers keyed off `notification.type` prefixes. Order matters —
 * the first match wins. "All" always matches; "system" is the catch-all
 * fallback for anything not covered by a specific category.
 */
const CATEGORIES: CategoryDef[] = [
	{ id: "all", label: "All", Icon: Inbox, matches: () => true },
	{
		id: "messages",
		label: "Messages",
		Icon: MessageSquare,
		matches: (n) => n.type.startsWith("message") || n.type.startsWith("conversation"),
	},
	{
		id: "deals",
		label: "Deals",
		Icon: Briefcase,
		matches: (n) => n.type.startsWith("deal"),
	},
	{
		id: "leads",
		label: "Leads",
		Icon: Target,
		matches: (n) => n.type.startsWith("lead"),
	},
	{
		id: "contacts",
		label: "Contacts",
		Icon: UserCircle2,
		matches: (n) => n.type.startsWith("contact") || n.type.startsWith("company"),
	},
	{
		id: "reminders",
		label: "Reminders",
		Icon: Timer,
		matches: (n) => n.type.startsWith("reminder") || n.type.startsWith("followup"),
	},
	{
		id: "notes",
		label: "Notes",
		Icon: StickyNote,
		matches: (n) => n.type.startsWith("note"),
	},
	{
		id: "members",
		label: "Team",
		Icon: Users,
		matches: (n) => n.type.startsWith("member") || n.type.startsWith("role"),
	},
	{
		id: "ai",
		label: "AI",
		Icon: Bot,
		matches: (n) => n.type.startsWith("ai"),
	},
	{
		id: "system",
		label: "System",
		Icon: CreditCard,
		matches: (n) =>
			n.type.startsWith("billing") ||
			n.type.startsWith("csv") ||
			n.type.startsWith("system") ||
			n.type.startsWith("integration"),
	},
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
	const [category, setCategory] = useState<CategoryId>("all");
	const [unreadOnly, setUnreadOnly] = useState(false);
	const params = useParams<{ orgSlug?: string }>();
	const orgSlug = params?.orgSlug;
	const labels = useEntityLabels();
	const router = useRouter();

	const notifications = useQuery(api.notifications.queries.listMine, {});
	const markRead = useMutation(api.notifications.mutations.markRead);
	const markAllRead = useMutation(api.notifications.mutations.markAllRead);

	const filtered = useMemo(() => {
		if (!notifications) return [];
		const def = CATEGORIES.find((c) => c.id === category) ?? CATEGORIES[0];
		let list = notifications.filter(def.matches);
		if (unreadOnly) list = list.filter((n) => !n.read);
		return list;
	}, [notifications, category, unreadOnly]);

	const unreadCount = useMemo(
		() => notifications?.filter((n) => !n.read).length ?? 0,
		[notifications],
	);

	// Per-category counts (for badge dots on tabs)
	const countByCategory = useMemo(() => {
		const map = new Map<CategoryId, { total: number; unread: number }>();
		for (const c of CATEGORIES) map.set(c.id, { total: 0, unread: 0 });
		for (const n of notifications ?? []) {
			for (const c of CATEGORIES) {
				if (c.matches(n)) {
					const entry = map.get(c.id);
					if (entry) {
						entry.total += 1;
						if (!n.read) entry.unread += 1;
					}
				}
			}
		}
		return map;
	}, [notifications]);

	const buildHref = (n: Doc<"notifications">) => {
		if (!orgSlug) return null;
		return resolveNotificationHref({
			orgSlug,
			labels,
			entityType: n.entityType,
			entityId: n.entityId,
			notificationType: n.type,
			legacyActionUrl: n.actionUrl,
		});
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
		<div className="flex h-full w-full flex-col">
			{/* Header */}
			<div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-4 py-4 sm:px-6 sm:py-5">
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
				<div className="flex items-center gap-2">
					<Button
						type="button"
						size="sm"
						variant={unreadOnly ? "default" : "outline"}
						onClick={() => setUnreadOnly((v) => !v)}
						className="h-8 gap-1.5 text-xs"
					>
						<Mail className="size-3.5" />
						Unread only
						{unreadCount > 0 && unreadOnly && (
							<Badge
								variant="secondary"
								className="ms-1 h-4 min-w-4 rounded-full px-1 text-[10px]"
							>
								{unreadCount}
							</Badge>
						)}
					</Button>
					{unreadCount > 0 && (
						<Button
							type="button"
							size="sm"
							variant="default"
							onClick={() => markAllRead({})}
							className="h-8 gap-1.5 text-xs"
						>
							<CheckCheck className="size-3.5" />
							<span className="hidden sm:inline">Mark all as read</span>
							<span className="sm:hidden">All read</span>
						</Button>
					)}
				</div>
			</div>

			{/* Tabs — horizontally scrollable on mobile */}
			<div className="border-b border-border">
				<div className="flex items-center gap-1 overflow-x-auto px-3 py-2 sm:px-6 sm:py-2.5">
					{CATEGORIES.map(({ id, label, Icon }) => {
						const counts = countByCategory.get(id);
						const isActive = category === id;
						const hasUnread = (counts?.unread ?? 0) > 0;
						return (
							<button
								key={id}
								type="button"
								onClick={() => setCategory(id)}
								className={cn(
									"flex shrink-0 items-center gap-1.5 rounded-[var(--radius)] px-3 py-1.5 text-xs font-medium transition-colors",
									isActive
										? "bg-primary text-primary-foreground shadow-sm"
										: "text-muted-foreground hover:bg-muted hover:text-foreground",
								)}
							>
								<Icon className="size-3.5" />
								{label}
								{hasUnread && !isActive && (
									<span
										aria-hidden
										className="size-1.5 rounded-full bg-primary"
									/>
								)}
								{isActive && counts && counts.total > 0 && (
									<Badge
										variant="secondary"
										className="ms-1 h-4 min-w-4 rounded-full bg-primary-foreground/20 px-1 text-[10px] text-primary-foreground"
									>
										{counts.total}
									</Badge>
								)}
							</button>
						);
					})}
				</div>
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
							{unreadOnly
								? "No unread notifications in this category."
								: "No notifications here yet."}
						</p>
					</div>
				) : (
					<ul className="divide-y divide-border">
						{filtered.map((n) => {
							const href = buildHref(n);
							return (
								<li key={n._id}>
									{/* role="button" wrapper — NOT <button> — so the
									    inner Mark-as-read / Open <Button> chips don't
									    create invalid nested buttons. */}
									{/* biome-ignore lint/a11y/useSemanticElements: nested-button DOM error if outer is <button>; div+role is intentional */}
									<div
										role="button"
										tabIndex={0}
										onClick={() => handleCardClick(n)}
										onKeyDown={(e) => {
											if (e.key === "Enter" || e.key === " ") {
												e.preventDefault();
												handleCardClick(n);
											}
										}}
										aria-label={n.title}
										className={cn(
											"flex w-full cursor-pointer items-start gap-3 px-3 py-3 text-start transition-colors sm:gap-4 sm:px-6 sm:py-4",
											"focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset",
											!n.read
												? "bg-primary/[0.04] hover:bg-primary/[0.08]"
												: "hover:bg-muted/50",
										)}
									>
										{/* Icon */}
										<div
											className={cn(
												"flex size-9 shrink-0 items-center justify-center rounded-full text-base sm:size-10 sm:text-lg",
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
											<div className="mt-1.5 flex flex-wrap items-center gap-2">
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
									</div>
								</li>
							);
						})}
					</ul>
				)}
			</div>
		</div>
	);
}
