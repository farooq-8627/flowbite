"use client";

/**
 * MessagesSidebar — list of conversations the caller is in.
 *
 * 2026-05-16 redesign (per user direction):
 *   - The standalone search input was searching message previews — not what
 *     users want. It's gone. Search is now part of the unified
 *     "search-or-create" dialog (`NewConversationDialog`), which actually
 *     searches the contact graph.
 *   - The All/Unread/Archived tabs were removed from the toolbar and folded
 *     into a `MoreHorizontal` dropdown menu on the start side. Cleaner top
 *     bar, same functionality.
 *   - The `+ New` button is now a single search icon on the end side. It
 *     opens the same dialog. One entry point for "search existing" and
 *     "start new" — they're the same action with different inputs.
 *   - Each conversation row resolves the real entity name via
 *     `useEntityDisplay` (people, deals, companies). The personCode lives
 *     in a small monospace badge on the end side. No more "Lead · P-005".
 *
 * 2026-05-17 update (per user direction):
 *   - Sidebar timestamps switched from "1 hour ago" relative strings to
 *     WhatsApp-style exact times: today → "2:45 PM", yesterday → "Yesterday",
 *     within a week → weekday name, older → short date. AM/PM follows the
 *     user's locale; future hook for an org-wide `timeFormat` override is
 *     documented in MODULE.md.
 *
 * Donor reference: shadboard `apps/chat/_components/chat-sidebar/`. Most of
 * the donor's structure was kept; only the toolbar and row layout changed.
 */
