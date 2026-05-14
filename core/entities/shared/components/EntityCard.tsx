"use client";

/**
 * EntityCard — the ONE card component used by every entity (lead, contact,
 * deal, company).
 *
 * LAYOUT (spec):
 *   ┌─────────────────────────────────────────────┐
 *   │ ◎ Name                          [tag][tag]  │   row 1 — identity + tags (no menu here)
 *   │   email                                     │
 *   ├─────────────────────────────────────────────┤
 *   │ AI: Short 1–2 line summary of this record ▾ │   row 2 — AI summary (clickable ▾ expands)
 *   ├─────────────────────────────────────────────┤
 *   │ [P-001] ◎assignee         ⋮  [📎3]  [+] [🗑] │   row 3 — code + avatar | menu + shortcuts
 *   └─────────────────────────────────────────────┘
 *                                                ↑
 *                                     grip (drag handle) on right edge
 *
 * KEY RULES:
 *   - Only the vertical grip on the right edge is draggable. Clicks
 *     everywhere else behave normally (profile link, menu, shortcuts).
 *   - Tags live TOP-right — a lightweight TagsCell instance in its own
 *     event-stop wrapper so editing never starts a drag.
 *   - The menu (⋮) sits BOTTOM-right — right before the shortcut cluster —
 *     so it's always visible alongside the + / trash buttons.
 *   - AI summary is a middle strip. When the content exceeds 2 lines we show
 *     a down-arrow (▾). Clicking expands; clicking again collapses.
 *   - Assignee avatar sits next to the personCode badge at the bottom-left.
 *   - No inline "Status / Source / …" middle fields anymore — these are
 *     handled on the detail page / column grouping, not stacked on the card.
 */

import {
	BellIcon,
	ChevronDownIcon,
	GripVerticalIcon,
	type LucideIcon,
	MoreVerticalIcon,
	PaperclipIcon,
	SparklesIcon,
} from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { HoverCard, HoverCardContent, HoverCardTrigger } from "@/components/ui/hover-card";
import { KanbanItem, KanbanItemHandle } from "@/components/ui/kanban";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { Id } from "@/convex/_generated/dataModel";
import { AssigneeCell } from "@/core/entities/shared/components/AssigneeCell";
import { TagsCell } from "@/core/entities/shared/components/TagsCell";
import { PersonCodeBadge } from "@/core/entities/shared/PersonCodeBadge";
import type { EntitySlot } from "@/core/entities/shared/types";
import { cn } from "@/lib/utils";

// ─── Props ────────────────────────────────────────────────────────────────────

export type EntityCardItem = Record<string, unknown> & {
	id: string;
	_id?: string;
	orgId?: Id<"orgs">;
	personCode?: string;
	displayName?: string;
	title?: string;
	name?: string;
	email?: string;
	phone?: string;
	avatarUrl?: string;
	assignedTo?: string;
	updatedAt?: number;
	/** Short 1–2 line AI-generated summary. When undefined → the middle strip is hidden. */
	aiSummary?: string;
	// Enrichment counts (optional — only rendered when > 0)
	fileCount?: number;
	messageCount?: number;
	followupCount?: number;
	nextFollowupAt?: number;
};

export interface MenuAction {
	label: string;
	icon?: LucideIcon;
	onSelect: () => void;
	variant?: "default" | "destructive";
	separatorBefore?: boolean;
}

export interface EntityShortcut {
	/** ARIA label and tooltip text. */
	label: string;
	icon: LucideIcon;
	onSelect: () => void;
	/** Primary = filled button, secondary = ghost. Default: secondary. */
	variant?: "primary" | "secondary";
}

