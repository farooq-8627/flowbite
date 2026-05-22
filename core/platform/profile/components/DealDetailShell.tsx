"use client";

/**
 * DealDetailShell — the new home for deal detail, mounted inside
 * `Profile → Deals` tab. Replaces `<PersonDealCard>` (deleted).
 *
 * Layout
 * ──────
 *   ┌─ Deal selector (chip strip — only shown when 2+ deals) ────────┐
 *   │  ◎ Big Office Lease  D-007  · ◎ Discovery deal  D-008          │
 *   ├─ Active deal header (sticky) ──────────────────────────────────┤
 *   │  ◎ Big Office Lease   AED 250,000   Stage 3 · Negotiation      │
 *   │  D-007 · Updated 2d ago                                  ◎ Owner│
 *   ├─ Tab strip ────────────────────────────────────────────────────┤
 *   │  Overview · Files · Timeline · Follow-ups · Calendar           │
 *   ├─ Active tab body (scrollable) ─────────────────────────────────┤
 *   │  …                                                             │
 *   └────────────────────────────────────────────────────────────────┘
 *
 * Behaves the same way as `<CompanyDetailView>` — header + sticky tab
 * strip + scrollable body. The difference is the **deal selector** at
 * the top: a profile can have N deals attached, so the user picks which
 * one is "active". When only 1 deal exists, the selector is hidden.
 *
 * Tabs
 * ────
 *   Overview   — vitals (code, stage, value, owner, updated) + tags +
 *                stage-aware fields (everything pinned to the deal's
 *                CURRENT stage + the Default stage's "always-on" set)
 *                + a recent-activity preview underneath.
 *   Files      — `<EntityFilesPanel scope="deal" scopeId={dealCode}>`
 *                which already renders previewable files (images +
 *                videos) as tiles → click → MediaViewerModal lightbox,
 *                with documents as download rows. No custom code here.
 *   Timeline   — `<EntityTimeline entityType="deal">` for this deal.
 *   Follow-ups — `<EntityFollowups entityType="deal">` for this deal.
 *   Calendar   — `<EntityCalendarPanel entityType="deal">` for this deal.
 *
 * Why a separate component
 * ────────────────────────
 *   The old `<PersonDealCard>` rendered every deal expanded simultaneously
 *   on the profile. The user's redesign request: **one deal at a time,
 *   tabbed view** — the same shell used by Company detail. This shell is
 *   the one place that pattern is implemented for deals.
 */

