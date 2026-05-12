"use client";

/**
 * EntityCard — the ONE card component used by every entity (lead, contact,
 * deal, company). Premium kanban/list card designed once so Contact/Deal/
 * Company stop reimplementing a degenerate version.
 *
 * Layout:
 *   ┌─────────────────────────────────────────────────────────┐
 *   │ ◎ Name                       [tag] [tag]   [⋯ menu]     │  row 1
 *   │   email (or sub-line)                                   │
 *   │   <other cardFields rendered inline via catalog>        │
 *   │                                                         │
 *   │ 📎 3  💬 2  ⏰ Due today           [P-001]              │  row 2
 *   └─────────────────────────────────────────────────────────┘
 *   ← staleness-tinted left border
 *
 * Features:
 *   - Unified across all entities; per-entity drawers pass `menuItems`.
 *   - Event-stop wrappers around every interactive child so dnd-kit doesn't
 *     eat clicks on the Convert/Delete/Tag/Profile affordances.
 *   - Staleness border colour driven by org settings + `updatedAt` age.
 *   - Optional enrichment badges (files/messages/follow-ups) with click-to-open
 *     hover popovers.
 *   - Respects the per-session `cardFields` array — only renders what the user
 *     (or admin default) asked for.
 */

import {
	BellIcon,
	type LucideIcon,
	MessageSquareIcon,
	MoreVerticalIcon,
	PaperclipIcon,
} from "lucide-react";
import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { HoverCard, HoverCardContent, HoverCardTrigger } from "@/components/ui/hover-card";
import { KanbanItem } from "@/components/ui/kanban";
import type { Id } from "@/convex/_generated/dataModel";
import { PersonDisplay } from "@/core/entities/shared/components/PersonDisplay";
import { TagsCell } from "@/core/entities/shared/components/TagsCell";
import { FIELD_CATALOG } from "@/core/entities/shared/config/field-catalog";
import { PersonCodeBadge } from "@/core/entities/shared/PersonCodeBadge";
import type { EntitySlot, PersonRef } from "@/core/entities/shared/types";
import { cn } from "@/lib/utils";

// ─── Props ────────────────────────────────────────────────────────────────────

