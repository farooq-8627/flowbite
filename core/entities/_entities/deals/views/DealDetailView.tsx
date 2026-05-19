"use client";

/**
 * DealsView — kanban primary (D8), list secondary.
 *
 * - Pipeline stages → board columns (colours come from the pipeline config).
 * - moveToStage on drag. closeAsDone + confetti on won.
 * - Deal value hidden from member role via deals.viewValues permission.
 * - Creating a deal REQUIRES a person (lead or contact) — the deal is always
 *   on behalf of someone. The drawer has a PersonSelect for that.
 * - Toolbar search ranks matches to the top of each stage column with a brief
 *   flash highlight.
 */

import type { ColumnDef } from "@tanstack/react-table";
import { useMutation, useQuery } from "convex/react";
import { formatDistanceToNow } from "date-fns";
import { PlusIcon } from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { FirstTimeTour } from "@/components/ui/first-time-tour";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { EntityTimeline } from "@/core/comms/timeline/components/EntityTimeline";
import type { KanbanColumnConfig } from "@/core/data-display/kanban/components/KanbanBoard";
import { computeSortOrderForDrop } from "@/core/data-display/kanban/utils/sort-order";
import {
	CreateModeFileField,
	FileBufferProvider,
	useFileBuffer,
} from "@/core/data-io/files/components/CreateModeFileField";
import { EntityListPage } from "@/core/entities/scaffolds/EntityListPage";
import { AssigneeCell } from "@/core/entities/shared/components/AssigneeCell";
import { EntityCard } from "@/core/entities/shared/components/EntityCard";
import { FormDrawer } from "@/core/entities/shared/components/FormDrawer";
import { PersonSelect } from "@/core/entities/shared/components/PersonSelect";
import { SavedViewsMenu } from "@/core/entities/shared/components/SavedViewsMenu";
import { StageFilter } from "@/core/entities/shared/components/StageFilter";
import { ViewOptionsMenu } from "@/core/entities/shared/components/ViewOptionsMenu";
import { getStatusColor } from "@/core/entities/shared/config/defaults";
import { useEntityFields } from "@/core/entities/shared/hooks/useEntityFields";
import { useEntityFieldValuesMap } from "@/core/entities/shared/hooks/useEntityFieldValuesMap";
import {
	useAttachTagToEntity,
	useDetachTagFromEntity,
	useMoveDealToStage,
	useUpdateDeal,
} from "@/core/entities/shared/hooks/useEntityMutations";
import { useEntityTagsMap } from "@/core/entities/shared/hooks/useEntityTagsMap";
import { useViewToggle } from "@/core/entities/shared/hooks/useViewToggle";
import { buildEntityBoardTour } from "@/core/entities/shared/tours";
import type { PersonRef } from "@/core/entities/shared/types";
import {
	getHiddenCardFieldsForGrouping,
	getRevealedCardFieldForGrouping,
	NO_GROUP_KEY,
} from "@/core/entities/shared/utils/board-grouping";
import { rankBySearch, type SearchableItem } from "@/core/entities/shared/utils/search";
import { EntityCalendarPanel } from "@/core/scheduling/calendar/panels/EntityCalendarPanel";
import { EntityFollowups } from "@/core/scheduling/followups/components/EntityFollowups";
import { RemindersPanel } from "@/core/scheduling/reminders/panels/RemindersPanel";
import type { PrimaryActionConfig } from "@/core/shell/shared/entity-layout";
import { useCurrentOrg, useOrgMembers } from "@/core/shell/shared/hooks/useCurrentOrg";
import { useEntityLabels } from "@/core/shell/shared/hooks/useEntityLabels";
import { useQuickAddListener } from "@/core/shell/shell/components/QuickAddMenu";
import { useOrgPermission } from "@/features/orgs/hooks/useOrgPermission";
import { usePersistedState } from "@/lib/hooks/use-persisted-state";

type DealRow = Record<string, unknown> & { id: string };

const DEAL_SEARCH_FIELDS = ["title", "dealCode", "personCode"] as const;

