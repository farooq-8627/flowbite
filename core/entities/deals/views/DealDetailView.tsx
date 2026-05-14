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
import { useParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
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
import { ViewOptionsMenu } from "@/core/entities/shared/components/ViewOptionsMenu";
import { getStatusColor } from "@/core/entities/shared/config/defaults";
import { useCustomFields } from "@/core/entities/shared/hooks/useCustomFields";
import { useModuleDisplay } from "@/core/entities/shared/hooks/useModuleDisplay";
import { useViewToggle } from "@/core/entities/shared/hooks/useViewToggle";
import type { PersonRef } from "@/core/entities/shared/types";
import {
	getHiddenCardFieldsForGrouping,
	getRevealedCardFieldForGrouping,
	NO_GROUP_KEY,
} from "@/core/entities/shared/utils/board-grouping";
import { rankBySearch, type SearchableItem } from "@/core/entities/shared/utils/search";
import type { KanbanColumnConfig } from "@/core/kanban/components/KanbanBoard";
import { useEntityLabels } from "@/core/shared/hooks/useEntityLabels";
import { useQuickAddListener } from "@/core/shell/components/QuickAddMenu";
import { useOrgPermission } from "@/features/orgs/hooks/useOrgPermission";

type DealRow = Record<string, unknown> & { id: string };

const DEAL_SEARCH_FIELDS = ["title", "dealCode", "personCode"] as const;

export function DealsView({ orgSlug }: { orgSlug: string }) {
	const labels = useEntityLabels();
	const params = useParams();
	const orgs = useQuery(api.orgs.queries.listMyOrgs);
	const orgId = orgs?.find((o) => o.org.slug === (params?.orgSlug ?? orgSlug))?.org._id;

	const [view, setView] = useViewToggle("deal");
	const { cardFields: defaultCardFields, listColumns } = useModuleDisplay("deal");
	const canViewValues = useOrgPermission(orgId, "deals.viewValues");
	const [search, setSearch] = useState("");
	const [cardFields, setCardFields] = useState<string[]>(defaultCardFields);
	const [groupBy, setGroupBy] = useState<string>("currentStageId");

	useEffect(() => {
		setCardFields(defaultCardFields);
	}, [defaultCardFields]);

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
		() => flatDeals?.map((d) => ({ ...d, id: d._id as string })),
		[flatDeals],
	);

	// Search ranking
	const rankedItems = useMemo(
		() =>
			rankBySearch(
				(items ?? []) as SearchableItem[],
				search,
				DEAL_SEARCH_FIELDS as unknown as string[],
			),
		[items, search],
	);
	const [flashEpoch, setFlashEpoch] = useState(0);
	useEffect(() => {
		if (!search) return;
		setFlashEpoch((e) => e + 1);
	}, [search]);

	// Mutations
	const moveToStage = useMutation(api.crm.entities.deals.mutations.moveToStage);
	const createDeal = useMutation(api.crm.entities.deals.mutations.create);

	const [addOpen, setAddOpen] = useState(false);

	// Global quick-add listener — "New deal" from anywhere opens the Add drawer.
	useQuickAddListener("create-deal", () => setAddOpen(true));

	// Custom fields — user-defined fields appear in ViewOptionsMenu.
	const customFields = useCustomFields("deal", orgId);

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
						cell: ({ row }) => (
							<span className="text-sm">{String(row.getValue(key) ?? "—")}</span>
						),
					});
			}
		}
		return cols;
	}, [listColumns, canViewValues, pipeline, orgId]);

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
				renderToolbarExtras={() => (
					<ViewOptionsMenu
						slot="deal"
						view={view}
						visibleFields={cardFields}
						onVisibleFieldsChange={setCardFields}
						extraFields={customFields}
						groupBy={groupBy}
						onGroupByChange={setGroupBy}
					/>
				)}
				boardColumns={boardColumns}
				itemsByColumnId={itemsByColumnId}
				renderCard={(item, isDragging) => (
					<EntityCard
						key={item.id}
						slot="deal"
						item={{ ...item, orgId }}
						cardFields={effectiveCardFields}
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
	const [title, setTitle] = useState("");
	const [value, setValue] = useState("");
	const [person, setPerson] = useState<PersonRef | null>(null);
	const [assignee, setAssignee] = useState<PersonRef | null>(null);
	const [isSubmitting, setIsSubmitting] = useState(false);

	const firstStageId = stages?.[0]?.id;
	const canSubmit = !!title.trim() && !!pipelineId && !!person;

	const handleSubmit = async () => {
		if (!orgId || !pipelineId || !firstStageId || !canSubmit || !person) return;
		setIsSubmitting(true);
		try {
			await onCreate({
				orgId,
				title: title.trim(),
				pipelineId,
				currentStageId: firstStageId,
				value: value ? Number(value) : undefined,
				assignedTo: assignee?.id as Id<"users"> | undefined,
				// Every deal is tied to a person via personCode. If the person is
				// a contact we also attach the contactId foreign key; if it's a
				// lead we only record personCode (the link becomes a proper
				// contactId when the lead is converted).
				personCode: person.personCode,
				...(person.type === "contact" ? { contactId: person.id as Id<"contacts"> } : {}),
				source: "manual",
			});
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
			<div className="flex flex-col gap-4">
				<div className="space-y-2">
					<Label htmlFor="deal-title">Title *</Label>
					<Input
						id="deal-title"
						value={title}
						onChange={(e) => setTitle(e.target.value)}
						placeholder={`${labels.deal.singular} title`}
					/>
				</div>
				<div className="space-y-2">
					<Label>
						{labels.contact.singular} or {labels.lead.singular} *
					</Label>
					<PersonSelect
						scope="person"
						value={person}
						onChange={setPerson}
						orgId={orgId}
						placeholder={`Who is this ${labels.deal.singular.toLowerCase()} for?`}
					/>
					<p className="text-[11px] text-muted-foreground">
						Every {labels.deal.singular.toLowerCase()} belongs to a{" "}
						{labels.contact.singular.toLowerCase()} or{" "}
						{labels.lead.singular.toLowerCase()}.
					</p>
				</div>
				<div className="space-y-2">
					<Label htmlFor="deal-value">Value</Label>
					<Input
						id="deal-value"
						type="number"
						value={value}
						onChange={(e) => setValue(e.target.value)}
						placeholder="0"
					/>
				</div>
				<div className="space-y-2">
					<Label>Assignee</Label>
					<PersonSelect
						scope="user"
						value={assignee}
						onChange={setAssignee}
						orgId={orgId}
						placeholder="Assign to…"
					/>
				</div>
			</div>
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