import { useQuery } from "convex/react";
import {
	BellIcon,
	BriefcaseIcon,
	CalendarIcon,
	CheckCircle2Icon,
	FileTextIcon,
	HistoryIcon,
	MoreVerticalIcon,
	PencilIcon,
	PlusIcon,
	XCircleIcon,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { api } from "@/convex/_generated/api";
import type { Doc, Id } from "@/convex/_generated/dataModel";
import { EntityTimeline } from "@/core/comms/timeline/components/EntityTimeline";
import {
	FileDropzone,
	FileList,
	useFileAttachments,
} from "@/core/data-io/files/components/FileUpload";
import type { FileCategory } from "@/core/data-io/files/file-categories";
import { EditDealDrawer } from "@/core/entities/_entities/deals/components/EditDealDrawer";
import { MarkAsDoneDialog } from "@/core/entities/_entities/deals/components/MarkAsDoneDialog";
import { MarkAsLostDialog } from "@/core/entities/_entities/deals/components/MarkAsLostDialog";
import { useDealPipelines } from "@/core/entities/_entities/deals/hooks/usePipelines";
import { EntityFilesPanel } from "@/core/entities/shared/components/EntityFilesPanel";
import { FieldValueRenderer } from "@/core/entities/shared/components/FieldValueRenderer";
import { IdentityBadge } from "@/core/entities/shared/components/IdentityBadge";
import { TagsCell } from "@/core/entities/shared/components/TagsCell";
import { useEntityFields } from "@/core/entities/shared/hooks/useEntityFields";
import { useEntityFieldValuesMap } from "@/core/entities/shared/hooks/useEntityFieldValuesMap";
import { EntityCalendarPanel } from "@/core/scheduling/calendar/panels/EntityCalendarPanel";
import { EntityFollowups } from "@/core/scheduling/followups/components/EntityFollowups";
import { useCurrentOrg, useOrgMemberMap } from "@/core/shell/shared/hooks/useCurrentOrg";
import { useEntityLabels } from "@/core/shell/shared/hooks/useEntityLabels";
import {
	formatCurrency,
	useOrgDefaultCurrency,
} from "@/core/shell/shared/hooks/useOrgDefaultCurrency";
import { useOrgPermission } from "@/features/orgs/hooks/useOrgPermission";
import { cn } from "@/lib/utils";

type Deal = Doc<"deals">;
type Pipeline = Doc<"pipelines">;
type FieldDef = Doc<"fieldDefinitions">;
type TabId = "overview" | "files" | "timeline" | "followups" | "calendar";

/**
 * Field names rendered in the Vitals card directly (avatar, code, owner,
 * stage, value, dates). Skip them in the dynamic stage-aware fields card
 * so the user doesn't see "Title: …" twice.
 *
 * Module-level so the `useMemo` deps array doesn't have to track a Set
 * that's identical on every render.
 */
const VITALS_FIELDS = new Set([
	"title",
	"dealCode",
	"value",
	"currency",
	"assignedTo",
	"currentStageId",
	"stageId",
	"updatedAt",
	"createdAt",
	"tags",
]);

interface DealDetailShellProps {
	personCode: string;
}

export function DealDetailShell({ personCode }: DealDetailShellProps) {
	const { orgId } = useCurrentOrg();
	const labels = useEntityLabels();

	const deals = useQuery(
		api.crm.entities.deals.queries.listByPersonCode,
		orgId ? { orgId, personCode, limit: 50 } : "skip",
	) as Deal[] | undefined;

	// Active deal selection — controlled state, defaults to the first deal
	// when the list arrives. We track it by `_id` so renames / value edits
	// don't lose selection.
	const [activeDealId, setActiveDealId] = useState<Id<"deals"> | null>(null);

	useEffect(() => {
		if (!deals || deals.length === 0) {
			setActiveDealId(null);
			return;
		}
		// Reset to first deal if the previous selection no longer exists
		// (e.g. the deal got soft-deleted). Don't fight a valid selection.
		setActiveDealId((prev) => {
			if (prev && deals.some((d) => d._id === prev)) return prev;
			return deals[0]._id;
		});
	}, [deals]);

	if (deals === undefined) {
		return (
			<p className="text-xs text-muted-foreground">
				Loading {labels.deal.plural.toLowerCase()}…
			</p>
		);
	}

	if (deals.length === 0) {
		return (
			<div className="rounded-[var(--radius)] border border-dashed bg-muted/20 px-4 py-6 text-center text-xs text-muted-foreground">
				No {labels.deal.plural.toLowerCase()} linked to this person yet.
			</div>
		);
	}

	const activeDeal = deals.find((d) => d._id === activeDealId) ?? deals[0];

	// Mirror CompanyDetailView's full-height shell exactly. The optional
	// deal-selector strip lives above the shell as a sibling so the inner
	// tab body can claim the remaining height (`flex-1 min-h-0`) without
	// fighting another wrapper for vertical space.
	return (
		<div className="flex h-full min-h-0 min-w-0 flex-col gap-3">
			{deals.length > 1 && (
				<DealSelectorStrip
					deals={deals}
					activeDealId={activeDeal._id}
					onSelect={setActiveDealId}
				/>
			)}
			<DealDetailCard deal={activeDeal} orgId={orgId as Id<"orgs">} />
		</div>
	);
}

// ─── Deal selector — chip strip mirrors DealPipelineTabs visual ─────────────

function DealSelectorStrip({
	deals,
	activeDealId,
	onSelect,
}: {
	deals: Deal[];
	activeDealId: Id<"deals">;
	onSelect: (id: Id<"deals">) => void;
}) {
	return (
		<div
			role="tablist"
			aria-label="Deals"
			className="flex min-w-0 items-center gap-1 overflow-x-auto scrollbar-none rounded-[var(--radius)] border bg-background px-1.5 py-1"
		>
			{deals.map((d) => {
				const isActive = activeDealId === d._id;
				return (
					<button
						key={d._id}
						type="button"
						role="tab"
						aria-selected={isActive}
						onClick={() => onSelect(d._id)}
						className={cn(
							"flex h-7 shrink-0 items-center gap-1.5 rounded-[var(--radius)] ps-2 pe-2 text-xs transition-colors",
							isActive
								? "bg-primary/10 text-primary"
								: "text-muted-foreground hover:bg-muted/60",
						)}
					>
						<span className="max-w-[16ch] truncate font-medium">{d.title}</span>
						<span className="font-mono text-[10px] text-muted-foreground">
							{d.dealCode}
						</span>
					</button>
				);
			})}
		</div>
	);
}

// ─── Deal detail card — header + tab strip + active tab body ────────────────

function DealDetailCard({ deal, orgId }: { deal: Deal; orgId: Id<"orgs"> }) {
	const labels = useEntityLabels();
	const memberMap = useOrgMemberMap();
	const currencyCode = useOrgDefaultCurrency(orgId);

	const [activeTab, setActiveTab] = useState<TabId>("overview");

	// Mark as Won / Mark as Lost dialog state
	const [markDoneOpen, setMarkDoneOpen] = useState(false);
	const [markLostOpen, setMarkLostOpen] = useState(false);
	const isClosed = !!deal.wonAt || !!deal.lostAt;

	// Reset to overview whenever the active deal changes — `Files` of one
	// deal don't make sense for the next deal in the strip.
	// biome-ignore lint/correctness/useExhaustiveDependencies: deal._id is the trigger
	useEffect(() => {
		setActiveTab("overview");
	}, [deal._id]);

	const pipelines = useDealPipelines(orgId);
	const pipeline = useMemo<Pipeline | undefined>(
		() => pipelines?.find((p) => p._id === deal.pipelineId),
		[pipelines, deal.pipelineId],
	);
	const sortedStages = useMemo(() => {
		if (!pipeline) return [];
		return [...pipeline.stages].sort((a, b) => a.order - b.order);
	}, [pipeline]);
	const currentStageIndex = useMemo(
		() => sortedStages.findIndex((s) => s.id === deal.currentStageId),
		[sortedStages, deal.currentStageId],
	);
	const currentStage = currentStageIndex >= 0 ? sortedStages[currentStageIndex] : undefined;
	const stageColor = currentStage?.color ?? "#94a3b8";
	// Stage label rule: show ONLY the stage name. The previous template
	// `Stage ${N} · ${stage.name}` produced the awkward "Stage 3 · Stage 2"
	// when admins had literally named the stages "Stage 1" / "Stage 2" /
	// etc — the user reads it as two stages. The pipeline strip / kanban
	// already conveys ordinal position; the badge only needs to identify
	// where the deal IS right now.
	const stageLabel =
		currentStage && currentStageIndex >= 0
			? currentStage.name
			: deal.wonAt
				? "Won"
				: deal.lostAt
					? "Lost"
					: "—";

	const assignee = deal.assignedTo ? memberMap.get(String(deal.assignedTo))?.user : undefined;

	const formattedValue = useMemo(() => {
		if (deal.value === undefined || deal.value === null) return null;
		return formatCurrency(deal.value, currencyCode);
	}, [deal.value, currencyCode]);

	const updatedRel = deal.updatedAt ? formatRelative(deal.updatedAt) : null;

	const dealInitials = (deal.title ?? deal.dealCode ?? "?").trim().slice(0, 2).toUpperCase();
	const assigneeInitials = (assignee?.name ?? assignee?.email ?? "?")
		.trim()
		.slice(0, 2)
		.toUpperCase();

	const tabs: Array<{
		id: TabId;
		label: string;
		icon: React.ComponentType<{ className?: string }>;
	}> = [
		{ id: "overview", label: "Overview", icon: BriefcaseIcon },
		{ id: "files", label: "Files", icon: FileTextIcon },
		{ id: "timeline", label: "Timeline", icon: HistoryIcon },
		{ id: "followups", label: "Follow-ups", icon: BellIcon },
		{ id: "calendar", label: "Calendar", icon: CalendarIcon },
	];

	return (
		<div className="flex min-h-0 min-w-0 flex-1 flex-col">
			{/* ─── Header ───────────────────────────────────────────────── */}
			<header className="flex min-w-0 flex-col gap-3 border-b bg-background px-3 py-3 sm:px-4 sm:py-4">
				{/* Title row — avatar + title + dealCode on the left, Stage
				    + Assignee on the right. They share ONE row at every
				    breakpoint (no wrap onto a second line on mobile). */}
				<div className="flex min-w-0 items-center gap-2">
					<Avatar className="size-9 shrink-0">
						<AvatarFallback
							className="text-[11px] font-semibold"
							style={{ backgroundColor: `${stageColor}24`, color: stageColor }}
						>
							{dealInitials}
						</AvatarFallback>
					</Avatar>
					<div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-1.5 gap-y-0.5">
						<h2
							className="min-w-0 truncate text-sm font-semibold text-foreground sm:text-base"
							title={deal.title}
						>
							{deal.title}
						</h2>
						<IdentityBadge
							entityType="deal"
							code={deal.dealCode}
							layout="code"
							size="xs"
							clickable={false}
						/>
					</div>
					<div className="flex shrink-0 items-center gap-1.5">
						<Badge
							variant="outline"
							className="h-5 max-w-[14ch] min-w-0 px-1.5 text-[10px] capitalize"
							style={{
								backgroundColor: `${stageColor}1a`,
								borderColor: `${stageColor}66`,
								color: stageColor,
							}}
						>
							<span
								aria-hidden
								className="me-1 inline-block size-1.5 shrink-0 rounded-full"
								style={{ backgroundColor: stageColor }}
							/>
							<span className="truncate">{stageLabel}</span>
						</Badge>
						{assignee && (
							<Tooltip>
								<TooltipTrigger asChild>
									<Avatar className="size-6 shrink-0">
										<AvatarImage
											src={assignee.avatarUrl ?? undefined}
											alt={assignee.name ?? assignee.email ?? "Assignee"}
										/>
										<AvatarFallback className="text-[9px]">
											{assigneeInitials}
										</AvatarFallback>
									</Avatar>
								</TooltipTrigger>
								<TooltipContent side="top" className="text-xs">
									Assigned to {assignee.name ?? assignee.email}
								</TooltipContent>
							</Tooltip>
						)}
						{!isClosed && (
							<DropdownMenu>
								<DropdownMenuTrigger asChild>
									<Button
										size="icon"
										variant="ghost"
										aria-label="Deal actions"
										className="size-7"
									>
										<MoreVerticalIcon className="size-4" />
									</Button>
								</DropdownMenuTrigger>
								<DropdownMenuContent align="end" className="text-xs">
									<DropdownMenuItem onSelect={() => setMarkDoneOpen(true)}>
										<CheckCircle2Icon className="me-2 size-3.5 text-green-600" />
										Mark as won
									</DropdownMenuItem>
									<DropdownMenuSeparator />
									<DropdownMenuItem
										onSelect={() => setMarkLostOpen(true)}
										className="text-destructive focus:text-destructive"
									>
										<XCircleIcon className="me-2 size-3.5" />
										Mark as lost
									</DropdownMenuItem>
								</DropdownMenuContent>
							</DropdownMenu>
						)}
					</div>
				</div>

				{/* Meta row — value (if any) and "Updated X ago" stack on
				    their own row below the title. Keeps the title row
				    clean and reachable on phones. */}
				{(formattedValue || updatedRel) && (
					<div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px] text-muted-foreground">
						{formattedValue && (
							<span className="truncate font-medium tabular-nums text-foreground">
								{formattedValue}
							</span>
						)}
						{updatedRel && <span className="truncate">Updated {updatedRel}</span>}
					</div>
				)}

				{/* Tab strip — `min-w-0` keeps the flex child from claiming
				    its children's combined width, so `overflow-x-auto` can
				    take over for horizontal scrolling on narrow screens. */}
				<div className="-mb-1 flex min-w-0 items-center gap-0.5 overflow-x-auto scrollbar-none">
					{tabs.map((t) => {
						const active = activeTab === t.id;
						const Icon = t.icon;
						return (
							<button
								key={t.id}
								type="button"
								onClick={() => setActiveTab(t.id)}
								aria-pressed={active}
								className={cn(
									"relative inline-flex shrink-0 items-center gap-1.5 px-3 py-2 text-sm transition-colors",
									active
										? "font-medium text-foreground"
										: "text-muted-foreground hover:text-foreground",
								)}
							>
								<Icon className="size-3.5" aria-hidden />
								<span>{t.label}</span>
								{active && (
									<span
										aria-hidden
										className="absolute inset-x-3 -bottom-px h-0.5 rounded-full bg-primary"
									/>
								)}
							</button>
						);
					})}
				</div>
			</header>

			{/* ─── Dialogs ──────────────────────────────────────────────── */}
			<MarkAsDoneDialog deal={deal} open={markDoneOpen} onOpenChange={setMarkDoneOpen} />
			<MarkAsLostDialog deal={deal} open={markLostOpen} onOpenChange={setMarkLostOpen} />

			{/* ─── Tab body — scrolls within the shell, mirrors CompanyShell. */}
			<div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-y-auto">
				{activeTab === "overview" && (
					<DealOverviewTab
						deal={deal}
						orgId={orgId}
						pipeline={pipeline}
						currentStage={currentStage}
						labels={labels}
						currencyCode={currencyCode}
						memberMap={memberMap}
					/>
				)}
				{activeTab === "files" && (
					<div className="p-3 sm:p-4">
						<EntityFilesPanel
							orgId={orgId}
							entityType="deal"
							entityId={deal.dealCode}
						/>
					</div>
				)}
				{activeTab === "timeline" && (
					<EntityTimeline
						entityType="deal"
						entityId={deal.dealCode}
						pageSize={30}
						visibleCap={30}
					/>
				)}
				{activeTab === "followups" && (
					<div className="p-3 sm:p-4">
						<EntityFollowups entityType="deal" entityId={deal.dealCode} />
					</div>
				)}
				{activeTab === "calendar" && (
					<EntityCalendarPanel entityType="deal" entityId={deal.dealCode} />
				)}
			</div>
		</div>
	);
}