export function DealsView({ orgSlug: _orgSlug }: { orgSlug: string }) {
	const labels = useEntityLabels();
	const { orgId } = useCurrentOrg();
	const [view, setView] = useViewToggle("deal");
	const { visibleFields: dealFields } = useEntityFields("deal", orgId);
	const defaultCardFields = useMemo(() => dealFields.map((f) => f.name), [dealFields]);
	const listColumns = defaultCardFields;
	const canViewValues = useOrgPermission(orgId, "deals.viewValues");
	const [search, setSearch] = useState("");
	// Persisted view options — survive route changes / reloads.
	// `cardFields:v2` (2026-05-18) — see LeadsView for context.
	const [cardFields, setCardFields] = usePersistedState<string[]>(
		"viewopts:deal:cardFields:v2",
		[],
	);
	const [groupBy, setGroupBy] = usePersistedState<string>(
		"viewopts:deal:groupBy",
		"currentStageId",
	);
	const [stageFilter, setStageFilter] = useState<string | undefined>(undefined);
	const [activeSavedViewId, setActiveSavedViewId] = useState<string | undefined>(undefined);

	useEffect(() => {
		setCardFields((prev) => {
			if (!prev || prev.length === 0) return defaultCardFields;
			const allowed = new Set(defaultCardFields);
			const next = prev.filter((f) => allowed.has(f));
			return next.length === prev.length ? prev : next;
		});
	}, [defaultCardFields, setCardFields]);

	// Pipeline
	const pipeline = useQuery(
		api.crm.fields.pipelines.queries.getDefault,
		orgId ? { orgId, entityType: "deal" } : "skip",
	);

	// Deals grouped by stage (for board)
	const grouped = useQuery(
		api.crm.entities.deals.queries.listGroupedByStage,
		orgId && pipeline?._id ? { orgId, pipelineId: pipeline._id } : "skip",
	);

	// Flat list — only needed for list view. Skip while the board is active
	// to avoid a full-table subscription when the kanban is the primary view.
	const flatDeals = useQuery(
		api.crm.entities.deals.queries.list,
		orgId && view === "list" ? { orgId } : "skip",
	);
	const items = useMemo(
		() =>
			flatDeals
				?.map((d) => ({ ...d, id: d._id as string }))
				.sort((a, b) => (b._creationTime ?? 0) - (a._creationTime ?? 0)),
		[flatDeals],
	);

	// Search ranking + optional stage filter (table view only — board view is
	// already grouped by stage so the filter would be redundant).
	const filteredItems = useMemo(() => {
		const base = items ?? [];
		if (!stageFilter || view !== "list") return base;
		return base.filter((it) => (it as Record<string, unknown>).currentStageId === stageFilter);
	}, [items, stageFilter, view]);

	const rankedItems = useMemo(
		() =>
			rankBySearch(
				filteredItems as SearchableItem[],
				search,
				DEAL_SEARCH_FIELDS as unknown as string[],
			),
		[filteredItems, search],
	);
	const [flashEpoch, setFlashEpoch] = useState(0);
	useEffect(() => {
		if (!search) return;
		setFlashEpoch((e) => e + 1);
	}, [search]);

	// Mutations — all centralized in `useEntityMutations.ts`. The hooks
	// carry the optimistic-update logic (per AGENTS.md
	// "Every list-affecting mutation has `withOptimisticUpdate`"). The
	// kanban card visually moves the moment the user releases the drag,
	// then reconciles with the server response.
	const moveToStage = useMoveDealToStage();
	const createDeal = useMutation(api.crm.entities.deals.mutations.create);

	const [addOpen, setAddOpen] = useState(false);

	// Global quick-add listener — "New deal" from anywhere opens the Add drawer.
	useQuickAddListener("create-deal", () => setAddOpen(true));

	const { valuesByEntityId: customValuesByEntityId } = useEntityFieldValuesMap("deal", orgId);
	// Batched per-row tag lookup. One subscription drives every card on
	// the board — replaces the per-card `getTagsForEntity` queries that
	// were the dominant load source on the deals kanban.
	const { tagsByEntityId } = useEntityTagsMap(orgId, "deal");

	// Board columns — pipeline stages (when grouping by currentStageId) or
	// generic buckets (when grouping by any other field).
	const members = useOrgMembers();
	const memberNameById = useMemo(() => {
		const map = new Map<string, string>();
		for (const m of members ?? []) {
			map.set(m.userId as string, m.user?.name ?? m.user?.email ?? (m.userId as string));
		}
		return map;
	}, [members]);

	const boardColumns: KanbanColumnConfig[] = useMemo(() => {
		if (groupBy === "currentStageId") {
			if (!pipeline?.stages) return [];
			return pipeline.stages.map((s) => ({
				id: s.id,
				title: s.name,
				color: s.color,
				isFinal: s.isFinal,
				finalType: s.finalType,
			}));
		}
		if (groupBy === "assignedTo") {
			const assignees = new Set<string>();
			for (const it of items ?? []) {
				const a = (it as Record<string, unknown>).assignedTo as string | undefined;
				assignees.add(a ? String(a) : NO_GROUP_KEY);
			}
			return Array.from(assignees).map((a) => ({
				id: a,
				title: a === NO_GROUP_KEY ? "Unassigned" : (memberNameById.get(a) ?? a),
				color: getStatusColor("deal", a === NO_GROUP_KEY ? "open" : "won"),
			}));
		}
		// Generic fallback
		const values = new Set<string>();
		for (const it of items ?? []) {
			const raw = (it as Record<string, unknown>)[groupBy];
			values.add(raw ? String(raw) : NO_GROUP_KEY);
		}
		return Array.from(values).map((v) => ({
			id: v,
			title: v === NO_GROUP_KEY ? "—" : v,
			color: getStatusColor("deal", v),
		}));
	}, [groupBy, pipeline, items, memberNameById]);

	// Items by column for board — supports stage grouping (uses server
	// `listGroupedByStage`) or generic per-field grouping from the flat list.
	// Each column is sorted by sortOrder asc so dragged-to-position cards
	// stick. Search matches still float to the top.
	const itemsByColumnId = useMemo(() => {
		const ranked = new Set(rankedItems.matchedIds);

		const sortColumn = (rows: DealRow[]): DealRow[] =>
			rows.slice().sort((a, b) => {
				const aMatch = ranked.has(a.id);
				const bMatch = ranked.has(b.id);
				if (aMatch !== bMatch) return aMatch ? -1 : 1;
				const aKey =
					(a as { sortOrder?: number; _creationTime?: number }).sortOrder ??
					-((a as { _creationTime?: number })._creationTime ?? 0);
				const bKey =
					(b as { sortOrder?: number; _creationTime?: number }).sortOrder ??
					-((b as { _creationTime?: number })._creationTime ?? 0);
				return aKey - bKey;
			});

		if (groupBy === "currentStageId") {
			if (!grouped) return {};
			const result: Record<string, DealRow[]> = {};
			for (const [stageId, deals] of Object.entries(grouped)) {
				const rows = (deals as Array<Record<string, unknown>>).map((d) => ({
					...d,
					id: (d._id ?? d.id) as string,
				})) as DealRow[];
				result[stageId] = sortColumn(rows);
			}
			return result;
		}

		// Generic grouping — bucket flat items by the raw value of `groupBy`.
		const result: Record<string, DealRow[]> = {};
		for (const col of boardColumns) result[col.id] = [];
		for (const it of rankedItems.items as DealRow[]) {
			const raw = (it as Record<string, unknown>)[groupBy];
			const key = raw ? String(raw) : NO_GROUP_KEY;
			if (!result[key]) result[key] = [];
			result[key].push(it);
		}
		for (const key of Object.keys(result)) {
			result[key] = sortColumn(result[key]);
		}
		return result;
	}, [groupBy, grouped, rankedItems.matchedIds, rankedItems.items, boardColumns]);

	// Handle card move (drag-drop) — updates the active `groupBy` field
	// and persists the dropped position via `sortOrder`. In-column reorder
	// and cross-column move are dispatched through the same callback.
	//
	// Tag groupBy: deals can carry multiple tags. Dragging across tag columns
	// swaps just the source/destination tag (not all tags). NO_GROUP_KEY ↔
	// "untagged" — no join row to add/remove.
	const updateDeal = useUpdateDeal();
	const attachTag = useAttachTagToEntity();
	const detachTag = useDetachTagFromEntity();
	const handleCardMove = useCallback(
		async (itemId: string, fromCol: string, toCol: string, newIndex: number) => {
			if (!orgId) return;

			// Reconstruct the destination column AFTER the drop so we can
			// compute the midpoint sortOrder.
			const destBefore = itemsByColumnId[toCol] ?? [];
			let itemsAfter: DealRow[];
			if (fromCol === toCol) {
				const oldIndex = destBefore.findIndex((it) => it.id === itemId);
				if (oldIndex < 0) {
					itemsAfter = destBefore;
				} else {
					const copy = destBefore.slice();
					const [moved] = copy.splice(oldIndex, 1);
					copy.splice(newIndex, 0, moved);
					itemsAfter = copy;
				}
			} else {
				const movedItem = (rankedItems.items as DealRow[]).find((it) => it.id === itemId);
				if (!movedItem) return;
				const copy = destBefore.slice();
				copy.splice(newIndex, 0, movedItem);
				itemsAfter = copy;
			}
			const sortOrder = computeSortOrderForDrop(
				itemsAfter as Array<{ id: string; sortOrder?: number; _creationTime?: number }>,
				newIndex,
			);

			try {
				if (fromCol === toCol) {
					// In-column reorder — only sortOrder.
					await updateDeal({
						orgId,
						dealId: itemId as Id<"deals">,
						sortOrder,
					});
					return;
				}
				if (groupBy === "currentStageId") {
					await moveToStage({
						orgId,
						dealId: itemId as Id<"deals">,
						stageId: toCol,
						sortOrder,
					});
					const toStage = pipeline?.stages.find((s) => s.id === toCol);
					if (toStage?.isFinal && toStage.finalType === "positive") {
						toast.success(`🎉 ${labels.deal.singular} won!`);
						import("canvas-confetti")
							.then((mod) => mod.default({ particleCount: 100, spread: 70 }))
							.catch(() => {});
					}
					return;
				}
				if (groupBy === "assignedTo") {
					await updateDeal({
						orgId,
						dealId: itemId as Id<"deals">,
						assignedTo: toCol === NO_GROUP_KEY ? undefined : (toCol as Id<"users">),
						sortOrder,
					});
					return;
				}
				if (groupBy === "tag" || groupBy === "tags") {
					// Tag move — sortOrder first, then detach old / attach new.
					await updateDeal({ orgId, dealId: itemId as Id<"deals">, sortOrder });
					if (fromCol !== NO_GROUP_KEY) {
						await detachTag({
							orgId,
							tagId: fromCol as Id<"tags">,
							entityType: "deal",
							entityId: itemId,
						});
					}
					if (toCol !== NO_GROUP_KEY) {
						await attachTag({
							orgId,
							tagId: toCol as Id<"tags">,
							entityType: "deal",
							entityId: itemId,
						});
					}
					return;
				}
				// Unknown/custom groupBy — only persist position.
				await updateDeal({ orgId, dealId: itemId as Id<"deals">, sortOrder });
			} catch (err) {
				toast.error(`Couldn't move ${labels.deal.singular.toLowerCase()}`, {
					description: err instanceof Error ? err.message : undefined,
				});
			}
		},
		[
			orgId,
			moveToStage,
			updateDeal,
			pipeline,
			labels.deal.singular,
			groupBy,
			itemsByColumnId,
			rankedItems.items,
			attachTag,
			detachTag,
		],
	);

	// List columns
	const columns: ColumnDef<DealRow, unknown>[] = useMemo(() => {
		const cols: ColumnDef<DealRow, unknown>[] = [
			{
				id: "select",
				header: ({ table }) => (
					<Checkbox
						checked={table.getIsAllPageRowsSelected()}
						onCheckedChange={(v) => table.toggleAllPageRowsSelected(!!v)}
						aria-label="Select all"
					/>
				),
				cell: ({ row }) => (
					<Checkbox
						checked={row.getIsSelected()}
						onCheckedChange={(v) => row.toggleSelected(!!v)}
						aria-label="Select row"
					/>
				),
				enableSorting: false,
				size: 40,
			},
		];
		for (const key of listColumns) {
			switch (key) {
				case "dealCode":
					cols.push({
						accessorKey: "dealCode",
						header: "Code",
						cell: ({ row }) => (
							<Badge variant="outline" className="font-mono text-xs">
								{row.getValue("dealCode") as string}
							</Badge>
						),
						size: 100,
					});
					break;
				case "title":
					cols.push({
						accessorKey: "title",
						header: "Title",
						cell: ({ row }) => (
							<span className="font-medium">{row.getValue("title") as string}</span>
						),
					});
					break;
				case "value":
					if (canViewValues === true) {
						cols.push({
							accessorKey: "value",
							header: "Value",
							cell: ({ row }) => {
								const v = row.getValue("value") as number | undefined;
								return v ? (
									<span className="tabular-nums">
										{new Intl.NumberFormat(undefined, {
											style: "currency",
											currency: "USD",
											maximumFractionDigits: 0,
										}).format(v)}
									</span>
								) : (
									<span className="text-muted-foreground">—</span>
								);
							},
						});
					}
					break;
				case "currentStageId":
					cols.push({
						accessorKey: "currentStageId",
						header: "Stage",
						cell: ({ row }) => {
							const stageId = row.getValue("currentStageId") as string;
							const stage = pipeline?.stages.find((s) => s.id === stageId);
							return (
								<Badge variant="secondary" className="text-xs">
									{stage?.name ?? stageId}
								</Badge>
							);
						},
					});
					break;
				case "assignedTo":
					cols.push({
						accessorKey: "assignedTo",
						header: "Assignee",
						cell: ({ row }) => (
							<AssigneeCell
								orgId={orgId}
								userId={row.getValue("assignedTo") as string}
							/>
						),
					});
					break;
				case "createdAt":
					cols.push({
						accessorKey: "createdAt",
						header: "Created",
						cell: ({ row }) => (
							<span className="text-xs text-muted-foreground">
								{formatDistanceToNow(
									new Date(row.getValue("createdAt") as number),
									{ addSuffix: true },
								)}
							</span>
						),
					});
					break;
				default:
					cols.push({
						accessorKey: key,
						header: key,
						cell: ({ row }) => {
							const direct = row.getValue(key);
							if (direct !== undefined && direct !== null && direct !== "") {
								return <span className="text-sm">{String(direct)}</span>;
							}
							const r = row.original as DealRow;
							const v = customValuesByEntityId[r.id]?.[key];
							if (v === undefined || v === null || v === "") {
								return <span className="text-sm text-muted-foreground">—</span>;
							}
							if (Array.isArray(v))
								return <span className="text-sm">{v.join(", ")}</span>;
							return <span className="text-sm">{String(v)}</span>;
						},
					});
			}
		}
		return cols;
	}, [listColumns, canViewValues, pipeline, orgId, customValuesByEntityId]);

	const primaryAction: PrimaryActionConfig = {
		label: `Add ${labels.deal.singular}`,
		icon: PlusIcon,
		permission: "deals.create",
		onClick: () => setAddOpen(true),
	};

	// Hide grouped-by field + reveal complementary
	const effectiveCardFields = useMemo(() => {
		const hidden = new Set(getHiddenCardFieldsForGrouping(groupBy));
		let next = cardFields.filter((f) => !hidden.has(f));
		const reveal = getRevealedCardFieldForGrouping(groupBy, "deal");
		if (reveal && !next.includes(reveal)) next = [reveal, ...next];
		return next;
	}, [cardFields, groupBy]);

	// Pipeline stage lookup — used to resolve `currentStageId` (revealed
	// when grouping deals by tag/assignee) into the human-readable stage
	// name for the EntityCard's "fill the gap" strip.
	const stageNameById = useMemo(() => {
		const map = new Map<string, string>();
		for (const s of pipeline?.stages ?? []) map.set(s.id, s.name);
		return map;
	}, [pipeline?.stages]);

	// Resolver for the EntityCard "fill the gap" indicator. Deals' reveal
	// matrix surfaces `assignedTo` (user id) or `currentStageId` (stage id)
	// — both opaque and require a lookup.
	const resolveReplacementLabel = useCallback(
		(fieldName: string, raw: string): string | undefined => {
			if (fieldName === "assignedTo") return memberNameById.get(raw);
			if (fieldName === "currentStageId") return stageNameById.get(raw);
			return undefined;
		},
		[memberNameById, stageNameById],
	);

	return (
		<>
			<EntityListPage
				slot="deal"
				items={rankedItems.items as typeof items}
				columns={columns}
				views={["list", "board"]}
				view={view}
				onViewChange={setView}
				primaryAction={primaryAction}
				orgId={orgId}
				search={{
					value: search,
					onChange: setSearch,
					placeholder: `Search ${labels.deal.plural.toLowerCase()}…`,
				}}
				renderToolbarExtras={() =>
					view === "board" ? (
						<ViewOptionsMenu
							slot="deal"
							orgId={orgId}
							view={view}
							visibleFields={cardFields}
							onVisibleFieldsChange={setCardFields}
							groupBy={groupBy}
							onGroupByChange={setGroupBy}
						/>
					) : (
						<div className="flex items-center gap-2">
							<StageFilter
								stages={(pipeline?.stages ?? []).map((s) => ({
									id: s.id,
									name: s.name,
									color: s.color,
								}))}
								value={stageFilter}
								onChange={setStageFilter}
							/>
							<SavedViewsMenu
								slot="deal"
								currentColumns={cardFields}
								currentFilters={stageFilter ? { stage: stageFilter } : undefined}
								activeViewId={activeSavedViewId}
								onApply={(view) => {
									if (view === null) {
										setActiveSavedViewId(undefined);
										setStageFilter(undefined);
										return;
									}
									setActiveSavedViewId(view.id);
									setCardFields(view.columns);
									setStageFilter(
										(view.filters?.stage as string | undefined) ?? undefined,
									);
								}}
							/>
						</div>
					)
				}
				boardColumns={boardColumns}
				itemsByColumnId={itemsByColumnId}
				renderCard={(item, isDragging) => (
					<EntityCard
						key={item.id}
						slot="deal"
						item={{ ...item, orgId }}
						cardFields={effectiveCardFields}
						customFieldValues={customValuesByEntityId[item.id]}
						isDragging={isDragging}
						isHighlighted={search ? rankedItems.matchedIds.has(item.id) : false}
						highlightEpoch={flashEpoch}
						groupBy={groupBy}
						resolveReplacementLabel={resolveReplacementLabel}
						prefetchedTags={tagsByEntityId[item.id]}
					/>
				)}
				onCardMove={handleCardMove}
				emptyTitle={`No ${labels.deal.plural.toLowerCase()} yet`}
				emptyDescription={`Create your first ${labels.deal.singular.toLowerCase()} to get started.`}
			/>

			<AddDealDrawer
				open={addOpen}
				onOpenChange={setAddOpen}
				orgId={orgId}
				pipelineId={pipeline?._id}
				stages={pipeline?.stages}
				onCreate={(args) => createDeal(args as Parameters<typeof createDeal>[0])}
			/>

			{/* First-time coachmarks for the deals board. Fires once per device. */}
			{view === "board" && (
				<FirstTimeTour
					id="deals-board-v2"
					steps={buildEntityBoardTour({
						primaryActionVerb: "Edit",
						groupedBy: "stage",
					})}
				/>
			)}
		</>
	);
}