export type EntityCardItem = Record<string, unknown> & {
	id: string;
	_id?: string;
	orgId?: Id<"orgs">;
	personCode?: string;
	/** Name to show on top. Lead/contact: displayName; deal: title; company: name. */
	displayName?: string;
	title?: string;
	name?: string;
	email?: string;
	phone?: string;
	avatarUrl?: string;
	updatedAt?: number;
	// Enrichment counts (optional — rendered only if set by the query)
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

export interface EntityCardProps {
	slot: EntitySlot;
	item: EntityCardItem;
	/** Which cardFields (catalog keys) to render inline under the name. */
	cardFields?: string[];
	/** Right-side dropdown menu actions (Convert, Edit, Delete, etc.). */
	menuItems?: MenuAction[];
	/** Show the tag editor in the top-right cluster. Default: true for person-like entities. */
	showTags?: boolean;
	/** Link the avatar + name cluster to profile/detail page. Default true. */
	linkToProfile?: boolean;
	/** Staleness thresholds for the left border colour. */
	staleness?: {
		staleAfterDays?: number;
		warningAfterDays?: number;
	};
	/** Currency code for money fields (e.g. deal.value). */
	currencyCode?: string;
	isDragging?: boolean;
	onClick?: () => void;
}

// ─── Component ────────────────────────────────────────────────────────────────

export function EntityCard({
	slot,
	item,
	cardFields,
	menuItems,
	showTags = true,
	linkToProfile = true,
	staleness,
	currencyCode,
	isDragging,
	onClick,
}: EntityCardProps) {
	const [menuOpen, setMenuOpen] = useState(false);

	const title = item.displayName ?? item.title ?? item.name ?? "Untitled";
	const itemId = (item._id ?? item.id) as string;
	const orgId = item.orgId;

	// Person descriptor for PersonDisplay (covers lead + contact with avatars)
	const isPersonLike = slot === "lead" || slot === "contact";
	const person: PersonRef = {
		id: itemId,
		type: isPersonLike ? (slot as "lead" | "contact") : "lead",
		personCode: item.personCode,
		displayName: title,
		email: item.email,
		phone: item.phone,
		avatarUrl: item.avatarUrl,
	};

	// Staleness border colour (left edge only so it reads as a status bar)
	const borderClass = useStalenessBorder(item.updatedAt, staleness);

	// Sub-fields to render below the name (excluding email which has its own line)
	const catalog = FIELD_CATALOG[slot];
	const inlineFields = useMemo(() => {
		if (!cardFields?.length) return [] as string[];
		return cardFields.filter((key) => {
			if (key === "email" || key === "displayName" || key === "name" || key === "title")
				return false;
			const spec = catalog?.[key];
			if (!spec) return false;
			const v = item[key];
			return v !== undefined && v !== null && v !== "";
		});
	}, [cardFields, catalog, item]);

	return (
		<KanbanItem value={item.id} asHandle asChild>
			{/* biome-ignore lint/a11y/noStaticElementInteractions: KanbanItem renders this div with drag listeners; onClick/onKeyDown make it keyboard-accessible */}
			<div
				onClick={onClick}
				onKeyDown={(e) => {
					if ((e.key === "Enter" || e.key === " ") && onClick) {
						e.preventDefault();
						onClick();
					}
				}}
				role={onClick ? "button" : undefined}
				tabIndex={onClick ? 0 : -1}
				className={cn(
					"group/card relative flex cursor-grab flex-col gap-1 rounded-[var(--radius)] border bg-card px-2.5 py-2 text-xs shadow-xs transition-all",
					"hover:border-ring/40 hover:shadow-sm",
					borderClass,
					isDragging && "rotate-1 opacity-60 shadow-lg",
				)}
			>
				{/* Row 1: avatar + name + top-right tags + menu */}
				<div className="flex items-start gap-2">
					<div className="flex min-w-0 flex-1 flex-col gap-0.5">
						{/* biome-ignore lint/a11y/noStaticElementInteractions: event-stop wrapper isolates the profile link from drag */}
						<div
							className="min-w-0"
							onPointerDown={(e) => e.stopPropagation()}
							onClick={(e) => e.stopPropagation()}
							onKeyDown={(e) => e.stopPropagation()}
						>
							{isPersonLike ? (
								<PersonDisplay
									person={person}
									show={["avatar", "name"]}
									size="xs"
									clickable={linkToProfile}
								/>
							) : (
								<span className="truncate font-medium leading-tight">{title}</span>
							)}
						</div>
						{item.email && (
							<span className="truncate text-[11px] text-muted-foreground">
								{item.email}
							</span>
						)}
						{/* Inline cardFields (anything not handled above) */}
						{inlineFields.map((key) => {
							const spec = catalog?.[key];
							const raw = item[key];
							return (
								<span
									key={key}
									className="truncate text-[11px] text-muted-foreground"
								>
									<span className="opacity-70">{spec?.label ?? key}:</span>{" "}
									{formatValue(raw, currencyCode)}
								</span>
							);
						})}
					</div>

					<div className="flex shrink-0 items-center gap-1">
						{showTags && orgId && (
							// biome-ignore lint/a11y/noStaticElementInteractions: event-stop wrapper isolates tag editor from drag
							<div
								onPointerDown={(e) => e.stopPropagation()}
								onClick={(e) => e.stopPropagation()}
								onKeyDown={(e) => e.stopPropagation()}
							>
								<TagsCell
									orgId={orgId}
									entityType={slot}
									entityId={itemId}
									size="xs"
									max={2}
								/>
							</div>
						)}

						{menuItems && menuItems.length > 0 && (
							// biome-ignore lint/a11y/noStaticElementInteractions: event-stop wrapper isolates the menu from drag
							<div
								onPointerDown={(e) => e.stopPropagation()}
								onClick={(e) => e.stopPropagation()}
								onKeyDown={(e) => e.stopPropagation()}
							>
								<DropdownMenu open={menuOpen} onOpenChange={setMenuOpen}>
									<DropdownMenuTrigger asChild>
										<Button
											size="icon"
											variant="ghost"
											className="size-5 opacity-0 transition-opacity group-hover/card:opacity-100"
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
												separator={
													a.separatorBefore ||
													(i > 0 &&
														menuItems[i - 1].variant !== a.variant)
												}
											/>
										))}
									</DropdownMenuContent>
								</DropdownMenu>
							</div>
						)}
					</div>
				</div>

				{/* Row 2: enrichment badges + personCode */}
				<div className="flex items-center justify-between gap-2 pt-0.5">
					<EnrichmentBadges item={item} />
					{item.personCode && (
						// biome-ignore lint/a11y/noStaticElementInteractions: event-stop wrapper isolates the badge link from drag
						<div
							onPointerDown={(e) => e.stopPropagation()}
							onClick={(e) => e.stopPropagation()}
							onKeyDown={(e) => e.stopPropagation()}
						>
							<PersonCodeBadge
								personCode={item.personCode}
								className="h-4 border-0 bg-muted px-1.5 py-0 text-[9px]"
							/>
						</div>
					)}
				</div>
			</div>
		</KanbanItem>
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
	separator: boolean;
}) {
	return (
		<>
			{action.separatorBefore && <DropdownMenuSeparator />}
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
			{separator ? null : null}
		</>
	);
}