// ─── Overview tab ───────────────────────────────────────────────────────────

function DealOverviewTab({
	deal,
	orgId,
	pipeline,
	currentStage,
	labels,
	currencyCode,
	memberMap,
}: {
	deal: Deal;
	orgId: Id<"orgs">;
	pipeline: Pipeline | undefined;
	currentStage: { id: string; name: string; color?: string } | undefined;
	labels: ReturnType<typeof useEntityLabels>;
	currencyCode: string;
	memberMap: ReturnType<typeof useOrgMemberMap>;
}) {
	const { allFields } = useEntityFields("deal", orgId);
	const { valuesByEntityId } = useEntityFieldValuesMap("deal", orgId);
	const customValues = valuesByEntityId[deal._id] ?? {};
	const canEdit = useOrgPermission(orgId, "deals.update");

	// ── Edit drawer state (lives here so both card headers can open the
	//    SAME drawer without prop-drilling through the shell). The mode
	//    decides which subset of fields the drawer renders:
	//
	//    - "edit"      → Vitals card "Edit" button. Full editable form
	//                    (defaults + every stage's pinned fields up to
	//                    the deal's current stage).
	//    - "fillStage" → Stage card "+" button when there are missing
	//                    required fields. Only empty pinned fields for
	//                    the deal's current stage.
	//    - "editStage" → Stage card "Edit" button. All fields pinned to
	//                    the current stage (filled or empty), so the
	//                    user can adjust just this stage in isolation.
	const [editOpen, setEditOpen] = useState(false);
	const [editMode, setEditMode] = useState<"edit" | "fillStage" | "editStage">("edit");

	const openEditDrawer = (mode: "edit" | "fillStage" | "editStage") => {
		setEditMode(mode);
		setEditOpen(true);
	};

	// Surface "Fill stage X fields (N)" only when the deal's current
	// stage actually has empty pinned fields per the deal's pipeline.
	// Reuses the same query EditDealDrawer + DealsView's kanban use.
	const stageFieldsToFill = useQuery(
		api.crm.entities.deals.queries.getStageFieldsToFill,
		orgId && deal._id ? { orgId, dealId: deal._id } : "skip",
	);
	const missingCount = stageFieldsToFill?.missing.length ?? 0;
	const stageNameForFill = stageFieldsToFill?.stageName ?? currentStage?.name ?? "";

	// Strict per-stage scoping. The Stage X fields card shows ONLY
	// fields whose `showInStages` includes the deal's current stage —
	// nothing more.
	//
	// We previously also included:
	//   1. Unpinned fields (`showInStages` empty) — caused org-wide
	//      fields like `tags` to appear inside the Stage 2 card.
	//   2. Default-stage fields — caused fields the admin pinned ONLY
	//      to "Default" (e.g. `budget`, `rera asking price`) to leak
	//      into every other stage's card.
	//
	// Both behaviours surprised users who expected "Stage 2 fields" to
	// be exactly that. If an admin wants a field on every stage they
	// must pin it everywhere explicitly via Settings → CRM → Stages.
	// Org-wide attributes that don't belong to any stage (tags, owner,
	// dealCode, etc.) live in the Vitals card alongside the rest of
	// the always-on metadata.
	const fieldsToRender = useMemo(() => {
		if (!currentStage) return [];
		return allFields.filter((f) => {
			if (f.hidden) return false;
			if (VITALS_FIELDS.has(f.name)) return false;
			const pinned = f.showInStages ?? [];
			return pinned.includes(currentStage.id);
		});
	}, [allFields, currentStage]);

	const assignee = deal.assignedTo ? memberMap.get(String(deal.assignedTo))?.user : undefined;
	const formattedValue =
		deal.value !== undefined && deal.value !== null
			? formatCurrency(deal.value, currencyCode)
			: null;

	// Build resolver maps so raw IDs (assignedTo, currentStageId) get
	// converted to display names BEFORE the field-value renderer runs —
	// same fix that landed for the old `<DealFieldRow>`.
	const memberNameMap = useMemo(() => {
		const m = new Map<string, string>();
		for (const [userId, member] of memberMap) {
			m.set(userId, member.user?.name ?? member.user?.email ?? userId);
		}
		return m;
	}, [memberMap]);

	const stageNameMap = useMemo(() => {
		const m = new Map<string, string>();
		for (const s of pipeline?.stages ?? []) m.set(s.id, s.name);
		return m;
	}, [pipeline]);

	return (
		<div className="grid gap-3 p-3 sm:p-4 md:grid-cols-2">
			{/* ── Vitals card ─────────────────────────────────────── */}
			<Card>
				<CardHeader className="flex flex-row items-center justify-between gap-2 pb-2 space-y-0">
					<CardTitle className="text-sm">Vitals</CardTitle>
					{canEdit && (
						<div className="flex items-center gap-1">
							{missingCount > 0 && (
								<Tooltip>
									<TooltipTrigger asChild>
										<Button
											type="button"
											size="sm"
											variant="default"
											onClick={() => openEditDrawer("fillStage")}
											className="h-7 gap-1 px-2 text-[11px]"
										>
											<PlusIcon className="size-3" aria-hidden />
											<span className="truncate max-w-[14ch]">
												Fill {stageNameForFill} fields ({missingCount})
											</span>
										</Button>
									</TooltipTrigger>
									<TooltipContent side="top" className="text-xs">
										{missingCount} {missingCount === 1 ? "field" : "fields"}{" "}
										required at this stage
									</TooltipContent>
								</Tooltip>
							)}
							<Tooltip>
								<TooltipTrigger asChild>
									<Button
										type="button"
										size="icon"
										variant="ghost"
										onClick={() => openEditDrawer("edit")}
										className="size-7"
										aria-label={`Edit ${labels.deal.singular.toLowerCase()}`}
									>
										<PencilIcon className="size-3.5" aria-hidden />
									</Button>
								</TooltipTrigger>
								<TooltipContent side="top" className="text-xs">
									Edit {labels.deal.singular.toLowerCase()}
								</TooltipContent>
							</Tooltip>
						</div>
					)}
				</CardHeader>
				<CardContent>
					<dl className="flex flex-col divide-y text-xs">
						<DetailRow label="Code">
							<span className="font-mono">{deal.dealCode}</span>
						</DetailRow>
						<DetailRow label="Stage">
							{currentStage ? (
								<span className="truncate">{currentStage.name}</span>
							) : (
								<Muted>—</Muted>
							)}
						</DetailRow>
						<DetailRow label="Value">{formattedValue ?? <Muted>—</Muted>}</DetailRow>
						<DetailRow label="Owner">
							{assignee ? (
								<span className="inline-flex items-center gap-1.5">
									<Avatar className="size-4">
										<AvatarImage src={assignee.avatarUrl ?? undefined} />
										<AvatarFallback className="text-[8px]">
											{(assignee.name ?? assignee.email ?? "?")
												.slice(0, 2)
												.toUpperCase()}
										</AvatarFallback>
									</Avatar>
									<span className="truncate">
										{assignee.name ?? assignee.email}
									</span>
								</span>
							) : (
								<Muted>Unassigned</Muted>
							)}
						</DetailRow>
						{deal.expectedCloseDate ? (
							<DetailRow label="Close date">
								{new Date(deal.expectedCloseDate).toLocaleDateString()}
							</DetailRow>
						) : null}
						{deal.wonAt ? (
							<DetailRow label="Won">
								{new Date(deal.wonAt).toLocaleDateString()}
							</DetailRow>
						) : null}
						{deal.lostAt ? (
							<DetailRow label="Lost">
								{new Date(deal.lostAt).toLocaleDateString()}
							</DetailRow>
						) : null}
						<DetailRow label="Tags">
							<TagsCell
								orgId={orgId}
								entityType="deal"
								entityId={deal._id}
								className="justify-end"
							/>
						</DetailRow>
					</dl>
				</CardContent>
			</Card>

			{/* ── Stage-aware fields ──────────────────────────────── */}
			{fieldsToRender.length > 0 && (
				<Card>
					<CardHeader className="flex flex-row items-center justify-between gap-2 pb-2 space-y-0">
						<CardTitle className="text-sm">
							{currentStage
								? `${currentStage.name} fields`
								: `${labels.deal.singular} fields`}
						</CardTitle>
						{canEdit && (
							<div className="flex items-center gap-1">
								{missingCount > 0 && (
									<Tooltip>
										<TooltipTrigger asChild>
											<Button
												type="button"
												size="icon"
												variant="default"
												onClick={() => openEditDrawer("fillStage")}
												className="size-7"
												aria-label={`Fill ${stageNameForFill} fields (${missingCount})`}
											>
												<PlusIcon className="size-3.5" aria-hidden />
											</Button>
										</TooltipTrigger>
										<TooltipContent side="top" className="text-xs">
											Fill {missingCount}{" "}
											{missingCount === 1 ? "field" : "fields"} for{" "}
											{stageNameForFill}
										</TooltipContent>
									</Tooltip>
								)}
								<Tooltip>
									<TooltipTrigger asChild>
										<Button
											type="button"
											size="icon"
											variant="ghost"
											onClick={() => openEditDrawer("editStage")}
											className="size-7"
											aria-label={`Edit ${stageNameForFill || "stage"} fields`}
										>
											<PencilIcon className="size-3.5" aria-hidden />
										</Button>
									</TooltipTrigger>
									<TooltipContent side="top" className="text-xs">
										Edit {stageNameForFill || "stage"} fields
									</TooltipContent>
								</Tooltip>
							</div>
						)}
					</CardHeader>
					<CardContent>
						<dl className="flex flex-col divide-y text-xs">
							{fieldsToRender.map((field) => {
								// File-type fields don't store their value in
								// `entityFieldValues` — files live in the `files`
								// table keyed by (scope, scopeId, fieldKey).
								// Render an inline dropzone + list bound to that
								// fieldKey so the user can drop files straight
								// into the right slot AND see what's already
								// attached, without clicking through to the
								// Files tab.
								if (field.type === "file" || field.type === "files") {
									return (
										<FileFieldRow
											key={field._id}
											orgId={orgId}
											scopeId={deal.dealCode}
											field={field}
										/>
									);
								}
								const raw = readFieldValue(field, deal, customValues);
								const resolved = resolveFieldValue(
									field,
									raw,
									memberNameMap,
									stageNameMap,
								);
								const has =
									resolved !== undefined &&
									resolved !== null &&
									!(typeof resolved === "string" && resolved.length === 0) &&
									!(Array.isArray(resolved) && resolved.length === 0);
								return (
									<DetailRow
										key={field._id}
										label={field.label + (field.required ? " *" : "")}
									>
										{has ? (
											<FieldValueRenderer
												kind={pickRenderKind(field)}
												value={resolved}
												currencyCode={currencyCode}
											/>
										) : (
											<Muted>—</Muted>
										)}
									</DetailRow>
								);
							})}
						</dl>
					</CardContent>
				</Card>
			)}

			{/* ── Recent activity preview — full width on tablet+ ── */}
			<Card className="md:col-span-2">
				<CardHeader className="pb-2">
					<CardTitle className="text-sm">Recent activity</CardTitle>
				</CardHeader>
				<CardContent className="-mx-2 sm:-mx-3">
					<EntityTimeline
						entityType="deal"
						entityId={deal.dealCode}
						pageSize={20}
						visibleCap={20}
						showFilters={false}
						showComposer={false}
					/>
				</CardContent>
			</Card>

			{/* Edit / Fill-stage drawer — re-used by both Vitals and
			    Stage-aware fields card headers. Mode determines which
			    field set is rendered. */}
			<EditDealDrawer
				open={editOpen}
				onOpenChange={setEditOpen}
				orgId={orgId}
				deal={deal}
				mode={editMode}
				stageFieldNames={fieldsToRender.map((f) => f.name)}
				stageDisplayName={currentStage?.name}
			/>
		</div>
	);
}

