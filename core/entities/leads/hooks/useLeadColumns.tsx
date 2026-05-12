"use client";

/**
 * useLeadColumns — TanStack column defs for the leads DataTable.
 *
 * - Sortable headers via DataTableColumnHeader.
 * - Assignee resolves to a PersonDisplay (avatar + name → /profile).
 * - Tags column uses TagsCell with inline add/edit (pencil on hover).
 * - Row actions column (vertical dots → Edit / Convert / Delete).
 * - `meta.label` on every column so View Options reads nicely.
 */

import type { ColumnDef } from "@tanstack/react-table";
import { useMutation } from "convex/react";
import { formatDistanceToNow } from "date-fns";
import { ArrowRightCircleIcon } from "lucide-react";
import { useMemo } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { DropdownMenuItem } from "@/components/ui/dropdown-menu";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { DataTableColumnHeader } from "@/core/datatable/components/DataTableColumnHeader";
import { DataTableRowActions } from "@/core/datatable/components/DataTableRowActions";
import { AssigneeCell } from "@/core/entities/shared/components/AssigneeCell";
import { CopyField } from "@/core/entities/shared/components/CopyField";
import { TagsCell } from "@/core/entities/shared/components/TagsCell";
import { useModuleDisplay } from "@/core/entities/shared/hooks/useModuleDisplay";
import { PersonCodeBadge } from "@/core/entities/shared/PersonCodeBadge";

type LeadRow = Record<string, unknown> & {
	id: string;
	_id?: Id<"leads">;
	orgId?: Id<"orgs">;
};

interface UseLeadColumnsOptions {
	onConvert?: (leadId: Id<"leads">) => void;
}