export interface EntityCardProps {
	slot: EntitySlot;
	item: EntityCardItem;
	/** Which cardFields to render (visibility toggles for email/personCode/tags/avatar/aiSummary/assignee). */
	cardFields?: string[];
	/** Icon-only shortcut buttons rendered in the bottom-right cluster. */
	shortcuts?: EntityShortcut[];
	/** Right-side overflow menu (Edit, Delete, Revert, etc.). Rendered bottom-right before shortcuts. */
	menuItems?: MenuAction[];
	/** Staleness thresholds for the left border colour. */
	staleness?: {
		staleAfterDays?: number;
		warningAfterDays?: number;
	};
	isDragging?: boolean;
	/** When true, the card briefly flashes (used for search matches). */
	isHighlighted?: boolean;
	/** Incrementing counter that triggers the flash animation to replay. */
	highlightEpoch?: number;
}

// ─── Component ────────────────────────────────────────────────────────────────

export function EntityCard({
	slot,
	item,
	cardFields,
	shortcuts,
	menuItems,
	staleness,
	isDragging,
	isHighlighted,
	highlightEpoch,
}: EntityCardProps) {
	const [menuOpen, setMenuOpen] = useState(false);
	const [summaryExpanded, setSummaryExpanded] = useState(false);
	const params = useParams();
	const orgSlug = params?.orgSlug as string | undefined;
	const locale = params?.locale as string | undefined;

	// Flash animation replay — toggling the class off-then-on in an effect
	// forces the browser to re-run the CSS animation without re-mounting the
	// card (re-mount would tear down the dnd-kit sortable registration).
	const rootRef = useRef<HTMLDivElement | null>(null);
	useEffect(() => {
		if (!isHighlighted || !highlightEpoch) return;
		const el = rootRef.current;
		if (!el) return;
		el.classList.remove("entity-card-flash");
		// Force reflow so the animation restarts from the beginning.
		void el.offsetWidth;
		el.classList.add("entity-card-flash");
		const t = window.setTimeout(() => el.classList.remove("entity-card-flash"), 1600);
		return () => window.clearTimeout(t);
	}, [isHighlighted, highlightEpoch]);

	const title = item.displayName ?? item.title ?? item.name ?? "Untitled";
	const itemId = (item._id ?? item.id) as string;
	const orgId = item.orgId;
	const isPersonLike = slot === "lead" || slot === "contact";

	// Per-piece visibility flags — every piece is addressable by cardFields.
	const fields = cardFields ?? [];
	const showEmail = fields.includes("email") && !!item.email;
	const showTags = fields.includes("tags") && !!orgId;
	const showPersonCode = fields.includes("personCode") && !!item.personCode;
	const showAssignee = fields.includes("assignedTo") && !!item.assignedTo;
	const showSummary = fields.includes("aiSummary") && !!item.aiSummary;
	const showAvatar = isPersonLike && fields.includes("avatar") !== false; // on unless explicitly hidden

	// Staleness border colour (left edge only so it reads as a status bar)
	const borderClass = useStalenessBorder(item.updatedAt, staleness);

	// Profile link — only when we have a personCode and org context.
	const profileHref =
		item.personCode && orgSlug
			? locale
				? `/${locale}/${orgSlug}/profile/${item.personCode}`
				: `/${orgSlug}/profile/${item.personCode}`
			: null;

	const initials = getInitials(title);

	// AI summary truncation logic: collapsed = clamp-2; expanded = no clamp.
	const summaryClassName = cn(
		"text-[11px] leading-snug text-muted-foreground",
		!summaryExpanded && "line-clamp-2",
	);

	return (
		<KanbanItem value={item.id} asChild>
			<div
				ref={rootRef}
				className={cn(
					"group/card relative flex flex-col gap-1.5 rounded-[var(--radius)] border bg-card ps-2.5 pe-5 py-2 text-xs shadow-xs transition-all",
					"hover:border-ring/40 hover:shadow-sm",
					borderClass,
					isDragging && "rotate-1 opacity-60 shadow-lg",
				)}
			>
				{/* ── Row 1: identity (top-left) + tags (top-right) ── */}
				<div className="flex items-start gap-2">
					{/* Identity — avatar + (name/email) → profile */}
					<IdentityCluster
						href={profileHref}
						avatarUrl={item.avatarUrl}
						initials={initials}
						showAvatar={showAvatar}
						title={title}
						email={showEmail ? item.email : undefined}
					/>

					{/* Tags — TOP-right corner */}
					{showTags && (
						// biome-ignore lint/a11y/noStaticElementInteractions: event-stop wrapper isolates tag editor from drag listeners
						<div
							className="shrink-0"
							onPointerDown={(e) => e.stopPropagation()}
							onClick={(e) => e.stopPropagation()}
							onKeyDown={(e) => e.stopPropagation()}
						>
							<TagsCell
								orgId={orgId as Id<"orgs">}
								entityType={slot}
								entityId={itemId}
								size="xs"
								max={2}
								readOnlyAfterFirst
							/>
						</div>
					)}
				</div>

				{/* ── Row 2: AI summary (collapsed 2 lines, ▾ to expand) ── */}
				{showSummary && (
					<div className="flex items-start gap-1.5 rounded-[calc(var(--radius)-2px)] bg-muted/30 px-2 py-1">
						<SparklesIcon className="mt-0.5 size-3 shrink-0 text-muted-foreground" />
						<p className={summaryClassName}>{item.aiSummary}</p>
						<button
							type="button"
							aria-label={summaryExpanded ? "Collapse summary" : "Expand summary"}
							className="ms-auto shrink-0 rounded-[calc(var(--radius)-2px)] p-0.5 text-muted-foreground transition-transform hover:bg-muted hover:text-foreground"
							onPointerDown={(e) => e.stopPropagation()}
							onClick={(e) => {
								e.stopPropagation();
								setSummaryExpanded((v) => !v);
							}}
						>
							<ChevronDownIcon
								className={cn(
									"size-3 transition-transform",
									summaryExpanded && "rotate-180",
								)}
							/>
						</button>
					</div>
				)}

				{/* ── Row 3: personCode + assignee (bottom-left) | menu + shortcuts (bottom-right) ── */}
				{(showPersonCode ||
					showAssignee ||
					(shortcuts && shortcuts.length > 0) ||
					(menuItems && menuItems.length > 0)) && (
					<div className="flex items-center justify-between gap-2 pt-0.5">
						{/* Bottom-left cluster: personCode badge + assignee avatar */}
						<div className="flex min-w-0 items-center gap-1.5">
							{showPersonCode && (
								// biome-ignore lint/a11y/noStaticElementInteractions: event-stop wrapper isolates the badge link from drag listeners
								<div
									onPointerDown={(e) => e.stopPropagation()}
									onClick={(e) => e.stopPropagation()}
									onKeyDown={(e) => e.stopPropagation()}
								>
									<PersonCodeBadge
										personCode={item.personCode as string}
										className="h-4 border-0 bg-muted px-1.5 py-0 text-[9px]"
									/>
								</div>
							)}
							{showAssignee && (
								// biome-ignore lint/a11y/noStaticElementInteractions: event-stop wrapper keeps the assignee link from starting a drag
								<div
									onPointerDown={(e) => e.stopPropagation()}
									onClick={(e) => e.stopPropagation()}
									onKeyDown={(e) => e.stopPropagation()}
								>
									<AssigneeCell
										orgId={orgId as Id<"orgs"> | undefined}
										userId={item.assignedTo as Id<"users"> | undefined}
										show={["avatar"]}
									/>
								</div>
							)}
						</div>

						{/* Bottom-right cluster: menu (⋮) + shortcuts + enrichment pills */}
						{/* biome-ignore lint/a11y/noStaticElementInteractions: event-stop wrapper keeps menu/shortcut clicks from starting a drag */}
						<div
							className="flex items-center gap-1"
							onPointerDown={(e) => e.stopPropagation()}
							onClick={(e) => e.stopPropagation()}
							onKeyDown={(e) => e.stopPropagation()}
						>
							{menuItems && menuItems.length > 0 && (
								<DropdownMenu open={menuOpen} onOpenChange={setMenuOpen}>
									<DropdownMenuTrigger asChild>
										<Button
											size="icon"
											variant="ghost"
											className="size-5 text-muted-foreground hover:text-foreground"
											aria-label="More actions"
										>
											<MoreVerticalIcon className="size-3" />
										</Button>
									</DropdownMenuTrigger>
									<DropdownMenuContent align="end" className="text-xs">
										{menuItems.map((a, i) => (
											<MenuItemRow
												key={a.label}
												action={a}
												closeMenu={() => setMenuOpen(false)}
												separator={a.separatorBefore && i > 0}
											/>
										))}
									</DropdownMenuContent>
								</DropdownMenu>
							)}
							<ShortcutCluster shortcuts={shortcuts} item={item} />
						</div>
					</div>
				)}

				{/* ── Vertical drag grip — right-edge, the ONLY drag handle ── */}
				<KanbanItemHandle asChild>
					<button
						type="button"
						aria-label="Drag card"
						className={cn(
							"absolute inset-y-1 end-0 flex w-4 cursor-grab items-center justify-center rounded-e-[var(--radius)] text-muted-foreground/40 transition-colors",
							"hover:bg-muted hover:text-muted-foreground focus-visible:bg-muted focus-visible:outline-none",
							"data-dragging:cursor-grabbing",
						)}
					>
						<GripVerticalIcon className="size-3" />
					</button>
				</KanbanItemHandle>
			</div>
		</KanbanItem>
	);
}