// ─── AddDealDrawer ────────────────────────────────────────────────────────────

function AddDealDrawer({
	open,
	onOpenChange,
	orgId,
	pipelineId,
	stages,
	onCreate,
}: {
	open: boolean;
	onOpenChange: (v: boolean) => void;
	orgId: Id<"orgs"> | undefined;
	pipelineId: Id<"pipelines"> | undefined;
	stages: Array<{ id: string; name: string }> | undefined;
	onCreate: (args: Record<string, unknown>) => Promise<unknown>;
}) {
	const labels = useEntityLabels();
	const params = useParams();
	const orgSlug = params?.orgSlug as string | undefined;
	const locale = params?.locale as string | undefined;

	const [title, setTitle] = useState("");
	const [value, setValue] = useState("");
	const [person, setPerson] = useState<PersonRef | null>(null);
	const [assignee, setAssignee] = useState<PersonRef | null>(null);
	const [isSubmitting, setIsSubmitting] = useState(false);

	// File buffer — bytes upload immediately to Convex storage and we commit
	// the rows under scope="deal" / scopeId=dealCode after the deal row is
	// created. Mirrors the AddLeadDrawer flow.
	const fileBuffer = useFileBuffer(orgId);

	// Reset the buffer when the drawer is closed so re-opening starts clean.
	useEffect(() => {
		if (!open) fileBuffer.reset();
	}, [open, fileBuffer.reset]);

	const firstStageId = stages?.[0]?.id;
	const hasPipeline = !!pipelineId && !!firstStageId;
	const canSubmit = hasPipeline && !!title.trim() && !!person;

	const settingsHref =
		orgSlug && locale
			? `/${locale}/${orgSlug}/settings?group=modules&tab=deal`
			: orgSlug
				? `/${orgSlug}/settings?group=modules&tab=deal`
				: "/settings";

	const handleSubmit = async () => {
		if (!orgId || !pipelineId || !firstStageId || !canSubmit || !person) return;
		setIsSubmitting(true);
		try {
			const created = (await onCreate({
				orgId,
				title: title.trim(),
				pipelineId,
				currentStageId: firstStageId,
				value: value ? Number(value) : undefined,
				assignedTo: assignee?.id as Id<"users"> | undefined,
				personCode: person.personCode,
				...(person.type === "contact" ? { contactId: person.id as Id<"contacts"> } : {}),
				source: "manual",
			})) as { dealId?: Id<"deals">; dealCode?: string } | undefined;

			// Commit any buffered files under the new deal scope. Tag the file
			// with `person:<code>` so it also surfaces on the person profile.
			if (created?.dealCode) {
				try {
					await fileBuffer.commitAll({
						scope: "deal",
						scopeId: created.dealCode,
						tags: person?.personCode ? [`person:${person.personCode}`] : undefined,
					});
				} catch {
					// commitAll surfaces individual toasts.
				}
			}

			toast.success(`${labels.deal.singular} created`);
			setTitle("");
			setValue("");
			setPerson(null);
			setAssignee(null);
			onOpenChange(false);
		} catch (err) {
			toast.error(`Couldn't create ${labels.deal.singular.toLowerCase()}`, {
				description: err instanceof Error ? err.message : undefined,
			});
		} finally {
			setIsSubmitting(false);
		}
	};

	return (
		<FormDrawer
			open={open}
			onOpenChange={onOpenChange}
			title={`Add ${labels.deal.singular}`}
			onSubmit={handleSubmit}
			isSubmitting={isSubmitting}
			submitLabel="Create"
			submitDisabled={!canSubmit}
		>
			<FileBufferProvider value={fileBuffer}>
				{!hasPipeline ? (
					<div className="flex flex-col items-start gap-3 rounded-[var(--radius)] border bg-amber-50/40 p-4 text-sm dark:bg-amber-900/10">
						<p className="font-medium">
							No pipelines yet for {labels.deal.plural.toLowerCase()}.
						</p>
						<p className="text-xs text-muted-foreground">
							Set up your first pipeline before creating a{" "}
							{labels.deal.singular.toLowerCase()}. You'll define the stages it can
							move through (e.g. New → Negotiation → Won).
						</p>
						<Link
							href={settingsHref}
							className="text-xs font-medium text-primary underline-offset-2 hover:underline"
						>
							Open Settings → Modules → {labels.deal.singular} → Pipelines →
						</Link>
					</div>
				) : (
					<div className="flex flex-col gap-4">
						<section className="flex flex-col gap-2.5">
							<div className="flex flex-col gap-1">
								<Label
									htmlFor="deal-title"
									className="text-[11px] font-medium leading-none"
								>
									Title
									<span className="ms-0.5 text-destructive/60">*</span>
								</Label>
								<Input
									id="deal-title"
									value={title}
									onChange={(e) => setTitle(e.target.value)}
									placeholder={`${labels.deal.singular} title`}
									className="h-9 text-sm"
								/>
							</div>
							<div className="flex flex-col gap-1">
								<Label className="text-[11px] font-medium leading-none">
									{labels.contact.singular} or {labels.lead.singular}
									<span className="ms-0.5 text-destructive/60">*</span>
								</Label>
								<PersonSelect
									scope="person"
									value={person}
									onChange={setPerson}
									orgId={orgId}
									placeholder={`Who is this ${labels.deal.singular.toLowerCase()} for?`}
								/>
								<p className="text-[10px] leading-snug text-muted-foreground">
									Every {labels.deal.singular.toLowerCase()} belongs to a{" "}
									{labels.contact.singular.toLowerCase()} or{" "}
									{labels.lead.singular.toLowerCase()}.
								</p>
							</div>
						</section>

						<section className="flex flex-col gap-2.5">
							<div className="flex items-center gap-2">
								<span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
									Details
								</span>
								<div className="h-px flex-1 bg-border" />
							</div>
							<div className="grid grid-cols-2 gap-2.5">
								<div className="flex flex-col gap-1">
									<Label
										htmlFor="deal-value"
										className="text-[11px] font-medium leading-none"
									>
										Value
									</Label>
									<Input
										id="deal-value"
										type="number"
										value={value}
										onChange={(e) => setValue(e.target.value)}
										placeholder="0"
										className="h-9 text-sm"
									/>
								</div>
								<div className="flex flex-col gap-1">
									<Label className="text-[11px] font-medium leading-none">
										Assignee
									</Label>
									<PersonSelect
										scope="user"
										value={assignee}
										onChange={setAssignee}
										orgId={orgId}
										placeholder="Assign to…"
									/>
								</div>
							</div>
						</section>

						{/* Files — bytes upload now, rows commit on submit */}
						{orgId && (
							<section className="flex flex-col gap-2.5">
								<div className="flex items-center gap-2">
									<span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
										Files
									</span>
									<div className="h-px flex-1 bg-border" />
								</div>
								<CreateModeFileField
									orgId={orgId}
									fieldKey="_default"
									label="Files"
									multiple
								/>
							</section>
						)}
					</div>
				)}
			</FileBufferProvider>
		</FormDrawer>
	);
}