// ─── Tiny helpers ──────────────────────────────────────────────────────────

/**
 * DetailRow — horizontal label/value pair that fills the row's width.
 *
 * Older versions rendered label on top + value below inside a `<dl
 * grid-cols-2>` so on mobile every row used only the LEFT half of the
 * card and the right side looked empty. We now render each row as a
 * single flex line:
 *
 *   ┌──────────────────────────────────────────┐
 *   │ Code                              D-001  │
 *   │ Stage                            Stage 2 │
 *   │ Owner                       👤 Umar S.   │
 *   └──────────────────────────────────────────┘
 *
 * Both label and value can shrink (`min-w-0`); long values wrap onto
 * additional lines instead of overflowing. Caller wraps multiple rows
 * in `<dl class="flex flex-col gap-1.5 ...">`.
 */
function DetailRow({ label, children }: { label: string; children: React.ReactNode }) {
	return (
		<div className="flex w-full items-start justify-between gap-3 py-1">
			<dt className="shrink-0 text-muted-foreground">{label}</dt>
			<dd className="min-w-0 flex-1 break-words text-end">{children}</dd>
		</div>
	);
}

function Muted({ children }: { children: React.ReactNode }) {
	return <span className="text-muted-foreground">{children}</span>;
}

/**
 * FileFieldRow — full-width inline files surface for one file/files field.
 *
 * Why this exists
 * ───────────────
 *   File-type fields don't keep their value in `entityFieldValues`. Files
 *   are stored in the `files` table, keyed by `(scope, scopeId, fieldKey)`.
 *   The generic `<DetailRow label=… value=…>` therefore renders `—` for
 *   any file field, which made the user think uploaded files were lost
 *   ("just 2 pending even though i have records why it is showing empty").
 *
 *   This component mounts a dedicated subscription via
 *   `useFileAttachments({ scope: "deal", scopeId: dealCode, fieldKey: name })`
 *   that lists files attached to the field — and renders a small dropzone
 *   so new files can be dropped right there. The Files tab still shows
 *   the merged list across all fields.
 */