// ─── Identity cluster (avatar + name + email → profile) ──────────────────────

function IdentityCluster({
	href,
	avatarUrl,
	initials,
	showAvatar,
	title,
	email,
}: {
	href: string | null;
	avatarUrl?: string;
	initials: string;
	showAvatar: boolean;
	title: string;
	email?: string;
}) {
	const content = (
		<span className="flex min-w-0 flex-1 items-center gap-2">
			{showAvatar && (
				<Avatar className="size-6 shrink-0">
					<AvatarImage src={avatarUrl} alt={title} />
					<AvatarFallback className="text-[9px]">{initials}</AvatarFallback>
				</Avatar>
			)}
			<span className="flex min-w-0 flex-col leading-tight">
				<span className="truncate font-medium">{title}</span>
				{email && (
					<span className="truncate text-[11px] text-muted-foreground">{email}</span>
				)}
			</span>
		</span>
	);

	if (!href) return content;

	return (
		// biome-ignore lint/a11y/noStaticElementInteractions: event-stop wrapper isolates the profile link from drag listeners
		<span
			className="min-w-0 flex-1"
			onPointerDown={(e) => e.stopPropagation()}
			onClick={(e) => e.stopPropagation()}
			onKeyDown={(e) => e.stopPropagation()}
		>
			<Link
				href={href}
				className="group/identity inline-flex w-full min-w-0 rounded-[calc(var(--radius)-2px)] no-underline outline-none focus-visible:ring-1 focus-visible:ring-ring hover:no-underline"
				style={{ textDecoration: "none" }}
			>
				{content}
			</Link>
		</span>
	);
}

