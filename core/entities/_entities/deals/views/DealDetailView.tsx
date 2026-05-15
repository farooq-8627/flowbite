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
import { EntityListPage } from "@/core/entities/scaffolds/EntityListPage";
import type { PrimaryActionConfig } from "@/core/entities/scaffolds/EntityPageLayout";
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
import { useViewToggle } from "@/core/entities/shared/hooks/useViewToggle";
import { buildEntityBoardTour } from "@/core/entities/shared/tours";
import type { PersonRef } from "@/core/entities/shared/types";
import {
	getHiddenCardFieldsForGrouping,
	getRevealedCardFieldForGrouping,
	NO_GROUP_KEY,
} from "@/core/entities/shared/utils/board-grouping";
import { rankBySearch, type SearchableItem } from "@/core/entities/shared/utils/search";
import {
	CreateModeFileField,
	FileBufferProvider,
	useFileBuffer,
} from "@/core/files/components/CreateModeFileField";
import type { KanbanColumnConfig } from "@/core/kanban/components/KanbanBoard";
import { useEntityLabels } from "@/core/shared/hooks/useEntityLabels";
import { useQuickAddListener } from "@/core/shell/components/QuickAddMenu";
import { useOrgPermission } from "@/features/orgs/hooks/useOrgPermission";
import { usePersistedState } from "@/lib/hooks/use-persisted-state";

type DealRow = Record<string, unknown> & { id: string };

const DEAL_SEARCH_FIELDS = ["title", "dealCode", "personCode"] as const;

export function DealsView({ orgSlug }: { orgSlug: string }) {
	const labels = useEntityLabels();
	const params = useParams();
	const orgs = useQuery(api.orgs.queries.listMyOrgs);
	const orgId = orgs?.find((o) => o.org.slug === (params?.orgSlug ?? orgSlug))?.org._id;

	const [view, setView] = useViewToggle("deal");
	const { visibleFields: dealFields } = useEntityFields("deal", orgId);
	const defaultCardFields = useMemo(() => dealFields.map((f) => f.name), [dealFields]);
	const listColumns = defaultCardFields;
	const canViewValues = useOrgPermission(orgId, "deals.viewValues");
	const [search, setSearch] = useState("");
	// Persisted view options — survive route changes / reloads.
	const [cardFields, setCardFields] = usePersistedState<string[]>("viewopts:deal:cardFields", []);
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

	// Flat list (for list view)
	const flatDeals = useQuery(api.crm.entities.deals.queries.list, orgId ? { orgId } : "skip");
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

	// Mutations.
	// `moveToStage` carries an optimistic update — the kanban card visually
	// moves the moment the user releases the drag, then reconciles with the
	// server response. Adds the "feels instant" UX without round-trip lag.
	const moveToStage = useMutation(
		api.crm.entities.deals.mutations.moveToStage,
	).withOptimisticUpdate((store, args) => {
		const list = store.getQuery(api.crm.entities.deals.queries.list, { orgId: args.orgId });
		if (!list) return;
		const now = Date.now();
		const next = list.map((d) =>
			d._id === args.dealId
				? { ...d, currentStageId: args.stageId, stageEnteredAt: now, updatedAt: now }
				: d,
		);
		store.setQuery(api.crm.entities.deals.queries.list, { orgId: args.orgId }, next);
	});
	const createDeal = useMutation(api.crm.entities.deals.mutations.create);

	const [addOpen, setAddOpen] = useState(false);

	// Global quick-add listener — "New deal" from anywhere opens the Add drawer.
	useQuickAddListener("create-deal", () => setAddOpen(true));

	const { valuesByEntityId: customValuesByEntityId } = useEntityFieldValuesMap("deal", orgId);

	// Board columns — pipeline stages (when grouping by currentStageId) or
	// generic buckets (when grouping by any other field).
	const members = useQuery(api.orgs.queries.listMembers, orgId ? { orgId } : "skip");
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
	const itemsByColumnId = useMemo(() => {
		const ranked = new Set(rankedItems.matchedIds);

		if (groupBy === "currentStageId") {
			if (!grouped) return {};
			const result: Record<string, DealRow[]> = {};
			for (const [stageId, deals] of Object.entries(grouped)) {
				const rows = (deals as Array<Record<string, unknown>>).map((d) => ({
					...d,
					id: (d._id ?? d.id) as string,
				})) as DealRow[];
				if (!search) {
					result[stageId] = rows;
					continue;
				}
				result[stageId] = [...rows].sort((a, b) => {
					const ma = ranked.has(a.id) ? 1 : 0;
					const mb = ranked.has(b.id) ? 1 : 0;
					return mb - ma;
				});
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
		return result;
	}, [groupBy, grouped, rankedItems.matchedIds, rankedItems.items, search, boardColumns]);

	// Handle card move (drag-drop) — updates the active `groupBy` field.
	const updateDeal = useMutation(api.crm.entities.deals.mutations.update);
	const handleCardMove = useCallback(
		async (itemId: string, _fromColumnId: string, toColumnId: string) => {
			if (!orgId) return;
			try {
				if (groupBy === "currentStageId") {
					await moveToStage({
						orgId,
						dealId: itemId as Id<"deals">,
						stageId: toColumnId,
					});
					const toStage = pipeline?.stages.find((s) => s.id === toColumnId);
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
						assignedTo:
							toColumnId === NO_GROUP_KEY ? undefined : (toColumnId as Id<"users">),
					});
					return;
				}
				// Unknown/custom groupBy — no-op.
			} catch (err) {
				toast.error(`Couldn't move ${labels.deal.singular.toLowerCase()}`, {
					description: err instanceof Error ? err.message : undefined,
				});
			}
		},
		[orgId, moveToStage, updateDeal, pipeline, labels.deal.singular, groupBy],
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
	return (
		<div
			data-org={orgSlug}
			data-id={dealId}
			data-entity="deal"
			className="flex h-full items-center justify-center text-sm text-muted-foreground"
		>
			{labels.deal.singular} detail — coming in Slice 2
		</div>
	);
}