export function DealDetailView({ orgSlug, dealId }: { orgSlug: string; dealId: string }) {
	const labels = useEntityLabels();
	const { orgId } = useCurrentOrg();
	// `dealId` from the URL is actually the dealCode (D-001), per our slug
	// scheme — we resolve to the full doc via `getByDealCode`.
	const deal = useQuery(
		api.crm.entities.deals.queries.getByDealCode,
		orgId ? { orgId, dealCode: dealId } : "skip",
	);

	const tabs = [
		{ id: "overview" as const, label: "Overview" },
		{ id: "timeline" as const, label: "Timeline" },
		{ id: "followups" as const, label: "Follow-ups" },
		{ id: "calendar" as const, label: "Calendar" },
		{ id: "reminders" as const, label: "Reminders" },
	];
	const [activeTab, setActiveTab] = useState<(typeof tabs)[number]["id"]>("overview");

	if (deal === undefined) {
		return (
			<div
				data-org={orgSlug}
				data-id={dealId}
				className="flex h-full items-center justify-center text-sm text-muted-foreground"
			>
				Loading {labels.deal.singular.toLowerCase()}…
			</div>
		);
	}
	if (deal === null) {
		return (
			<div
				data-org={orgSlug}
				data-id={dealId}
				className="flex h-full flex-col items-center justify-center gap-2 text-center"
			>
				<p className="text-sm font-medium">{labels.deal.singular} not found</p>
				<p className="text-xs text-muted-foreground">{dealId}</p>
			</div>
		);
	}

	return (
		<div className="flex h-full min-h-0 flex-col" data-org={orgSlug} data-id={dealId}>
			{/* Header */}
			<div className="border-b bg-background px-4 py-3">
				<div className="flex items-center gap-3">
					<div className="flex flex-col gap-0.5">
						<h1 className="text-lg font-semibold tracking-tight">{deal.title}</h1>
						<p className="text-xs text-muted-foreground">
							<span className="font-mono tabular-nums">{deal.dealCode}</span>
							{deal.personCode ? (
								<>
									<span aria-hidden> · </span>
									<Link
										href={`/${orgSlug}/profile/${deal.personCode}`}
										className="font-mono tabular-nums hover:text-foreground hover:underline"
									>
										{deal.personCode}
									</Link>
								</>
							) : null}
						</p>
					</div>
				</div>
				{/* Tabs */}
				<div className="mt-3 flex items-center gap-1 border-b -mb-3">
					{tabs.map((t) => {
						const active = activeTab === t.id;
						return (
							<button
								key={t.id}
								type="button"
								onClick={() => setActiveTab(t.id)}
								aria-pressed={active}
								className={`relative px-3 pb-2 pt-1 text-sm transition-colors ${
									active
										? "font-medium text-foreground"
										: "text-muted-foreground hover:text-foreground"
								}`}
							>
								{t.label}
								{active && (
									<span
										aria-hidden
										className="absolute inset-x-3 -bottom-px h-0.5 bg-primary"
									/>
								)}
							</button>
						);
					})}
				</div>
			</div>

			{/* Tab body */}
			<div className="flex min-h-0 flex-1 flex-col overflow-auto p-4">
				{activeTab === "overview" && (
					<div className="grid gap-3 text-sm">
						<div className="rounded-[var(--radius)] border bg-card p-4">
							<h3 className="text-sm font-semibold">Details</h3>
							<dl className="mt-2 grid grid-cols-2 gap-x-6 gap-y-1.5 text-xs">
								<dt className="text-muted-foreground">Stage</dt>
								<dd className="font-medium">{deal.currentStageId}</dd>
								<dt className="text-muted-foreground">Value</dt>
								<dd className="font-medium tabular-nums">
									{deal.value ?? 0} {deal.currency ?? ""}
								</dd>
								{deal.expectedCloseDate ? (
									<>
										<dt className="text-muted-foreground">Expected close</dt>
										<dd className="font-medium">
											{new Date(deal.expectedCloseDate).toLocaleDateString()}
										</dd>
									</>
								) : null}
							</dl>
						</div>

						{/* Embedded summary cards: 2-column grid mirroring the
						    profile Overview layout. Timeline + Follow-ups
						    surface the most important context without forcing
						    a tab switch. */}
						<div className="grid gap-3 lg:grid-cols-2">
							<div className="flex min-h-[18rem] flex-col rounded-[var(--radius)] border bg-card">
								<div className="flex items-center justify-between border-b px-3 py-2">
									<h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
										Recent activity
									</h3>
									<button
										type="button"
										onClick={() => setActiveTab("timeline")}
										className="text-[10px] text-muted-foreground hover:text-foreground hover:underline"
									>
										View all
									</button>
								</div>
								<div className="flex min-h-0 flex-1 flex-col">
									<EntityTimeline
										entityType="deal"
										entityId={deal.dealCode}
										personCode={deal.personCode}
										pageSize={20}
										visibleCap={20}
										showFilters={false}
										showComposer={false}
									/>
								</div>
							</div>
							<div className="flex min-h-[18rem] flex-col rounded-[var(--radius)] border bg-card">
								<div className="flex items-center justify-between border-b px-3 py-2">
									<h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
										Open follow-ups
									</h3>
									<button
										type="button"
										onClick={() => setActiveTab("followups")}
										className="text-[10px] text-muted-foreground hover:text-foreground hover:underline"
									>
										View all
									</button>
								</div>
								<div className="flex min-h-0 flex-1 flex-col p-3">
									<EntityFollowups
										entityType="deal"
										entityId={deal.dealCode}
										defaults={{ personCode: deal.personCode }}
									/>
								</div>
							</div>
						</div>
					</div>
				)}
				{activeTab === "timeline" && (
					<EntityTimeline
						entityType="deal"
						entityId={deal.dealCode}
						personCode={deal.personCode}
					/>
				)}
				{activeTab === "followups" && (
					<EntityFollowups
						entityType="deal"
						entityId={deal.dealCode}
						defaults={{ personCode: deal.personCode }}
					/>
				)}
				{activeTab === "calendar" && (
					<EntityCalendarPanel
						entityType="deal"
						entityId={deal.dealCode}
						personCode={deal.personCode}
						dealCode={deal.dealCode}
					/>
				)}
				{activeTab === "reminders" && deal.personCode ? (
					<RemindersPanel
						personCode={deal.personCode}
						defaults={{
							dealCode: deal.dealCode,
							entityType: "deal",
							entityId: deal.dealCode,
						}}
					/>
				) : activeTab === "reminders" ? (
					<p className="text-xs text-muted-foreground">
						This {labels.deal.singular.toLowerCase()} has no primary contact yet.
						Reminders attach to a person.
					</p>
				) : null}
			</div>
		</div>
	);
}
