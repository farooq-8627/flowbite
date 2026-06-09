"use client";

/**
 * DealsView — thin orchestrator for the deals kanban / list page.
 *
 * Board layout: pipeline stages → kanban columns. Drag = moveToStage.
 * List layout:  flat TanStack table scoped to the active pipeline.
 *
 * COLUMN SET — admin-driven, stage-aware:
 *   - No StageFilter → every visible deal field shows.
 *   - StageFilter active → only fields pinned to the pipeline's Default
 *     stage (the "always-on" set: dealCode, title, value, assignee, etc.,
 *     whichever the admin chose) PLUS the selected stage's own pinned
 *     fields. Anything pinned to *other* stages drops out.
 *   - `deals.viewValues` permission still gates the `value` column on
 *     top of the stage logic.
 *
 * Heavy logic lives in dedicated hooks/components:
 *   - useDealsBoard     — boardColumns, itemsByColumnId, handleCardMove
 *   - useEntityColumns  — generic table columns (cell-dispatcher + sortable headers)
 *   - AddDealDrawer     — create form (pipeline-aware, file support)
 *   - EditDealDrawer    — edit / fillStage form (file support)
 *   - FillMissingFieldsDialog — block-policy inline fill + auto-retry
 *   - DealPipelineTabs  — nav-slot pipeline tab strip
 */

import { useMutation, useQuery } from "convex/react";
import { CheckCircle2Icon, PencilIcon, PlusIcon, Trash2Icon } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { DropdownMenuItem } from "@/components/ui/dropdown-menu";
import { api } from "@/convex/_generated/api";
import type { Doc, Id } from "@/convex/_generated/dataModel";
import { AddDealDrawer } from "@/core/entities/_entities/deals/components/AddDealDrawer";
import { DealPipelineTabs } from "@/core/entities/_entities/deals/components/DealPipelineTabs";
import { EditDealDrawer } from "@/core/entities/_entities/deals/components/EditDealDrawer";
import { FillMissingFieldsDialog } from "@/core/entities/_entities/deals/components/FillMissingFieldsDialog";
import { MarkAsDoneDialog } from "@/core/entities/_entities/deals/components/MarkAsDoneDialog";
import { MarkAsLostDialog } from "@/core/entities/_entities/deals/components/MarkAsLostDialog";
import { useDealsBoard } from "@/core/entities/_entities/deals/hooks/useDealsBoard";
import { useActiveDealPipeline } from "@/core/entities/_entities/deals/hooks/usePipelines";
import { EntityListPage } from "@/core/entities/scaffolds/EntityListPage";
import {
	EntityCard,
	type EntityShortcut,
	type MenuAction,
} from "@/core/entities/shared/components/EntityCard";
import { SavedViewsMenu } from "@/core/entities/shared/components/SavedViewsMenu";
import { StageFilter } from "@/core/entities/shared/components/StageFilter";
import { ViewOptionsMenu } from "@/core/entities/shared/components/ViewOptionsMenu";
import { useEntityColumns } from "@/core/entities/shared/hooks/useEntityColumns";
import { useEntityFields } from "@/core/entities/shared/hooks/useEntityFields";
import { useEntityFieldValuesMap } from "@/core/entities/shared/hooks/useEntityFieldValuesMap";
import {
	useMoveDealToStage,
	useSoftDeleteDeal,
} from "@/core/entities/shared/hooks/useEntityMutations";
import { useEntityTagsMap } from "@/core/entities/shared/hooks/useEntityTagsMap";
import { useViewToggle } from "@/core/entities/shared/hooks/useViewToggle";
import {
	getHiddenCardFieldsForGrouping,
	getRevealedCardFieldForGrouping,
} from "@/core/entities/shared/utils/board-grouping";
import { rankBySearch, type SearchableItem } from "@/core/entities/shared/utils/search";
import type { PrimaryActionConfig } from "@/core/shell/shared/entity-layout";
import { useCurrentOrg, useOrgMembers } from "@/core/shell/shared/hooks/useCurrentOrg";
import { useEntityLabels } from "@/core/shell/shared/hooks/useEntityLabels";
import { useQuickAddListener } from "@/core/shell/shell/components/QuickAddMenu";
import { useNavSlot } from "@/core/shell/shell/context/nav-slot-context";
import { useOrgPermission } from "@/features/orgs/hooks/useOrgPermission";
import { usePersistedState } from "@/lib/hooks/use-persisted-state";
import { normalizeErrorDescription } from "@/lib/normalizeError";

