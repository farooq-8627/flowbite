"use client";

/**
 * CompaniesView — list + board view for companies.
 * Board grouped by industry (default). Fallback "Uncategorized" for null industry.
 * Primary action: Add Company.
 */

import type { ColumnDef } from "@tanstack/react-table";
import { useMutation, useQuery } from "convex/react";
import { formatDistanceToNow } from "date-fns";
import { PlusIcon } from "lucide-react";
import { useParams } from "next/navigation";
import { useMemo, useState } from "react";
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

type CompanyRow = Record<string, unknown> & { id: string };

export function CompaniesView({ orgSlug }: { orgSlug: string }) {
	const labels = useEntityLabels();
	const params = useParams();
	const orgs = useQuery(api.orgs.queries.listMyOrgs);
	const orgId = orgs?.find((o) => o.org.slug === (params?.orgSlug ?? orgSlug))?.org._id;

	const companies = useQuery(api.crm.entities.companies.queries.list, orgId ? { orgId } : "skip");
	const items = useMemo(
		() => companies?.map((c) => ({ ...c, id: c._id as string })),
		[companies],
	);

	const [view, setView] = useViewToggle("company");
	const { cardFields, listColumns } = useModuleDisplay("company");
	const createCompany = useMutation(api.crm.entities.companies.mutations.create);

	const [addOpen, setAddOpen] = useState(false);

	// Board columns — derive from unique industries
	const boardColumns: KanbanColumnConfig[] = useMemo(() => {
		if (!items) return [{ id: "uncategorized", title: "Uncategorized" }];
		const industries = new Set<string>();
		for (const item of items) {
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
		}));
	}, [items]);

	const itemsByColumnId = useMemo(() => {
		if (!items) return {};
		const grouped: Record<string, typeof items> = {};
		for (const col of boardColumns) grouped[col.id] = [];
		for (const item of items) {
			const key = ((item as Record<string, unknown>).industry as string) ?? "uncategorized";
			if (!grouped[key]) grouped[key] = [];
			grouped[key].push(item);
		}
		return grouped;
	}, [items, boardColumns]);

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
							<span className="text-sm">
								{(row.getValue("assignedTo") as string) ?? "Unassigned"}
							</span>
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
						cell: ({ row }) => (
							<span className="text-sm">{String(row.getValue(key) ?? "—")}</span>
						),
					});
			}
		}
		return cols;
	}, [listColumns]);

	const primaryAction: PrimaryActionConfig = {
		label: `Add ${labels.company.singular}`,
		icon: PlusIcon,
		permission: "companies.create",
		onClick: () => setAddOpen(true),
	};

	return (
		<>
			<EntityListPage
				slot="company"
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
						slot="company"
						item={{ ...item, orgId }}
						cardFields={cardFields}
						isDragging={isDragging}
					/>
				)}
				onCardMove={async () => {}}
				emptyTitle={`No ${labels.company.plural.toLowerCase()} yet`}
				emptyDescription={`Add your first ${labels.company.singular.toLowerCase()} to get started.`}
			/>

			<AddCompanyDrawer
				open={addOpen}
				onOpenChange={setAddOpen}
				orgId={orgId}
				onCreate={(args) => createCompany(args as Parameters<typeof createCompany>[0])}
			/>
		</>
	);
}

// ─── AddCompanyDrawer ─────────────────────────────────────────────────────────

function AddCompanyDrawer({
	open,
	onOpenChange,
	orgId,
	onCreate,
}: {
	open: boolean;
	onOpenChange: (v: boolean) => void;
	orgId: Id<"orgs"> | undefined;
	onCreate: (args: Record<string, unknown>) => Promise<unknown>;
}) {
	const labels = useEntityLabels();
	const [name, setName] = useState("");
	const [industry, setIndustry] = useState("");
	const [website, setWebsite] = useState("");
	const [assignee, setAssignee] = useState<PersonRef | null>(null);
	const [isSubmitting, setIsSubmitting] = useState(false);

	const handleSubmit = async () => {
		if (!orgId || !name.trim()) return;
		setIsSubmitting(true);
		try {
			await onCreate({
				orgId,
				name: name.trim(),
				industry: industry.trim() || undefined,
				website: website.trim() || undefined,
				assignedTo: assignee?.id as Id<"users"> | undefined,
			});
			toast.success(`${labels.company.singular} created`);
			setName("");
			setIndustry("");
			setWebsite("");
			setAssignee(null);
			onOpenChange(false);
		} catch {
			toast.error("Failed to create company");
		} finally {
			setIsSubmitting(false);
		}
	};

	return (
		<FormDrawer
			open={open}
			onOpenChange={onOpenChange}
			title={`Add ${labels.company.singular}`}
			onSubmit={handleSubmit}
			isSubmitting={isSubmitting}
			submitLabel="Create"
			submitDisabled={!name.trim()}
		>
			<div className="flex flex-col gap-4">
				<div className="space-y-2">
					<Label htmlFor="company-name">Name *</Label>
					<Input
						id="company-name"
						value={name}
						onChange={(e) => setName(e.target.value)}
						placeholder={`${labels.company.singular} name`}
					/>
				</div>
				<div className="space-y-2">
					<Label htmlFor="company-industry">Industry</Label>
					<Input
						id="company-industry"
						value={industry}
						onChange={(e) => setIndustry(e.target.value)}
						placeholder="e.g. Technology, Real Estate"
					/>
				</div>
				<div className="space-y-2">
					<Label htmlFor="company-website">Website</Label>
					<Input
						id="company-website"
						value={website}
						onChange={(e) => setWebsite(e.target.value)}
						placeholder="https://…"
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
