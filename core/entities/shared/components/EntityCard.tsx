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
import { useEffect, useMemo, useRef, useState } from "react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
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
import { IdentityBadge } from "@/core/entities/shared/components/IdentityBadge";
import { TagsCell } from "@/core/entities/shared/components/TagsCell";
import { getStatusColor } from "@/core/entities/shared/config/defaults";
import type { EntitySlot } from "@/core/entities/shared/types";
import { getRevealedCardFieldForGrouping } from "@/core/entities/shared/utils/board-grouping";
import {
	formatCurrency,
	useOrgDefaultCurrency,
} from "@/core/shell/shared/hooks/useOrgDefaultCurrency";
import { cn } from "@/lib/utils";

// ─── Props ────────────────────────────────────────────────────────────────────

export type EntityCardItem = Record<string, unknown> & {
	id: string;
	_id?: string;
	orgId?: Id<"orgs">;
	personCode?: string;
	companyCode?: string;
	dealCode?: string;
	displayName?: string;
	title?: string;
	name?: string;
	email?: string;
	phone?: string;
	avatarUrl?: string;
	industry?: string;
	value?: number;
	currentStageId?: string;
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
	/**
	 * Custom-field defs to surface as highlighted chips between the identity
	 * row and the bottom action row. Each name in this array must also appear
	 * in `cardFields` to be rendered (so the user's per-session toggle still
	 * works). Pinned kinds (displayName/email/tags/personCode/assignedTo) are
	 * filtered out automatically — they have their own designed slots.
	 *
	 * The chip background is the muted-accent so the value reads as
	 * "highlighted but not loud" — fits any theme. Long values truncate.
	 */
	highlightFieldDefs?: Array<{ name: string; label: string; kind?: string; type?: string }>;
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
	/** Map of custom field values for THIS entity row (fieldName → value). */
	customFieldValues?: Record<string, unknown>;
	/**
	 * Active board groupBy field. When set, the card renders a "fill the gap"
	 * indicator for the field that the kanban column already represents:
	 *
	 *   - groupBy="assignedTo" → the assignee avatar slot (bottom-left) is
	 *     vacated. We render the *revealed* field (status / industry /
	 *     companyId per slot) as a coloured strip in that empty slot.
	 *   - groupBy="tag"|"tags" → the tags slot (top-right of row 1) is
	 *     vacated. Same revealed-field strip is rendered there.
	 *   - groupBy="status"|"source"|"industry"|"companyId"|"currentStageId"
	 *     → no fixed slot is vacated (those fields didn't have one). We
	 *     render just a small coloured DOT after the assignee avatar so
	 *     the user still has a hint of "what would the card's status be".
	 *     The dot has a tooltip that shows the resolved label.
	 *
	 * The colour comes from `getStatusColor(slot, value)` (which has a stable
	 * deterministic fallback for arbitrary values), so any reveal field
	 * resolves to *something* visible.
	 */
	groupBy?: string;
	/**
	 * Optional resolver — given an opaque id (e.g. `assignedTo` user id,
	 * `companyId`, `currentStageId`), return the human-readable label.
	 * Used to render the strip text and the dot tooltip without firing a
	 * Convex query inside the card. Each view supplies this from data it
	 * already has in scope (`memberNameById`, `companyNameById`,
	 * `stageNameById`). Returning `undefined` falls back to the raw value.
	 *
	 * MUST be wrapped in `useCallback` to keep referential equality and
	 * avoid blowing the card's memo / re-render budget.
	 */
	resolveReplacementLabel?: (fieldName: string, rawValue: string) => string | undefined;
	/**
	 * Pre-resolved tags for this entity (from a batched
	 * `useEntityTagsMap(orgId, slot)` call in the parent view). When
	 * provided, `<TagsCell>` uses this instead of subscribing per-card to
	 * `crm.shared.tags.queries.getTagsForEntity` — one of the largest
	 * sources of subscription spam on board views (every visible card was
	 * its own subscription, blowing 100+ calls / minute).
	 *
	 * Pass `undefined` (the default) to keep the legacy per-card path —
	 * still correct for embedded panels that don't have a board-wide map.
	 */
	prefetchedTags?: Array<{ _id: unknown; name: string; color?: string | null }>;
	/**
	 * Optional small coloured dot rendered in the TOP-right corner BEFORE
	 * the tags slot. Wrapped in a tooltip that discloses the underlying
	 * label on hover. Used by `LeadCard` to surface the lead's status
	 * (new/contacted/qualified/converted/lost) on every profiles-page card,
	 * regardless of the active board groupBy. ContactCard / DealCard /
	 * CompanyCard do NOT pass this — only entities that have a meaningful
	 * "status" field outside of the pipeline use it.
	 *
	 * The dot stays on the same line as the tags so the layout is stable
	 * even when tags are hidden (`cardFields` doesn't include "tags").
	 */
	statusDot?: { color: string; label: string; tooltip: string };
}