type DealRow = Record<string, unknown> & { id: string };

const DEAL_SEARCH_FIELDS = ["title", "dealCode", "personCode"] as const;

export function DealsView({ orgSlug: _orgSlug }: { orgSlug: string }) {
	const labels = useEntityLabels();
	const { orgId } = useCurrentOrg();
	const [view, setView] = useViewToggle("deal");
	const { visibleFields: dealFields } = useEntityFields("deal", orgId);
	const defaultCardFields = useMemo(() => dealFields.map((f) => f.name), [dealFields]);
	const canViewValues = useOrgPermission(orgId, "deals.viewValues");
	const [search, setSearch] = useState("");
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

	const {
		dealPipelines,
		activePipeline: pipelineOrNull,
		setActivePipelineId,
	} = useActiveDealPipeline(orgId);
	const pipeline = pipelineOrNull ?? undefined;

	const grouped = useQuery(
		api.crm.entities.deals.queries.listGroupedByStage,
		orgId && pipeline?._id ? { orgId, pipelineId: pipeline._id } : "skip",
	);
	const flatDeals = useQuery(
		api.crm.entities.deals.queries.list,
		orgId && view === "list" && pipeline?._id ? { orgId, pipelineId: pipeline._id } : "skip",
	);

	const items = useMemo(() => {
		if (view === "list") {
			return flatDeals
				?.map((d) => ({ ...d, id: d._id as string }))
				.sort((a, b) => (b._creationTime ?? 0) - (a._creationTime ?? 0));
		}
		if (!grouped) return undefined;
		const flat: Array<Doc<"deals"> & { id: string; daysInStage: number; isStale: boolean }> =
			[];
		for (const stageDeals of Object.values(grouped)) {
			for (const d of stageDeals) flat.push({ ...d, id: d._id as string });
		}
		return flat.sort((a, b) => (b._creationTime ?? 0) - (a._creationTime ?? 0));
	}, [flatDeals, grouped, view]);

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

	const createDeal = useMutation(api.crm.entities.deals.mutations.create);
	const softDeleteDeal = useSoftDeleteDeal();
	const moveToStage = useMoveDealToStage();

	const [addOpen, setAddOpen] = useState(false);
	const [editingDeal, setEditingDeal] = useState<Doc<"deals"> | null>(null);
	const [editMode, setEditMode] = useState<"edit" | "fillStage">("edit");

	// FillMissingFieldsDialog state — block-policy drag
	const [fillDialog, setFillDialog] = useState<{
		deal: Doc<"deals">;
		targetStageId: string;
		targetStageName: string;
		missingFields: Array<{ name: string; label: string }>;
		sortOrder: number;
	} | null>(null);

	// Mark-as-Won + Mark-as-Lost dialog state. Triggered from:
	//  - Green tick shortcut on each card (Won)
	//  - Red dropdown / drag-to-Lost-stage (Lost — confirmation compulsory)
	const [markDoneFor, setMarkDoneFor] = useState<Doc<"deals"> | null>(null);
	const [markLostFor, setMarkLostFor] = useState<Doc<"deals"> | null>(null);
	const [pendingDelete, setPendingDelete] = useState<{ id: string; name: string } | null>(null);

	useQuickAddListener("create-deal", () => setAddOpen(true));

	const { valuesByEntityId: customValuesByEntityId } = useEntityFieldValuesMap("deal", orgId);
	const { tagsByEntityId } = useEntityTagsMap(orgId, "deal");
	const missingFieldsByDealId = useQuery(
		api.crm.entities.deals.queries.listDealsMissingFieldsByPipeline,
		orgId && pipeline?._id ? { orgId, pipelineId: pipeline._id } : "skip",
	);

	const members = useOrgMembers();
	const memberNameById = useMemo(() => {
		const map = new Map<string, string>();
		for (const m of members ?? []) {
			map.set(m.userId as string, m.user?.name ?? m.user?.email ?? (m.userId as string));
		}
		return map;
	}, [members]);

	const { boardColumns, itemsByColumnId, handleCardMove } = useDealsBoard({
		orgId,
		groupBy,
		pipeline,
		grouped,
		rankedItems: rankedItems as unknown as Parameters<typeof useDealsBoard>[0]["rankedItems"],
		memberNameById,
		onMarkLostFromDrag: ({ deal }) => setMarkLostFor(deal),
		onBlockPolicy: (data) => {
			const deal = (rankedItems.items as Array<Record<string, unknown>>).find(
				(d) => (d.id as string) === data.dealId,
			) as Doc<"deals"> | undefined;
			if (deal) {
				setFillDialog({
					deal,
					targetStageId: data.targetStageId,
					targetStageName: data.targetStageName,
					missingFields: data.missingFields,
					sortOrder: data.sortOrder,
				});
			}
		},
	});

	// Stage-aware column set:
	//   - StageFilter unset → all admin-visible deal fields show.
	//   - StageFilter active → only fields pinned to the pipeline's
	//     Default stage (the admin-curated "always-on" set) PLUS the
	//     selected stage's own pinned fields. Anything pinned to a
	//     different stage drops out of the table.
	//   - The `deals.viewValues` permission gates the value column on
	//     top of the stage logic.
	//
	// `useEntityColumns` only renders columns NOT in `hiddenColumnIds`,
	// so we collect every field name to hide here and forward the set.
	const hiddenColumnIds = useMemo(() => {
		const hidden = new Set<string>();
		if (canViewValues !== true) hidden.add("value");
		if (stageFilter && pipeline) {
			const defaultStageId = pipeline.stages.find((s) => s.isDefaultStage === true)?.id;
			for (const f of dealFields) {
				const pinned = f.showInStages ?? [];
				// Empty `showInStages` means the field is unpinned. For
				// stage-aware entities (deals) that's "not part of any
				// stage's surface area" — hide it when a stage filter is
				// active, since the user explicitly asked for "defaults
				// + this stage's fields, that's it".
				if (pinned.length === 0) {
					hidden.add(f.name);
					continue;
				}
				const showsInActive = pinned.includes(stageFilter);
				const showsInDefault = defaultStageId ? pinned.includes(defaultStageId) : false;
				if (!showsInActive && !showsInDefault) hidden.add(f.name);
			}
		}
		return hidden;
	}, [canViewValues, stageFilter, pipeline, dealFields]);

	const { columns } = useEntityColumns<DealRow>("deal", orgId, {
		customValuesByEntityId,
		tagsByEntityId,
		hiddenColumnIds,
		onDelete: async (row) => {
			if (!orgId) return;
			const candidate = (row as unknown as { title?: unknown }).title;
			const name = typeof candidate === "string" ? candidate : labels.deal.singular;
			setPendingDelete({ id: row.id as string, name });
		},
		rowExtraActions: (row) => (
			<DropdownMenuItem
				onClick={() => {
					setEditMode("edit");
					setEditingDeal(
						((rankedItems.items as Array<Record<string, unknown>>).find(
							(d) => (d.id as string) === row.id,
						) as Doc<"deals">) ?? null,
					);
				}}
			>
				<PencilIcon className="me-2 size-4" />
				Edit {labels.deal.singular.toLowerCase()}
			</DropdownMenuItem>
		),
	});

	const stageNameById = useMemo(() => {
		const map = new Map<string, string>();
		for (const s of pipeline?.stages ?? []) map.set(s.id, s.name);
		return map;
	}, [pipeline?.stages]);

	const resolveReplacementLabel = useCallback(
		(fieldName: string, raw: string): string | undefined => {
			if (fieldName === "assignedTo") return memberNameById.get(raw);
			if (fieldName === "currentStageId") return stageNameById.get(raw);
			return undefined;
		},
		[memberNameById, stageNameById],
	);

	const effectiveCardFields = useMemo(() => {
		const hidden = new Set(getHiddenCardFieldsForGrouping(groupBy));
		let next = cardFields.filter((f) => !hidden.has(f));
		const reveal = getRevealedCardFieldForGrouping(groupBy, "deal");
		if (reveal && !next.includes(reveal)) next = [reveal, ...next];
		return next;
	}, [cardFields, groupBy]);

	// Pipeline tabs in TopNav slot
	const { setSlot, clearSlot } = useNavSlot();
	useEffect(() => {
		if (!dealPipelines || dealPipelines.length <= 1) {
			clearSlot();
			return;
		}
		setSlot(
			<DealPipelineTabs
				pipelines={dealPipelines}
				activePipelineId={pipeline?._id}
				onSelect={(id) => {
					setActivePipelineId(id);
					setStageFilter(undefined);
					setSearch("");
					setActiveSavedViewId(undefined);
				}}
			/>,
		);
		return () => clearSlot();
	}, [dealPipelines, pipeline?._id, setActivePipelineId, setSlot, clearSlot]);

	const primaryAction: PrimaryActionConfig = {
		label: `Add ${labels.deal.singular}`,
		icon: PlusIcon,
		permission: "deals.create",
		onClick: () => setAddOpen(true),
	};

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
								onApply={(v) => {
									if (v === null) {
										setActiveSavedViewId(undefined);
										setStageFilter(undefined);
										return;
									}
									setActiveSavedViewId(v.id);
									setCardFields(v.columns);
									setStageFilter(
										(v.filters?.stage as string | undefined) ?? undefined,
									);
								}}
							/>
						</div>
					)
				}
				boardColumns={boardColumns}
				itemsByColumnId={itemsByColumnId}
				renderCard={(item, isDragging) => {
					const missingCount = missingFieldsByDealId?.[item.id] ?? 0;
					const hasMissing = missingCount > 0;
					const stageId = (item as Record<string, unknown>).currentStageId as
						| string
						| undefined;
					const stageName = stageId ? (stageNameById.get(stageId) ?? stageId) : "";

					// Hide Mark Won/Lost shortcuts when:
					//  - Deal is already closed (wonAt/lostAt set), OR
					//  - Card is currently rendered in a Final column (it
					//    would jump out of itself on click).
					const dealRecord = item as unknown as Doc<"deals">;
					const stageObj = stageId
						? pipeline?.stages.find((s) => s.id === stageId)
						: undefined;
					const isClosed = !!dealRecord.wonAt || !!dealRecord.lostAt;
					const showCloseShortcuts = !isClosed && !stageObj?.isFinal;

					const shortcuts: EntityShortcut[] = [
						...(hasMissing
							? [
									{
										label: `Fill "${stageName}" fields (${missingCount})`,
										icon: PlusIcon,
										onSelect: () => {
											setEditMode("fillStage");
											setEditingDeal(
												((
													rankedItems.items as Array<
														Record<string, unknown>
													>
												).find(
													(d) => (d.id as string) === item.id,
												) as Doc<"deals">) ?? null,
											);
										},
										variant: "primary" as const,
									},
								]
							: []),
						...(showCloseShortcuts
							? [
									{
										label: "Mark as won",
										icon: CheckCircle2Icon,
										onSelect: () => setMarkDoneFor(dealRecord),
										variant: "primary" as const,
									},
								]
							: []),
					];

					const menuItems: MenuAction[] = [
						{
							label: "Edit",
							icon: PencilIcon,
							onSelect: () => {
								setEditMode("edit");
								setEditingDeal(
									((rankedItems.items as Array<Record<string, unknown>>).find(
										(d) => (d.id as string) === item.id,
									) as Doc<"deals">) ?? null,
								);
							},
						},
						...(showCloseShortcuts
							? [
									{
										label: "Mark as lost",
										icon: Trash2Icon,
										variant: "destructive" as const,
										separatorBefore: true,
										onSelect: () => setMarkLostFor(dealRecord),
									},
								]
							: []),
						{
							label: "Delete",
							icon: Trash2Icon,
							variant: "destructive",
							separatorBefore: true,
							onSelect: () => {
								if (!orgId) return;
								const titleVal = (item as Record<string, unknown>).title;
								const codeVal = (item as Record<string, unknown>).dealCode;
								const name =
									typeof titleVal === "string"
										? titleVal
										: typeof codeVal === "string"
											? codeVal
											: labels.deal.singular;
								setPendingDelete({ id: item.id as string, name });
							},
						},
					];

					return (
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
							prefetchedTags={tagsByEntityId[item.id] ?? []}
							hasMissingRequiredFields={hasMissing}
							shortcuts={shortcuts}
							menuItems={menuItems}
						/>
					);
				}}
				onCardMove={handleCardMove}
				emptyTitle={`No ${labels.deal.plural.toLowerCase()} yet`}
				emptyDescription={`Create your first ${labels.deal.singular.toLowerCase()} to get started.`}
			/>

			<AddDealDrawer
				open={addOpen}
				onOpenChange={setAddOpen}
				orgId={orgId}
				pipelines={dealPipelines}
				defaultPipelineId={pipeline?._id}
				onCreate={(args) => createDeal(args as Parameters<typeof createDeal>[0])}
			/>

			<EditDealDrawer
				open={editingDeal !== null}
				onOpenChange={(v) => {
					if (!v) setEditingDeal(null);
				}}
				orgId={orgId}
				deal={editingDeal}
				mode={editMode}
			/>

			{fillDialog && (
				<FillMissingFieldsDialog
					open={true}
					onOpenChange={(v) => {
						if (!v) setFillDialog(null);
					}}
					orgId={orgId}
					deal={fillDialog.deal}
					targetStageName={fillDialog.targetStageName}
					missingFields={fillDialog.missingFields}
					onFilled={async () => {
						if (!orgId || !fillDialog) return;
						try {
							await moveToStage({
								orgId,
								dealId: fillDialog.deal._id,
								stageId: fillDialog.targetStageId,
								sortOrder: fillDialog.sortOrder,
							});
						} catch (err) {
							toast.error("Couldn't move deal after filling fields", {
								description: normalizeErrorDescription(err),
							});
						} finally {
							setFillDialog(null);
						}
					}}
				/>
			)}

			{markDoneFor && (
				<MarkAsDoneDialog
					deal={markDoneFor}
					open={true}
					onOpenChange={(v) => {
						if (!v) setMarkDoneFor(null);
					}}
				/>
			)}

			{markLostFor && (
				<MarkAsLostDialog
					deal={markLostFor}
					open={true}
					onOpenChange={(v) => {
						if (!v) setMarkLostFor(null);
					}}
					onMarked={() => setMarkLostFor(null)}
				/>
			)}

			<ConfirmDialog
				open={pendingDelete !== null}
				onOpenChange={(v) => {
					if (!v) setPendingDelete(null);
				}}
				title={`Delete "${pendingDelete?.name ?? ""}"?`}
				description={`The ${labels.deal.singular.toLowerCase()} will be moved to trash. Owners can restore it from Settings → Data → Trash within the retention window.`}
				confirmLabel={`Delete ${labels.deal.singular.toLowerCase()}`}
				busyLabel="Deleting…"
				confirmVariant="destructive"
				onConfirm={async () => {
					if (!pendingDelete || !orgId) return;
					try {
						await softDeleteDeal({
							orgId,
							dealId: pendingDelete.id as Id<"deals">,
						});
						toast.success(`${labels.deal.singular} moved to trash`);
						setPendingDelete(null);
					} catch (err) {
						toast.error(`Couldn't delete ${labels.deal.singular.toLowerCase()}`, {
							description: normalizeErrorDescription(err),
						});
						throw err;
					}
				}}
			/>
		</>
	);
}