export function useLeadColumns(options?: UseLeadColumnsOptions): ColumnDef<LeadRow, unknown>[] {
	const { listColumns } = useModuleDisplay("lead");
	const deleteLead = useMutation(api.crm.entities.leads.mutations.softDelete);

	return useMemo(() => {
		const cols: ColumnDef<LeadRow, unknown>[] = [
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
						onClick={(e) => e.stopPropagation()}
					/>
				),
				enableSorting: false,
				enableHiding: false,
				size: 32,
			},
		];

		for (const key of listColumns) {
			switch (key) {
				case "personCode":
					cols.push({
						id: "personCode",
						accessorKey: "personCode",
						meta: { label: "Code" },
						header: ({ column }) => (
							<DataTableColumnHeader column={column} title="Code" />
						),
						cell: ({ row }) => (
							<PersonCodeBadge personCode={row.getValue("personCode") as string} />
						),
						size: 100,
					});
					break;
				case "displayName":
					cols.push({
						id: "displayName",
						accessorKey: "displayName",
						meta: { label: "Name" },
						header: ({ column }) => (
							<DataTableColumnHeader column={column} title="Name" />
						),
						cell: ({ row }) => (
							<span className="font-medium">
								{row.getValue("displayName") as string}
							</span>
						),
					});
					break;
				case "status":
					cols.push({
						id: "status",
						accessorKey: "status",
						meta: { label: "Status" },
						header: ({ column }) => (
							<DataTableColumnHeader column={column} title="Status" />
						),
						cell: ({ row }) => (
							<Badge variant="secondary" className="h-5 text-[10px] capitalize">
								{row.getValue("status") as string}
							</Badge>
						),
						filterFn: "equals",
					});
					break;
				case "source":
					cols.push({
						id: "source",
						accessorKey: "source",
						meta: { label: "Source" },
						header: ({ column }) => (
							<DataTableColumnHeader column={column} title="Source" />
						),
						cell: ({ row }) => (
							<Badge variant="outline" className="h-5 text-[10px] capitalize">
								{row.getValue("source") as string}
							</Badge>
						),
					});
					break;
				case "email":
					cols.push({
						id: "email",
						accessorKey: "email",
						meta: { label: "Email" },
						header: ({ column }) => (
							<DataTableColumnHeader column={column} title="Email" />
						),
						cell: ({ row }) => (
							<CopyField
								value={row.getValue("email") as string | undefined}
								kind="email"
								className="text-xs text-muted-foreground"
							/>
						),
					});
					break;
				case "phone":
					cols.push({
						id: "phone",
						accessorKey: "phone",
						meta: { label: "Phone" },
						header: ({ column }) => (
							<DataTableColumnHeader column={column} title="Phone" />
						),
						cell: ({ row }) => (
							<CopyField
								value={row.getValue("phone") as string | undefined}
								kind="phone"
								className="text-xs text-muted-foreground"
							/>
						),
					});
					break;
				case "assignedTo":
					cols.push({
						id: "assignedTo",
						accessorKey: "assignedTo",
						meta: { label: "Assignee" },
						header: ({ column }) => (
							<DataTableColumnHeader column={column} title="Assignee" />
						),
						cell: ({ row }) => {
							const r = row.original as LeadRow;
							return (
								<AssigneeCell
									orgId={r.orgId as Id<"orgs"> | undefined}
									userId={row.getValue("assignedTo") as Id<"users"> | undefined}
								/>
							);
						},
					});
					break;
				case "tags":
					cols.push({
						id: "tags",
						accessorKey: "tags",
						meta: { label: "Tags" },
						header: "Tags",
						enableSorting: false,
						cell: ({ row }) => {
							const r = row.original as LeadRow;
							const leadId = (r._id ?? r.id) as Id<"leads">;
							const orgId = r.orgId as Id<"orgs"> | undefined;
							return (
								<TagsCell
									orgId={orgId}
									entityType="lead"
									entityId={leadId}
									size="xs"
								/>
							);
						},
					});
					break;
				case "createdAt":
					cols.push({
						id: "createdAt",
						accessorKey: "createdAt",
						meta: { label: "Created" },
						header: ({ column }) => (
							<DataTableColumnHeader column={column} title="Created" />
						),
						cell: ({ row }) => {
							const ts = row.getValue("createdAt") as number;
							return (
								<span className="text-xs text-muted-foreground">
									{formatDistanceToNow(new Date(ts), { addSuffix: true })}
								</span>
							);
						},
					});
					break;
				default:
					cols.push({
						id: key,
						accessorKey: key,
						meta: { label: key },
						header: key,
						cell: ({ row }) => (
							<span className="text-xs">{String(row.getValue(key) ?? "—")}</span>
						),
					});
			}
		}

		// Row actions — always last
		cols.push({
			id: "actions",
			enableSorting: false,
			enableHiding: false,
			size: 44,
			cell: ({ row }) => (
				// biome-ignore lint/a11y/noStaticElementInteractions: event-stop wrapper keeps the dots menu from opening row detail
				<div
					className="flex justify-end"
					onClick={(e) => e.stopPropagation()}
					onKeyDown={(e) => e.stopPropagation()}
				>
					<DataTableRowActions
						row={row}
						extraItems={
							options?.onConvert ? (
								<DropdownMenuItem
									onClick={() => {
										const r = row.original as LeadRow;
										const leadId = (r._id ?? r.id) as Id<"leads">;
										options.onConvert?.(leadId);
									}}
								>
									<ArrowRightCircleIcon className="me-2 size-4" />
									Convert
								</DropdownMenuItem>
							) : null
						}
						onDelete={async (r) => {
							const orig = r.original as LeadRow;
							const leadId = (orig._id ?? orig.id) as Id<"leads">;
							const orgId = orig.orgId as Id<"orgs"> | undefined;
							if (!orgId) return;
							try {
								await deleteLead({ orgId, leadId });
								toast.success("Lead deleted");
							} catch (err) {
								toast.error(
									err instanceof Error ? err.message : "Failed to delete",
								);
							}
						}}
					/>
				</div>
			),
		});

		return cols;
	}, [listColumns, options?.onConvert, deleteLead]);
}
