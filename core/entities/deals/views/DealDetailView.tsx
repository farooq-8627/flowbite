"use client";

/**
 * DealsView — kanban primary (D8), list secondary.
 * Pipeline stages → board columns. moveToStage on drag. closeAsDone + confetti on won.
 * Deal value hidden from member role via deals.viewValues permission.
 */

import type { ColumnDef } from "@tanstack/react-table";
import { useMutation, useQuery } from "convex/react";
import { formatDistanceToNow } from "date-fns";
import { PlusIcon } from "lucide-react";
import { useParams } from "next/navigation";
import { useCallback, useMemo, useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { EntityListPage } from "@/core/entities/scaffolds/EntityListPage";
import type { PrimaryActionConfig } from "@/core/entities/scaffolds/EntityPageLayout";
import { EntityCard } from "@/core/entities/shared/components/EntityCard";
import { FormDrawer } from "@/core/entities/shared/components/FormDrawer";
import { PersonSelect } from "@/core/entities/shared/components/PersonSelect";
import { useModuleDisplay } from "@/core/entities/shared/hooks/useModuleDisplay";
import { useViewToggle } from "@/core/entities/shared/hooks/useViewToggle";
import type { PersonRef } from "@/core/entities/shared/types";
import type { KanbanColumnConfig } from "@/core/kanban/components/KanbanBoard";
import { useEntityLabels } from "@/core/shared/hooks/useEntityLabels";
import { useOrgPermission } from "@/features/orgs/hooks/useOrgPermission";

type DealRow = Record<string, unknown> & { id: string };

export function DealsView({ orgSlug }: { orgSlug: string }) {
	const labels = useEntityLabels();
	const params = useParams();
	const orgs = useQuery(api.orgs.queries.listMyOrgs);
	const orgId = orgs?.find((o) => o.org.slug === (params?.orgSlug ?? orgSlug))?.org._id;

	const [view, setView] = useViewToggle("deal");
	const { cardFields, listColumns } = useModuleDisplay("deal");
	const canViewValues = useOrgPermission(orgId, "deals.viewValues");

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

	// Mutations
	const moveToStage = useMutation(api.crm.entities.deals.mutations.moveToStage);
	const createDeal = useMutation(api.crm.entities.deals.mutations.create);

	const [addOpen, setAddOpen] = useState(false);

	// Board columns from pipeline stages
	const boardColumns: KanbanColumnConfig[] = useMemo(() => {
		if (!pipeline?.stages) return [];
		return pipeline.stages.map((s) => ({
			id: s.id,
			title: s.name,
			color: s.color,
			isFinal: s.isFinal,
			finalType: s.finalType,
		}));
	}, [pipeline]);

	// Items by column for board
	const itemsByColumnId = useMemo(() => {
		if (!grouped) return {};
		const result: Record<string, DealRow[]> = {};
		for (const [stageId, deals] of Object.entries(grouped)) {
			result[stageId] = (deals as Array<Record<string, unknown>>).map((d) => ({
				...d,
				id: (d._id ?? d.id) as string,
			})) as DealRow[];
		}
		return result;
	}, [grouped]);

	// Handle card move (drag-drop)
	const handleCardMove = useCallback(
		async (itemId: string, _fromColumnId: string, toColumnId: string) => {
			if (!orgId) return;
			await moveToStage({ orgId, dealId: itemId as Id<"deals">, stageId: toColumnId });

			// Check if moved to a positive final stage → confetti
			const toStage = pipeline?.stages.find((s) => s.id === toColumnId);
			if (toStage?.isFinal && toStage.finalType === "positive") {
				toast.success("🎉 Deal won!");
				// Dynamic import confetti to avoid bundle bloat
				import("canvas-confetti")
					.then((mod) => mod.default({ particleCount: 100, spread: 70 }))
					.catch(() => {});
			}
		},
		[orgId, moveToStage, pipeline],
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
							<span className="text-sm">
								{(row.getValue("assignedTo") as string) ?? "Unassigned"}
							</span>
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
	}, [listColumns, canViewValues, pipeline]);

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
				items={items}
				columns={columns}
				views={["list", "board"]}
				view={view}
				onViewChange={setView}
				primaryAction={primaryAction}
				orgId={orgId}
				boardColumns={boardColumns}
				itemsByColumnId={itemsByColumnId}
				renderCard={(item, isDragging) => (
					<EntityCard
						key={item.id}
						slot="deal"
						item={{ ...item, orgId }}
						cardFields={cardFields}
						isDragging={isDragging}
						currencyCode={
							((item as Record<string, unknown>).currency as string) ?? "USD"
						}
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
	const [assignee, setAssignee] = useState<PersonRef | null>(null);
	const [isSubmitting, setIsSubmitting] = useState(false);

	const firstStageId = stages?.[0]?.id;

	const handleSubmit = async () => {
		if (!orgId || !pipelineId || !firstStageId || !title.trim()) return;
		setIsSubmitting(true);
		try {
			await onCreate({
				orgId,
				title: title.trim(),
				pipelineId,
				currentStageId: firstStageId,
				value: value ? Number(value) : undefined,
				assignedTo: assignee?.id as Id<"users"> | undefined,
				source: "manual",
			});
			toast.success(`${labels.deal.singular} created`);
			setTitle("");
			setValue("");
			setAssignee(null);
			onOpenChange(false);
		} catch {
			toast.error("Failed to create deal");
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
			submitDisabled={!title.trim() || !pipelineId}
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