function EnrichmentBadges({ item }: { item: EntityCardItem }) {
	const hasAny =
		(item.fileCount ?? 0) > 0 || (item.messageCount ?? 0) > 0 || (item.followupCount ?? 0) > 0;
	if (!hasAny) return <div />;
	return (
		// biome-ignore lint/a11y/noStaticElementInteractions: event-stop wrapper isolates badge hovers from drag
		<div
			className="flex items-center gap-1.5"
			onPointerDown={(e) => e.stopPropagation()}
			onClick={(e) => e.stopPropagation()}
			onKeyDown={(e) => e.stopPropagation()}
		>
			{(item.fileCount ?? 0) > 0 && (
				<HoverCard openDelay={200} closeDelay={80}>
					<HoverCardTrigger asChild>
						<span className="inline-flex items-center gap-0.5 rounded-[calc(var(--radius)-2px)] bg-muted px-1 py-0.5 text-[10px] text-muted-foreground transition-colors hover:bg-accent hover:text-foreground">
							<PaperclipIcon className="size-3" />
							{item.fileCount}
						</span>
					</HoverCardTrigger>
					<HoverCardContent align="start" className="w-60 p-2 text-xs">
						<p className="font-medium">
							{item.fileCount} {item.fileCount === 1 ? "file" : "files"} attached
						</p>
						<p className="mt-1 text-[11px] text-muted-foreground">
							Click to view in the record.
						</p>
					</HoverCardContent>
				</HoverCard>
			)}
			{(item.messageCount ?? 0) > 0 && (
				<HoverCard openDelay={200} closeDelay={80}>
					<HoverCardTrigger asChild>
						<span className="inline-flex items-center gap-0.5 rounded-[calc(var(--radius)-2px)] bg-muted px-1 py-0.5 text-[10px] text-muted-foreground transition-colors hover:bg-accent hover:text-foreground">
							<MessageSquareIcon className="size-3" />
							{item.messageCount}
						</span>
					</HoverCardTrigger>
					<HoverCardContent align="start" className="w-60 p-2 text-xs">
						<p className="font-medium">
							{item.messageCount} {item.messageCount === 1 ? "message" : "messages"}
						</p>
					</HoverCardContent>
				</HoverCard>
			)}
			{(item.followupCount ?? 0) > 0 && (
				<HoverCard openDelay={200} closeDelay={80}>
					<HoverCardTrigger asChild>
						<span className="inline-flex items-center gap-0.5 rounded-[calc(var(--radius)-2px)] bg-muted px-1 py-0.5 text-[10px] text-muted-foreground transition-colors hover:bg-accent hover:text-foreground">
							<BellIcon className="size-3" />
							{item.followupCount}
						</span>
					</HoverCardTrigger>
					<HoverCardContent align="start" className="w-60 p-2 text-xs">
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
		</div>
	);
}

/**
 * Derive a `border-s-*` colour class based on how long ago the record was
 * updated vs. the staleness thresholds from settings.
 *
 * - fresh        → no accent
 * - warning      → amber left border
 * - stale        → red left border
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

function formatValue(value: unknown, currencyCode?: string): string {
	if (value === null || value === undefined) return "—";
	if (typeof value === "number" && currencyCode) {
		try {
			return new Intl.NumberFormat(undefined, {
				style: "currency",
				currency: currencyCode,
				maximumFractionDigits: 0,
			}).format(value);
		} catch {
			return String(value);
		}
	}
	if (typeof value === "number" && value > 1e12) {
		// looks like a timestamp in ms
		return formatDate(value);
	}
	if (typeof value === "string") return value;
	return String(value);
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