// ─── Component ────────────────────────────────────────────────────────────────

export function EntityCard({
	slot,
	item,
	cardFields,
	highlightFieldDefs,
	shortcuts,
	menuItems,
	staleness,
	isDragging,
	isHighlighted,
	highlightEpoch,
	customFieldValues,
	groupBy,
	resolveReplacementLabel,
	prefetchedTags,
	statusDot,
}: EntityCardProps) {
	const [menuOpen, setMenuOpen] = useState(false);
	const [summaryExpanded, setSummaryExpanded] = useState(false);
	const params = useParams();
	const orgSlug = params?.orgSlug as string | undefined;
	const locale = params?.locale as string | undefined;
	const currencyCode = useOrgDefaultCurrency(item.orgId);

	// Effective card fields = caller's cardFields ∩ admin's visible fields.
	// When admins hide a field in Settings → Modules → Lead → Fields, the
	// `highlightFieldDefs` list (built from `useEntityFields(...).visibleFields`)
	// stops including it. Filtering cardFields here means stale entries from
	// localStorage drop out automatically — the user can't accidentally see a
	// field the admin has hidden.
	const adminAllowedNames = useMemo(() => {
		if (!highlightFieldDefs) return null;
		return new Set([
			...highlightFieldDefs.map((d) => d.name),
			// Pinned slots are always rendered when their cardFields key is set,
			// even when the admin hasn't surfaced them in highlightFieldDefs.
			...PINNED_NAMES,
			"noAvatar",
		]);
	}, [highlightFieldDefs]);
	const effectiveFields = useMemo(() => {
		if (!cardFields) return [] as string[];
		if (!adminAllowedNames) return cardFields;
		return cardFields.filter((f) => adminAllowedNames.has(f));
	}, [cardFields, adminAllowedNames]);

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
	const isCompany = slot === "company";
	const isDeal = slot === "deal";

	// Per-piece visibility flags — every piece is addressable by cardFields.
	// IMPORTANT: the array, when non-empty, is treated as the explicit allow-list
	// for everything in it. Pieces that aren't first-class fields (avatar) default
	// to ON unless the caller passes "noAvatar" in cardFields.
	//
	// We use `effectiveFields` (cardFields ∩ admin-visible) so admin-hidden
	// fields can never be shown — even if a stale per-user entry survives in
	// localStorage from before the admin hid it.
	const fields = effectiveFields;
	const showName =
		fields.length === 0 || fields.includes("displayName") || fields.includes("name");
	const showEmail = fields.includes("email") && !!item.email;
	const showTags = fields.includes("tags") && !!orgId;
	// PersonCode: leads/contacts use personCode field, companies/deals use companyCode/dealCode.
	const codeValue =
		(item.personCode as string | undefined) ??
		(item.companyCode as string | undefined) ??
		(item.dealCode as string | undefined);
	const showPersonCode =
		(fields.includes("personCode") ||
			fields.includes("companyCode") ||
			fields.includes("dealCode")) &&
		!!codeValue;
	const showAssignee = fields.includes("assignedTo") && !!item.assignedTo;
	const showSummary = fields.includes("aiSummary") && !!item.aiSummary;
	// Avatar: ON by default for all entities (we have a logo for companies, an
	// initials fallback for deals/leads/contacts). Users can opt-out by adding
	// "noAvatar" to cardFields.
	const showAvatar = !fields.includes("noAvatar");

	// Subtitle for non-person entities — for companies it's industry, for deals
	// it's the stage/value. Falls back to email for person-like.
	const subtitle = isCompany
		? (item.industry as string | undefined)
		: isDeal
			? formatDealSubtitle(item, currencyCode)
			: showEmail
				? (item.email as string | undefined)
				: undefined;

	// Staleness border colour (left edge only so it reads as a status bar)
	const borderClass = useStalenessBorder(item.updatedAt, staleness);

	// Detail link — derive from entity type + code.
	const detailHref =
		codeValue && orgSlug ? buildDetailHref(slot, codeValue, orgSlug, locale) : null;

	const initials = getInitials(title);

	// AI summary truncation logic: collapsed = clamp-2; expanded = no clamp.
	const summaryClassName = cn(
		"text-[11px] leading-snug text-muted-foreground",
		!summaryExpanded && "line-clamp-2",
	);

	// ── "Fill the gap" indicator for the active board groupBy ──────────────
	//
	// When the board groups by a field that owns a layout slot (assignee
	// avatar bottom-left, or tags chip top-right), that slot ends up empty
	// because the field is in `getHiddenCardFieldsForGrouping` and therefore
	// removed from `cardFields`. We re-fill the empty slot with a coloured
	// STRIP (revealed-field name + value) so the user still has a glance-able
	// hint of what the card's status would be.
	//
	// When the groupBy field has no slot (status / source / industry /
	// currentStageId / companyId), we render a tiny coloured DOT after the
	// assignee avatar instead — same data, lighter footprint. The dot
	// carries a tooltip with the resolved label so hover discloses meaning.
	const groupReplacement = useMemo(() => {
		if (!groupBy) return null;
		const revealedName = getRevealedCardFieldForGrouping(groupBy, slot);
		if (!revealedName) return null;
		const raw = (item as Record<string, unknown>)[revealedName];
		if (raw === undefined || raw === null || raw === "") return null;
		const value = String(raw);
		const color = getStatusColor(slot, value);

		// Determine where the replacement renders:
		//   - "top-right"   when groupBy hides the tags slot
		//   - "bottom-left" when groupBy hides the assignee-avatar slot
		//   - "inline-dot"  otherwise (no slot vacated → render just a dot)
		let location: "top-right" | "bottom-left" | "inline-dot";
		if (groupBy === "tag" || groupBy === "tags") {
			location = "top-right";
		} else if (groupBy === "assignedTo") {
			location = "bottom-left";
		} else {
			location = "inline-dot";
		}

		// Resolve the human label. For opaque ids (companyId / assignedTo /
		// currentStageId) we delegate to the view-supplied resolver so the
		// card stays free of Convex queries. If the resolver returns
		// undefined or no resolver is provided, we fall back to the raw
		// value — which for status / source / industry IS the human label.
		const resolved = resolveReplacementLabel?.(revealedName, value);
		const label = resolved ?? value;

		// Pretty title for the field (used in the tooltip + as a strip prefix
		// when text alone would be ambiguous like "Acme" without context).
		const fieldTitle = FIELD_DISPLAY_TITLES[revealedName] ?? revealedName;

		return { name: revealedName, value, color, location, label, fieldTitle };
	}, [groupBy, slot, item, resolveReplacementLabel]);

	return (
		<KanbanItem value={item.id} asChild>
			<div
				ref={rootRef}
				className={cn(
					"group/card relative flex flex-col gap-1.5 rounded-[var(--radius)] border bg-card ps-2.5 pe-5 py-2 text-xs shadow-xs transition-shadow",
					!isDragging && "hover:border-ring/40 hover:shadow-sm",
					borderClass,
					isDragging && "rotate-1 shadow-lg",
				)}
			>
				{/* ── Row 1: identity (top-left) + tags (top-right) ── */}
				<div className="flex items-start gap-2">
					{/* Identity — avatar + (name/email or industry/stage) → detail */}
					<IdentityCluster
						href={detailHref}
						avatarUrl={item.avatarUrl}
						initials={initials}
						showAvatar={showAvatar}
						showName={showName}
						title={title}
						subtitle={subtitle}
					/>

					{/* Top-right cluster — status dot first, then tags (or
					    a "fill the gap" replacement strip when grouping by
					    tags hides the tags slot). Wrapping this in one
					    `ms-auto` flex keeps the layout stable whether
					    individual pieces are present or not. */}
					<div className="ms-auto flex shrink-0 items-center gap-1.5">
						{/* Status dot — small coloured circle with tooltip,
						    rendered just before tags. Currently only LeadCard
						    sets this so the user can glance the lead's status
						    even when groupBy is not "status". */}
						{statusDot && (
							<Tooltip>
								<TooltipTrigger asChild>
									<span
										role="img"
										aria-label={`Status: ${statusDot.label}`}
										className="inline-block size-2 shrink-0 rounded-full"
										style={{ backgroundColor: statusDot.color }}
									/>
								</TooltipTrigger>
								<TooltipContent side="top" className="text-xs capitalize">
									{statusDot.tooltip}
								</TooltipContent>
							</Tooltip>
						)}

						{/* Tags — TOP-right corner */}
						{showTags && (
							// biome-ignore lint/a11y/noStaticElementInteractions: event-stop wrapper isolates tag editor from drag listeners
							<div
								onPointerDown={(e) => e.stopPropagation()}
								onClick={(e) => e.stopPropagation()}
								onKeyDown={(e) => e.stopPropagation()}
							>
								<TagsCell
									orgId={orgId as Id<"orgs">}
									entityType={slot}
									entityId={itemId}
									size="xs"
									readOnlyAfterFirst
									prefetchedTags={prefetchedTags}
								/>
							</div>
						)}

						{/* "Fill the gap" replacement — when grouping by tags hides
						    the tags slot, surface the reveal-matrix field here so
						    the user still has a glance-able hint. */}
						{!showTags && groupReplacement?.location === "top-right" && (
							<GroupReplacementStrip replacement={groupReplacement} />
						)}
					</div>
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

				{/* ── Highlighted custom fields ── */}
				{highlightFieldDefs && highlightFieldDefs.length > 0 && customFieldValues && (
					<HighlightFieldStrip
						defs={highlightFieldDefs}
						values={customFieldValues}
						visibleFields={fields}
						currencyCode={currencyCode}
					/>
				)}

				{/* ── Row 3: personCode + assignee (bottom-left) | menu + shortcuts (bottom-right) ── */}
				{(showPersonCode ||
					showAssignee ||
					groupReplacement?.location === "bottom-left" ||
					groupReplacement?.location === "inline-dot" ||
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
									<IdentityBadge
										entityType={
											isCompany ? "company" : isDeal ? "deal" : "person"
										}
										code={codeValue}
										layout="code"
										size="xs"
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

							{/* "Fill the gap" replacement — when grouping by
							    assignedTo hides the avatar slot, surface the
							    revealed field as a coloured strip here. */}
							{!showAssignee && groupReplacement?.location === "bottom-left" && (
								<GroupReplacementStrip replacement={groupReplacement} />
							)}

							{/* Inline coloured dot — when groupBy is a field
							    that has no fixed slot (status / source /
							    industry / etc.), append a tiny dot here so
							    the user still has a colour hint. The
							    tooltip discloses what field + value the
							    dot represents on hover. */}
							{groupReplacement?.location === "inline-dot" && (
								<Tooltip>
									<TooltipTrigger asChild>
										<span
											role="img"
											aria-label={`${groupReplacement.fieldTitle}: ${groupReplacement.label}`}
											className="inline-block size-2 shrink-0 rounded-full"
											style={{ backgroundColor: groupReplacement.color }}
										/>
									</TooltipTrigger>
									<TooltipContent side="top" className="text-xs capitalize">
										{groupReplacement.fieldTitle}: {groupReplacement.label}
									</TooltipContent>
								</Tooltip>
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
						data-tour="lead-card-grip"
						className={cn(
							"absolute inset-y-0 end-0 flex w-4 cursor-grab items-center justify-center rounded-e-[var(--radius)] text-muted-foreground/40 transition-colors",
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

// ─── HighlightFieldStrip — admin-flagged "important" fields shown inline ─────

const PINNED_NAMES = new Set([
	"displayName",
	"email",
	"phone",
	"tags",
	"personCode",
	"entityCode",
	"assignedTo",
	"avatar",
	"aiSummary",
]);

function HighlightFieldStrip({
	defs,
	values,
	visibleFields,
	currencyCode,
}: {
	defs: Array<{ name: string; label: string; kind?: string; type?: string }>;
	values: Record<string, unknown>;
	visibleFields: string[];
	currencyCode: string;
}) {
	// Filter: must be in cardFields (per-user toggle still applies), must NOT
	// be a pinned slot (those have their own designed home), must have a
	// non-empty value (no point showing "—" chips).
	const rows = defs
		.filter((d) => visibleFields.includes(d.name))
		.filter((d) => !PINNED_NAMES.has(d.name) && d.kind !== "displayName")
		.map((d) => {
			const raw = values[d.name];
			const formatted = formatHighlightValue(raw, d, currencyCode);
			if (formatted === null) return null;
			return { name: d.name, label: d.label, value: formatted };
		})
		.filter((x): x is { name: string; label: string; value: string } => x !== null)
		.slice(0, 3); // never more than 3 highlight chips per card

	if (rows.length === 0) return null;

	return (
		<div className="flex flex-wrap gap-1">
			{rows.map((r) => (
				<span
					key={r.name}
					className="inline-flex items-center gap-1 rounded-[calc(var(--radius)-2px)] bg-primary/10 px-1.5 py-0.5 text-[10px]"
					title={`${r.label}: ${r.value}`}
				>
					<span className="text-muted-foreground">{r.label}</span>
					<span className="truncate font-medium text-primary max-w-[14ch]">
						{r.value}
					</span>
				</span>
			))}
		</div>
	);
}

function formatHighlightValue(
	raw: unknown,
	def: { kind?: string; type?: string },
	currencyCode: string,
): string | null {
	if (raw === undefined || raw === null || raw === "") return null;
	if (Array.isArray(raw)) {
		if (raw.length === 0) return null;
		return raw.slice(0, 2).join(", ");
	}
	if (def.kind === "currency" || def.type === "number") {
		const num = Number(raw);
		if (Number.isNaN(num)) return String(raw);
		if (def.kind === "currency") return formatCurrency(num, currencyCode);
		return String(num);
	}
	if (def.type === "date" && typeof raw === "number") {
		try {
			return new Date(raw).toLocaleDateString();
		} catch {
			return String(raw);
		}
	}
	return String(raw);
}

// ─── Identity cluster (avatar + name + subtitle → detail) ──────────────────────

function IdentityCluster({
	href,
	avatarUrl,
	initials,
	showAvatar,
	showName,
	title,
	subtitle,
}: {
	href: string | null;
	avatarUrl?: string;
	initials: string;
	showAvatar: boolean;
	showName: boolean;
	title: string;
	subtitle?: string;
}) {
	const content = (
		<span className="flex min-w-0 flex-1 items-center gap-2">
			{showAvatar && (
				<Avatar className="size-6 shrink-0">
					<AvatarImage src={avatarUrl} alt={title} />
					<AvatarFallback className="text-[9px]">{initials}</AvatarFallback>
				</Avatar>
			)}
			{(showName || subtitle) && (
				<span className="flex min-w-0 flex-col leading-tight">
					{showName && <span className="truncate font-medium">{title}</span>}
					{subtitle && (
						<span className="truncate text-[11px] text-muted-foreground">
							{subtitle}
						</span>
					)}
				</span>
			)}
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

			{shortcuts?.map((s) => {
				// Tour-tagged buttons skip the Tooltip — the FirstTimeTour explains
				// the gesture once. We keep `aria-label` and a native `title` for a
				// quiet hover hint.
				const isPrimary = s.variant === "primary";
				const tourTag = isPrimary
					? "lead-card-convert"
					: s.label.toLowerCase().includes("lost") ||
							s.label.toLowerCase().includes("delete") ||
							s.label.toLowerCase().includes("trash")
						? "lead-card-lost"
						: undefined;
				const button = (
					<Button
						size="icon"
						variant={isPrimary ? "default" : "ghost"}
						onClick={s.onSelect}
						aria-label={s.label}
						title={tourTag ? undefined : s.label}
						data-tour={tourTag}
						className={cn("size-5", !isPrimary && "opacity-70 hover:opacity-100")}
					>
						<s.icon className="size-3" />
					</Button>
				);
				if (tourTag) return <span key={s.label}>{button}</span>;
				return (
					<Tooltip key={s.label}>
						<TooltipTrigger asChild>{button}</TooltipTrigger>
						<TooltipContent side="top" className="text-xs">
							{s.label}
						</TooltipContent>
					</Tooltip>
				);
			})}
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

function formatDealSubtitle(item: EntityCardItem, currencyCode: string): string | undefined {
	const value = item.value as number | undefined;
	if (typeof value === "number" && !Number.isNaN(value)) {
		return formatCurrency(value, currencyCode);
	}
	return undefined;
}

function buildDetailHref(
	slot: EntitySlot,
	code: string,
	orgSlug: string,
	locale: string | undefined,
): string {
	const prefix = locale ? `/${locale}/${orgSlug}` : `/${orgSlug}`;
	switch (slot) {
		case "company":
			return `${prefix}/companies/${code}`;
		case "deal":
			return `${prefix}/deals/${code}`;
		default:
			return `${prefix}/profile/${code}`;
	}
}

// ─── GroupReplacementStrip — "fill the gap" badge for active groupBy ─────────
//
// When the kanban board groups by a field that owns a layout slot on the card
// (assignee avatar bottom-left, or tags chip top-right), the corresponding
// `getHiddenCardFieldsForGrouping` entry strips that field from `cardFields`
// and the slot ends up empty. Instead of leaving a hole, we render a coloured
// strip that surfaces the *revealed* field (per `getRevealedCardFieldForGrouping`)
// — e.g. grouping leads by assignee → strip shows the status colour + label.
//
// Used in two layout slots (Row 1 top-right when grouping by tags; Row 3
// bottom-left when grouping by assignedTo). The third case (groupBy is one
// of status/source/industry/companyId/currentStageId — no slot vacated) is
// handled inline in Row 3 as a tiny coloured dot, NOT this component.

/** Pretty titles for the revealed field — used in the tooltip + strip. */
const FIELD_DISPLAY_TITLES: Record<string, string> = {
	status: "Status",
	source: "Source",
	industry: "Industry",
	assignedTo: "Assignee",
	companyId: "Company",
	currentStageId: "Stage",
	tag: "Tag",
	tags: "Tag",
};

function GroupReplacementStrip({
	replacement,
}: {
	replacement: {
		name: string;
		value: string;
		color: string;
		label: string;
		fieldTitle: string;
	};
}) {
	return (
		<Badge
			variant="outline"
			className="h-5 gap-1 px-1.5 text-[10px] capitalize"
			style={{
				backgroundColor: `${replacement.color}1a`,
				borderColor: `${replacement.color}66`,
				color: replacement.color,
			}}
			title={`${replacement.fieldTitle}: ${replacement.label}`}
		>
			<span
				aria-hidden
				className="inline-block size-1.5 shrink-0 rounded-full"
				style={{ backgroundColor: replacement.color }}
			/>
			<span className="truncate max-w-[14ch]">{replacement.label}</span>
		</Badge>
	);
}
