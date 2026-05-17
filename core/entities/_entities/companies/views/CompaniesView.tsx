"use client";

/**
 * CompaniesView — list + board view for companies.
 *
 * - Board grouped by industry (default). Fallback "Uncategorized" for null.
 * - Primary action: Add Company.
 * - Add drawer now includes a multi-user "Team members" picker so admins can
 *   record who on their side works with the company.
 * - Toolbar search with rank-to-top + flash highlight on matches.
 */

import type { ColumnDef } from "@tanstack/react-table";
import { useMutation, useQuery } from "convex/react";
import { formatDistanceToNow } from "date-fns";
import { PencilIcon, PlusIcon } from "lucide-react";
import { useParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { DropdownMenuItem } from "@/components/ui/dropdown-menu";
import { FirstTimeTour } from "@/components/ui/first-time-tour";
import { api } from "@/convex/_generated/api";
import type { Doc, Id } from "@/convex/_generated/dataModel";
import { DataTableRowActions } from "@/core/data-display/datatable/components/DataTableRowActions";
import type { KanbanColumnConfig } from "@/core/data-display/kanban/components/KanbanBoard";
import { usePersistedColumnOrder } from "@/core/data-display/kanban/hooks/usePersistedColumnOrder";
import { CompanyDrawer } from "@/core/entities/_entities/companies/components/CompanyDrawer";
import { EntityListPage } from "@/core/entities/scaffolds/EntityListPage";
import { AssigneeCell } from "@/core/entities/shared/components/AssigneeCell";
import { EntityCard } from "@/core/entities/shared/components/EntityCard";
import { ViewOptionsMenu } from "@/core/entities/shared/components/ViewOptionsMenu";
import { getStatusColor } from "@/core/entities/shared/config/defaults";
import { useEntityFields } from "@/core/entities/shared/hooks/useEntityFields";
import { useEntityFieldValuesMap } from "@/core/entities/shared/hooks/useEntityFieldValuesMap";
import { useViewToggle } from "@/core/entities/shared/hooks/useViewToggle";
import { buildEntityBoardTour } from "@/core/entities/shared/tours";
import {
	getHiddenCardFieldsForGrouping,
	getRevealedCardFieldForGrouping,
	NO_GROUP_KEY,
} from "@/core/entities/shared/utils/board-grouping";
import { rankBySearch, type SearchableItem } from "@/core/entities/shared/utils/search";
import type { PrimaryActionConfig } from "@/core/shell/shared/entity-layout";
import { useEntityLabels } from "@/core/shell/shared/hooks/useEntityLabels";
import { useQuickAddListener } from "@/core/shell/shell/components/QuickAddMenu";
import { usePersistedState } from "@/lib/hooks/use-persisted-state";

type CompanyRow = Record<string, unknown> & { id: string };

const COMPANY_SEARCH_FIELDS = ["name", "companyCode", "industry", "website"] as const;

export function CompaniesView({ orgSlug }: { orgSlug: string }) {
	const labels = useEntityLabels();
	const params = useParams();
	const orgs = useQuery(api.orgs.queries.listMyOrgs);
	const orgId = orgs?.find((o) => o.org.slug === (params?.orgSlug ?? orgSlug))?.org._id;

	const companies = useQuery(api.crm.entities.companies.queries.list, orgId ? { orgId } : "skip");
	const items = useMemo(
		() =>
			companies
				?.map((c) => ({ ...c, id: c._id as string }))
				.sort((a, b) => (b._creationTime ?? 0) - (a._creationTime ?? 0)),
		[companies],
	);

	const [view, setView] = useViewToggle("company");
	const { visibleFields: companyFields } = useEntityFields("company", orgId);
	const defaultCardFields = useMemo(() => companyFields.map((f) => f.name), [companyFields]);
	const listColumns = defaultCardFields;
	const _createCompany = useMutation(api.crm.entities.companies.mutations.create);
	const deleteCompany = useMutation(api.crm.entities.companies.mutations.softDelete);

	const [addOpen, setAddOpen] = useState(false);
	const [editOpen, setEditOpen] = useState(false);
	const [editingCompany, setEditingCompany] = useState<Doc<"companies"> | null>(null);
	const [search, setSearch] = useState("");
	// Per-session view options — persisted to localStorage so they survive
	// route changes and reloads. Stale entries that point at admin-hidden
	// fields are filtered out by the EntityCard before render.
	const [cardFields, setCardFields] = usePersistedState<string[]>(
		"viewopts:company:cardFields",
		[],
	);
	const [groupBy, setGroupBy] = usePersistedState<string>("viewopts:company:groupBy", "industry");

	// Seed cardFields from the canonical visible-fields list on first load,
	// then prune any stale entries that point at admin-hidden fields.
	useEffect(() => {
		setCardFields((prev) => {
			if (!prev || prev.length === 0) return defaultCardFields;
			const allowed = new Set(defaultCardFields);
			const next = prev.filter((f) => allowed.has(f));
			return next.length === prev.length ? prev : next;
		});
	}, [defaultCardFields, setCardFields]);

	// Global quick-add listener — "New company" from anywhere opens Add drawer.
	useQuickAddListener("create-company", () => setAddOpen(true));

	const { valuesByEntityId: customValuesByEntityId } = useEntityFieldValuesMap("company", orgId);

	// Members lookup for assignee grouping labels
	const members = useQuery(api.orgs.queries.listMembers, orgId ? { orgId } : "skip");
	const memberNameById = useMemo(() => {
		const map = new Map<string, string>();
		for (const m of members ?? []) {
			map.set(m.userId as string, m.user?.name ?? m.user?.email ?? (m.userId as string));
		}
		return map;
	}, [members]);

	// Search ranking
	const rankedItems = useMemo(
		() =>
			rankBySearch(
				(items ?? []) as SearchableItem[],
				search,
				COMPANY_SEARCH_FIELDS as unknown as string[],
			),
		[items, search],
	);
	const [flashEpoch, setFlashEpoch] = useState(0);
	useEffect(() => {
		if (!search) return;
		setFlashEpoch((e) => e + 1);
	}, [search]);

	// Board columns — derive from grouping choice
	const boardColumns: KanbanColumnConfig[] = useMemo(() => {
		if (groupBy === "industry") {
			if (!rankedItems.items.length)
				return [
					{
						id: "uncategorized",
						title: "Uncategorized",
						color: getStatusColor("company", "uncategorized"),
					},
				];
			const industries = new Set<string>();
			for (const item of rankedItems.items) {
				const ind = (item as Record<string, unknown>).industry as string | undefined;
				industries.add(ind ?? "uncategorized");
			}
			if (industries.size === 0) industries.add("uncategorized");
			return Array.from(industries).map((ind) => ({
				id: ind,
				title:
					ind === "uncategorized"
						? "Uncategorized"
						: ind.charAt(0).toUpperCase() + ind.slice(1),
				color: getStatusColor("company", ind),
			}));
		}
		if (groupBy === "assignedTo") {
			const assignees = new Set<string>();
			for (const it of rankedItems.items) {
				const a = (it as Record<string, unknown>).assignedTo as string | undefined;
				assignees.add(a ? String(a) : NO_GROUP_KEY);
			}
			return Array.from(assignees).map((a) => ({
				id: a,
				title: a === NO_GROUP_KEY ? "Unassigned" : (memberNameById.get(a) ?? a),
				color: getStatusColor("company", "uncategorized"),
			}));
		}
		// Generic fallback
		const values = new Set<string>();
		for (const it of rankedItems.items) {
			const raw = (it as Record<string, unknown>)[groupBy];
			values.add(raw ? String(raw) : NO_GROUP_KEY);
		}
		return Array.from(values).map((v) => ({
			id: v,
			title: v === NO_GROUP_KEY ? "—" : v,
			color: getStatusColor("company", v),
		}));
	}, [groupBy, rankedItems.items, memberNameById]);

	// Per-user persisted column order. Survives reloads.
	const { orderedColumns: boardColumnsOrdered, onColumnReorder } = usePersistedColumnOrder(
		`company:${groupBy}`,
		boardColumns,
	);

	const itemsByColumnId = useMemo(() => {
		const grouped: Record<string, typeof rankedItems.items> = {};
		for (const col of boardColumns) grouped[col.id] = [];
		for (const item of rankedItems.items) {
			const raw = (item as Record<string, unknown>)[groupBy];
			const fallback = groupBy === "industry" ? "uncategorized" : NO_GROUP_KEY;
			const key = raw ? String(raw) : fallback;
			if (!grouped[key]) grouped[key] = [];
			grouped[key].push(item);
		}
		return grouped;
	}, [rankedItems.items, boardColumns, groupBy]);

	// List columns
	const columns: ColumnDef<CompanyRow, unknown>[] = useMemo(() => {
		const cols: ColumnDef<CompanyRow, unknown>[] = [
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
				case "companyCode":
					cols.push({
						accessorKey: "companyCode",
						header: "Code",
						cell: ({ row }) => (
							<Badge variant="outline" className="font-mono text-xs">
								{row.getValue("companyCode") as string}
							</Badge>
						),
						size: 100,
					});
					break;
				case "name":
					cols.push({
						accessorKey: "name",
						header: "Name",
						cell: ({ row }) => (
							<span className="font-medium">{row.getValue("name") as string}</span>
						),
					});
					break;
				case "industry":
					cols.push({
						accessorKey: "industry",
						header: "Industry",
						cell: ({ row }) => (
							<Badge variant="secondary" className="capitalize text-xs">
								{(row.getValue("industry") as string) ?? "—"}
							</Badge>
						),
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
				case "contactCount":
					cols.push({
						accessorKey: "contactCount",
						header: "Contacts",
						cell: ({ row }) => (
							<span className="tabular-nums text-sm">
								{String(row.getValue("contactCount") ?? "0")}
							</span>
						),
					});
					break;
				case "openDealCount":
					cols.push({
						accessorKey: "openDealCount",
						header: "Open Deals",
						cell: ({ row }) => (
							<span className="tabular-nums text-sm">
								{String(row.getValue("openDealCount") ?? "0")}
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
						cell: ({ row }) => {
							const direct = row.getValue(key);
							if (direct !== undefined && direct !== null && direct !== "") {
								return <span className="text-sm">{String(direct)}</span>;
							}
							const r = row.original as CompanyRow;
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
		// Row actions — Edit + Delete
		cols.push({
			id: "actions",
			enableSorting: false,
			enableHiding: false,
			size: 44,
			cell: ({ row }) => {
				const company = row.original as unknown as Doc<"companies">;
				return (
					// biome-ignore lint/a11y/noStaticElementInteractions: event-stop wrapper isolates the dots menu from row click
					<div
						className="flex justify-end"
						onClick={(e) => e.stopPropagation()}
						onKeyDown={(e) => e.stopPropagation()}
					>
						<DataTableRowActions
							row={row}
							extraItems={
								<DropdownMenuItem
									onClick={() => {
										setEditingCompany(company);
										setEditOpen(true);
									}}
								>
									<PencilIcon className="me-2 size-4" />
									Edit {labels.company.singular.toLowerCase()}
								</DropdownMenuItem>
							}
							onDelete={async () => {
								if (!orgId) return;
								try {
									await deleteCompany({
										orgId,
										companyId: company._id as Id<"companies">,
									});
									toast.success(`${labels.company.singular} deleted`);
								} catch (err) {
									toast.error(
										err instanceof Error ? err.message : "Couldn't delete",
									);
								}
							}}
						/>
					</div>
				);
			},
		});
		return cols;
	}, [listColumns, orgId, deleteCompany, labels.company.singular, customValuesByEntityId]);

	const primaryAction: PrimaryActionConfig = {
		label: `Add ${labels.company.singular}`,
		icon: PlusIcon,
		permission: "companies.create",
		onClick: () => setAddOpen(true),
	};

	// Hide grouped-by field + reveal complementary
	const effectiveCardFields = useMemo(() => {
		const hidden = new Set(getHiddenCardFieldsForGrouping(groupBy));
		let next = cardFields.filter((f) => !hidden.has(f));
		const reveal = getRevealedCardFieldForGrouping(groupBy, "company");
		if (reveal && !next.includes(reveal)) next = [reveal, ...next];
		return next;
	}, [cardFields, groupBy]);

	return (
		<>
			<EntityListPage
				slot="company"
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
					placeholder: `Search ${labels.company.plural.toLowerCase()}…`,
				}}
				renderToolbarExtras={() =>
					view === "board" ? (
						<ViewOptionsMenu
							slot="company"
							orgId={orgId}
							view={view}
							visibleFields={cardFields}
							onVisibleFieldsChange={setCardFields}
							groupBy={groupBy}
							onGroupByChange={setGroupBy}
						/>
					) : null
				}
				boardColumns={boardColumnsOrdered}
				itemsByColumnId={itemsByColumnId}
				renderCard={(item, isDragging) => (
					<EntityCard
						key={item.id}
						slot="company"
						item={{ ...item, orgId }}
						cardFields={effectiveCardFields}
						customFieldValues={customValuesByEntityId[item.id]}
						isDragging={isDragging}
						isHighlighted={search ? rankedItems.matchedIds.has(item.id) : false}
						highlightEpoch={flashEpoch}
					/>
				)}
				onCardMove={async () => {}}
				onColumnReorder={onColumnReorder}
				emptyTitle={`No ${labels.company.plural.toLowerCase()} yet`}
				emptyDescription={`Add your first ${labels.company.singular.toLowerCase()} to get started.`}
			/>

			<CompanyDrawer open={addOpen} onOpenChange={setAddOpen} orgId={orgId} mode="add" />
			<CompanyDrawer
				open={editOpen}
				onOpenChange={(v) => {
					setEditOpen(v);
					if (!v) setEditingCompany(null);
				}}
				orgId={orgId}
				mode="edit"
				company={editingCompany}
			/>

			{/* First-time coachmarks for the companies board. Fires once per device. */}
			{view === "board" && (
				<FirstTimeTour
					id="companies-board-v2"
					steps={buildEntityBoardTour({
						primaryActionVerb: "Edit",
						groupedBy: "industry",
					})}
				/>
			)}
		</>
	);
}

export function CompanyDetailView({ orgSlug, companyId }: { orgSlug: string; companyId: string }) {
	const labels = useEntityLabels();
	return (
		<div
			data-org={orgSlug}
			data-id={companyId}
			data-entity="company"
			className="flex h-full items-center justify-center text-sm text-muted-foreground"
		>
			{labels.company.singular} detail — coming in Slice 2
		</div>
	);
}