// ─── Shortcut cluster (bottom-right: + / trash + files / followups chips) ────

function ShortcutCluster({
	shortcuts,
	item,
}: {
	shortcuts?: EntityShortcut[];
	item: EntityCardItem;
}) {
	const hasFiles = (item.fileCount ?? 0) > 0;
	const hasFollowups = (item.followupCount ?? 0) > 0;

	if (!shortcuts?.length && !hasFiles && !hasFollowups) return null;

	return (
		<>
			{hasFiles && (
				<HoverCard openDelay={200} closeDelay={80}>
					<HoverCardTrigger asChild>
						<span className="inline-flex items-center gap-0.5 rounded-[calc(var(--radius)-2px)] bg-muted px-1 py-0.5 text-[10px] text-muted-foreground transition-colors hover:bg-accent hover:text-foreground">
							<PaperclipIcon className="size-3" />
							{item.fileCount}
						</span>
					</HoverCardTrigger>
					<HoverCardContent align="end" className="w-60 p-2 text-xs">
						<p className="font-medium">
							{item.fileCount} {item.fileCount === 1 ? "file" : "files"} attached
						</p>
						<p className="mt-1 text-[11px] text-muted-foreground">
							Open the record to view or download.
						</p>
					</HoverCardContent>
				</HoverCard>
			)}

			{hasFollowups && (
				<HoverCard openDelay={200} closeDelay={80}>
					<HoverCardTrigger asChild>
						<span className="inline-flex items-center gap-0.5 rounded-[calc(var(--radius)-2px)] bg-muted px-1 py-0.5 text-[10px] text-muted-foreground transition-colors hover:bg-accent hover:text-foreground">
							<BellIcon className="size-3" />
							{item.followupCount}
						</span>
					</HoverCardTrigger>
					<HoverCardContent align="end" className="w-60 p-2 text-xs">
						<p className="font-medium">
							{item.followupCount} open follow-
							{item.followupCount === 1 ? "up" : "ups"}
						</p>
						{item.nextFollowupAt && (
							<p className="mt-1 text-[11px] text-muted-foreground">
								Next due: {formatDate(item.nextFollowupAt)}
							</p>
						)}
					</HoverCardContent>
				</HoverCard>
			)}

			{shortcuts?.map((s) => (
				<Tooltip key={s.label}>
					<TooltipTrigger asChild>
						<Button
							size="icon"
							variant={s.variant === "primary" ? "default" : "ghost"}
							onClick={s.onSelect}
							aria-label={s.label}
							className={cn(
								"size-5",
								s.variant !== "primary" && "opacity-70 hover:opacity-100",
							)}
						>
							<s.icon className="size-3" />
						</Button>
					</TooltipTrigger>
					<TooltipContent side="top" className="text-xs">
						{s.label}
					</TooltipContent>
				</Tooltip>
			))}
		</>
	);
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function MenuItemRow({
	action,
	closeMenu,
	separator,
}: {
	action: MenuAction;
	closeMenu: () => void;
	separator?: boolean;
}) {
	return (
		<>
			{separator && <DropdownMenuSeparator />}
			<DropdownMenuItem
				onSelect={() => {
					closeMenu();
					action.onSelect();
				}}
				className={
					action.variant === "destructive"
						? "text-destructive focus:text-destructive"
						: undefined
				}
			>
				{action.icon && <action.icon className="me-2 size-3.5" />}
				{action.label}
			</DropdownMenuItem>
		</>
	);
}

/**
 * Derive a `border-s-*` colour class based on how long ago the record was
 * updated vs. the staleness thresholds from settings.
 */
function useStalenessBorder(
	updatedAt: number | undefined,
	staleness: EntityCardProps["staleness"],
): string {
	if (!updatedAt || !staleness) return "";
	const { staleAfterDays, warningAfterDays } = staleness;
	const days = Math.floor((Date.now() - updatedAt) / (1000 * 60 * 60 * 24));
	if (staleAfterDays && days >= staleAfterDays) return "border-s-2 border-s-destructive";
	if (warningAfterDays && days >= warningAfterDays) return "border-s-2 border-s-amber-500";
	return "";
}

function getInitials(name: string): string {
	const parts = name.trim().split(/\s+/).filter(Boolean);
	if (parts.length === 0) return "?";
	if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
	return (parts[0]![0]! + parts[parts.length - 1]![0]!).toUpperCase();
}

function formatDate(ts: number): string {
	try {
		return new Date(ts).toLocaleDateString(undefined, {
			month: "short",
			day: "numeric",
			year: "numeric",
		});
	} catch {
		return String(ts);
	}
}
