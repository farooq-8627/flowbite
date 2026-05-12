"use client";

/**
 * ContactsView — full scaffold-driven contacts list + board view.
 * Primary action: Convert Lead (D4 — contacts born via conversion only).
 * Hidden if user lacks `leads.convert` permission (Q-v3.2 option A).
 */

import type { ColumnDef } from "@tanstack/react-table";
import { useQuery } from "convex/react";
import { formatDistanceToNow } from "date-fns";
import { ArrowRightCircleIcon } from "lucide-react";
import { useParams } from "next/navigation";
import { useMemo, useState } from "react";
import { Checkbox } from "@/components/ui/checkbox";
import { api } from "@/convex/_generated/api";
import { ConvertLeadDrawer } from "@/core/entities/leads/components/ConvertLeadDrawer";
import { useLeadMutations } from "@/core/entities/leads/hooks/useLeadMutations";
import { EntityListPage } from "@/core/entities/scaffolds/EntityListPage";
import type { PrimaryActionConfig } from "@/core/entities/scaffolds/EntityPageLayout";
import { EntityCard } from "@/core/entities/shared/components/EntityCard";
import { useModuleDisplay } from "@/core/entities/shared/hooks/useModuleDisplay";
import { useViewToggle } from "@/core/entities/shared/hooks/useViewToggle";
import { PersonCodeBadge } from "@/core/entities/shared/PersonCodeBadge";
import type { KanbanColumnConfig } from "@/core/kanban/components/KanbanBoard";
import { useEntityLabels } from "@/core/shared/hooks/useEntityLabels";
import { useOrgPermission } from "@/features/orgs/hooks/useOrgPermission";

type ContactRow = Record<string, unknown> & { id: string };

export function ContactsView({ orgSlug }: { orgSlug: string }) {
	const labels = useEntityLabels();
	const params = useParams();
	const orgs = useQuery(api.orgs.queries.listMyOrgs);
	const orgId = orgs?.find((o) => o.org.slug === (params?.orgSlug ?? orgSlug))?.org._id;

	const contacts = useQuery(api.crm.entities.contacts.queries.list, orgId ? { orgId } : "skip");
	const items = useMemo(() => contacts?.map((c) => ({ ...c, id: c._id as string })), [contacts]);

	const [view, setView] = useViewToggle("contact");
	const { cardFields, listColumns } = useModuleDisplay("contact");
	const { convert } = useLeadMutations(orgId);
	const canConvert = useOrgPermission(orgId, "leads.convert");

	const [convertOpen, setConvertOpen] = useState(false);

	// Columns
	const columns: ColumnDef<ContactRow, unknown>[] = useMemo(() => {
		const cols: ColumnDef<ContactRow, unknown>[] = [
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
				case "personCode":
					cols.push({
						accessorKey: "personCode",
						header: "Code",
						cell: ({ row }) => (
							<PersonCodeBadge personCode={row.getValue("personCode") as string} />
						),
						size: 100,
					});
					break;
				case "displayName":
					cols.push({
						accessorKey: "displayName",
						header: "Name",
						cell: ({ row }) => (
							<span className="font-medium">
								{row.getValue("displayName") as string}
							</span>
						),
					});
					break;
				case "email":
					cols.push({
						accessorKey: "email",
						header: "Email",
						cell: ({ row }) => (
							<span className="text-sm text-muted-foreground">
								{(row.getValue("email") as string) ?? "—"}
							</span>
						),
					});
					break;
				case "companyId":
					cols.push({
						accessorKey: "companyId",
						header: "Company",
						cell: ({ row }) => (
							<span className="text-sm">
								{(row.getValue("companyId") as string) ?? "—"}
							</span>
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

	// Board — grouped by assignedTo (default)
	const boardColumns: KanbanColumnConfig[] = useMemo(
		() => [
			{ id: "unassigned", title: "Unassigned" },
			{ id: "assigned", title: "Assigned" },
		],
		[],
	);

	const itemsByColumnId = useMemo(() => {
		if (!items) return {};
		const grouped: Record<string, typeof items> = { unassigned: [], assigned: [] };
		for (const item of items) {
			if (item.assignedTo) grouped.assigned.push(item);
			else grouped.unassigned.push(item);
		}
		return grouped;
	}, [items]);

	// Primary action — Convert Lead (hidden if no permission, per Q-v3.2 option A)
	const primaryAction: PrimaryActionConfig | undefined =
		canConvert === true
			? {
					label: `Convert ${labels.lead.singular}`,
					icon: ArrowRightCircleIcon,
					permission: "leads.convert",
					onClick: () => setConvertOpen(true),
				}
			: undefined;

	return (
		<>
			<EntityListPage
				slot="contact"
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
						slot="contact"
						item={{ ...item, orgId }}
						cardFields={cardFields}
						isDragging={isDragging}
					/>
				)}
				onCardMove={async () => {}}
				emptyTitle={`No ${labels.contact.plural.toLowerCase()} yet`}
				emptyDescription={`Convert a ${labels.lead.singular.toLowerCase()} to create your first ${labels.contact.singular.toLowerCase()}.`}
			/>

			<ConvertLeadDrawer
				open={convertOpen}
				onOpenChange={setConvertOpen}
				orgId={orgId}
				onConvert={(leadId) => convert(leadId)}
			/>
		</>
	);
}

export function ContactDetailView({ orgSlug, contactId }: { orgSlug: string; contactId: string }) {
	const labels = useEntityLabels();
	return (
		<div
			data-org={orgSlug}
			data-id={contactId}
			data-entity="contact"
			className="flex h-full items-center justify-center text-sm text-muted-foreground"
		>
			{labels.contact.singular} detail — coming in Slice 2
		</div>
	);
}