function FileFieldRow({
	orgId,
	scopeId,
	field,
}: {
	orgId: Id<"orgs"> | undefined;
	scopeId: string;
	field: FieldDef;
}) {
	const allowedFileTypes = (field.allowedFileTypes ?? undefined) as FileCategory[] | undefined;
	const { files, upload, remove, uploading } = useFileAttachments({
		orgId,
		scope: "deal",
		scopeId,
		fieldKey: field.name,
		allowedFileTypes,
	});

	const handleUpload = (list: File[]) => {
		void upload(list);
	};

	return (
		<div className="flex w-full flex-col gap-2 py-2">
			<div className="flex items-center justify-between gap-2">
				<span className="text-muted-foreground">
					{field.label}
					{field.required ? " *" : ""}
				</span>
				<span className="tabular-nums text-[10px] text-muted-foreground">
					{files?.length ?? 0} file{(files?.length ?? 0) === 1 ? "" : "s"}
				</span>
			</div>
			<FileDropzone
				onFiles={handleUpload}
				multiple={field.type === "files"}
				label="Drop files here or click to browse"
				className="py-3 text-[11px]"
			/>
			{(files?.length ?? 0) > 0 && (
				<FileList
					files={files ?? []}
					uploading={uploading}
					onRemove={remove}
					emptyText="No files yet."
				/>
			)}
		</div>
	);
}