import { Archive, Check, Inbox, MailOpen, Menu, Search } from "lucide-react";
import { useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuLabel,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { Doc, Id } from "@/convex/_generated/dataModel";
import { useInbox } from "@/core/comms/messages/hooks";
import type { BatchedEntityDisplay } from "@/core/comms/messages/hooks/useEntityDisplaysBatched";
import { useEntityDisplaysBatched } from "@/core/comms/messages/hooks/useEntityDisplaysBatched";
import { formatChatSidebarTime } from "@/lib/datetime";
import { cn } from "@/lib/utils";
import { ChatAvatar } from "./ChatAvatar";
import { NewConversationDialog } from "./NewConversationDialog";

type InboxRow = {
	conversation: Doc<"conversations">;
	membership: Doc<"conversationMembers">;
	unread: boolean;
};

type MessagesSidebarProps = {
	orgId: Id<"orgs">;
	selectedConversationId: Id<"conversations"> | null;
	onSelect: (conversationId: Id<"conversations">) => void;
	className?: string;
};

const FILTERS = [
	{ id: "all", label: "All", Icon: Inbox },
	{ id: "unread", label: "Unread", Icon: MailOpen },
	{ id: "archived", label: "Archived", Icon: Archive },
] as const;

type FilterId = (typeof FILTERS)[number]["id"];

function previewLine(conversation: Doc<"conversations">): string {
	if (conversation.lastMessagePreview) return conversation.lastMessagePreview;
	return "No messages yet";
}

function ConversationItem({
	row,
	isSelected,
	onSelect,
	display,
}: {
	row: InboxRow;
	isSelected: boolean;
	onSelect: (id: Id<"conversations">) => void;
	display: BatchedEntityDisplay | undefined;
}) {
	const { conversation, unread } = row;
	const lastAt = conversation.lastMessageAt ?? conversation.createdAt;
	const timeLabel = formatChatSidebarTime(lastAt);

	const title = conversation.title ?? display?.name ?? conversation.entityId ?? "Thread";

	return (
		<li>
			<button
				type="button"
				onClick={() => onSelect(conversation._id)}
				aria-current={isSelected ? "true" : undefined}
				className={cn(
					"flex w-full items-start gap-3 rounded-[var(--radius)] px-3 py-2 text-start transition-colors",
					"hover:bg-accent hover:text-accent-foreground",
					"focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50",
					isSelected && "bg-accent text-accent-foreground",
				)}
			>
				<ChatAvatar name={title} src={display?.avatarUrl} size={2.25} className="mt-0.5" />
				<div className="grid min-w-0 flex-1 grid-cols-[1fr_auto] gap-x-2">
					<span
						className={cn(
							"col-start-1 truncate text-sm",
							unread ? "font-semibold text-foreground" : "text-foreground",
						)}
					>
						{title}
					</span>
					<span
						className="col-start-2 shrink-0 text-[10px] tabular-nums text-muted-foreground"
						title={new Date(lastAt).toLocaleString()}
					>
						{timeLabel}
					</span>
					<span
						className={cn(
							"col-start-1 truncate text-xs",
							unread ? "text-foreground" : "text-muted-foreground",
						)}
					>
						{previewLine(conversation)}
					</span>
					<span className="col-start-2 flex shrink-0 items-center gap-1">
						{unread && (
							<Badge
								variant="default"
								className="h-4 min-w-4 rounded-full px-1 text-[10px]"
								aria-label="Unread"
							>
								·
							</Badge>
						)}
						{conversation.entityType !== "user" && (
							<span
								className="rounded-full bg-muted px-1.5 py-0.5 font-mono text-[9px] uppercase text-muted-foreground"
								title={display?.kindLabel}
							>
								{conversation.entityId}
							</span>
						)}
					</span>
				</div>
			</button>
		</li>
	);
}

export function MessagesSidebar({
	orgId,
	selectedConversationId,
	onSelect,
	className,
}: MessagesSidebarProps) {
	const [filter, setFilter] = useState<FilterId>("all");
	const [pickerOpen, setPickerOpen] = useState(false);

	const inbox = useInbox({ orgId, filter, limit: 25 });
	const rows: InboxRow[] = inbox ?? [];

	// Batched entity display — one subscription for all visible rows.
	const displayItems = useMemo(
		() =>
			rows.map((r) => ({
				entityType: r.conversation.entityType,
				entityId: r.conversation.entityId,
			})),
		[rows],
	);
	const displaysMap = useEntityDisplaysBatched({ orgId, items: displayItems });

	const activeFilter = FILTERS.find((f) => f.id === filter) ?? FILTERS[0];
	const ActiveIcon = activeFilter.Icon;

	return (
		<aside
			className={cn(
				"flex h-full flex-col gap-2 border-e border-border bg-background",
				className,
			)}
			aria-label="Conversations"
		>
			{/* Toolbar */}
			<div className="flex items-center justify-between gap-2 border-b border-border p-3">
				<div className="flex items-center gap-1">
					<DropdownMenu>
						<DropdownMenuTrigger asChild>
							<Button
								type="button"
								size="icon"
								variant="ghost"
								className="size-8"
								aria-label="Filter conversations"
								title="Filter conversations"
							>
								<Menu className="size-4" aria-hidden="true" />
							</Button>
						</DropdownMenuTrigger>
						<DropdownMenuContent align="start" className="w-48">
							<DropdownMenuLabel>Show</DropdownMenuLabel>
							<DropdownMenuSeparator />
							{FILTERS.map((f) => {
								const Icon = f.Icon;
								const active = filter === f.id;
								return (
									<DropdownMenuItem
										key={f.id}
										onSelect={() => setFilter(f.id)}
										className="gap-2"
									>
										<Icon className="size-3.5" aria-hidden="true" />
										<span className="flex-1">{f.label}</span>
										{active && (
											<Check className="size-3.5" aria-hidden="true" />
										)}
									</DropdownMenuItem>
								);
							})}
						</DropdownMenuContent>
					</DropdownMenu>

					<div className="flex items-center gap-1.5">
						<h1 className="text-sm font-semibold text-foreground">Messages</h1>
						<span className="flex items-center gap-1 rounded-full bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
							<ActiveIcon className="size-2.5" aria-hidden="true" />
							{activeFilter.label}
						</span>
					</div>
				</div>

				<Button
					type="button"
					size="icon"
					variant="outline"
					onClick={() => setPickerOpen(true)}
					className="size-8"
					aria-label="Search or start a conversation"
					title="Search or start a conversation"
				>
					<Search className="size-4" aria-hidden="true" />
				</Button>
			</div>

			{/* List */}
			<div className="min-h-0 flex-1 overflow-y-auto px-2 pb-3">
				{inbox === undefined ? (
					<p className="px-3 py-4 text-xs text-muted-foreground">Loading…</p>
				) : rows.length === 0 ? (
					<div className="flex flex-col gap-3 px-3 py-4">
						<p className="text-xs text-muted-foreground">
							{filter === "unread"
								? "Inbox zero."
								: filter === "archived"
									? "Nothing archived."
									: "No conversations yet."}
						</p>
						{filter === "all" && (
							<Button
								type="button"
								size="sm"
								variant="default"
								onClick={() => setPickerOpen(true)}
								className="h-8 gap-1.5 self-start text-xs"
							>
								<Search className="size-3.5" aria-hidden="true" />
								Start a conversation
							</Button>
						)}
					</div>
				) : (
					<ul className="flex flex-col gap-0.5">
						{rows.map((row) => (
							<ConversationItem
								key={row.conversation._id}
								row={row}
								isSelected={selectedConversationId === row.conversation._id}
								onSelect={onSelect}
								display={
									displaysMap?.[
										`${row.conversation.entityType}:${row.conversation.entityId}`
									]
								}
							/>
						))}
					</ul>
				)}
			</div>

			<NewConversationDialog
				orgId={orgId}
				open={pickerOpen}
				onOpenChange={setPickerOpen}
				onCreated={(conversationId) => {
					onSelect(conversationId);
					setPickerOpen(false);
				}}
			/>
		</aside>
	);
}