function readFieldValue(
	field: FieldDef,
	deal: Deal,
	customValues: Record<string, unknown>,
): unknown {
	switch (field.storage) {
		case "column":
			return (deal as unknown as Record<string, unknown>)[field.columnKey ?? field.name];
		case "fieldValues":
			return customValues[field.name];
		case "join":
			return customValues[field.name];
		default:
			return (
				customValues[field.name] ?? (deal as unknown as Record<string, unknown>)[field.name]
			);
	}
}

/**
 * Map raw IDs (assigneeUserId, stageId) to their display names BEFORE the
 * renderer runs — same fix as the old DealFieldRow. Anything else falls
 * through unchanged.
 */
function resolveFieldValue(
	field: FieldDef,
	raw: unknown,
	memberNameMap: Map<string, string>,
	stageNameMap: Map<string, string>,
): unknown {
	if (raw === undefined || raw === null || raw === "") return raw;
	if (field.name === "assignedTo" || field.kind === "assignee") {
		const name = memberNameMap.get(String(raw));
		if (name) return name;
	}
	if (
		field.name === "currentStageId" ||
		field.name === "stageId" ||
		field.kind === "stage" ||
		field.kind === "status"
	) {
		const name = stageNameMap.get(String(raw));
		if (name) return name;
	}
	return raw;
}

function pickRenderKind(field: FieldDef): React.ComponentProps<typeof FieldValueRenderer>["kind"] {
	if (field.kind) {
		switch (field.kind) {
			case "personCode":
			case "entityCode":
			case "tags":
			case "currency":
			case "personDisplay":
				return field.kind;
			default:
				break;
		}
	}
	switch (field.type) {
		case "number":
			return "number";
		case "date":
			return "date";
		case "boolean":
			return "checkbox";
		case "url":
			return "link";
		case "email":
			return "email";
		case "file":
		case "files":
			return field.type === "files" ? "files" : "file";
		case "multiselect":
			return "tags";
		default:
			return "text";
	}
}

function formatRelative(ts: number): string {
	const diff = Date.now() - ts;
	const sec = Math.round(diff / 1000);
	if (sec < 60) return "just now";
	const min = Math.round(sec / 60);
	if (min < 60) return `${min}m ago`;
	const hr = Math.round(min / 60);
	if (hr < 24) return `${hr}h ago`;
	const day = Math.round(hr / 24);
	if (day < 7) return `${day}d ago`;
	const wk = Math.round(day / 7);
	if (wk < 5) return `${wk}w ago`;
	const mo = Math.round(day / 30);
	if (mo < 12) return `${mo}mo ago`;
	const yr = Math.round(day / 365);
	return `${yr}y ago`;
}
