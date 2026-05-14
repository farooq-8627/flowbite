"use client";

/**
 * ContactsView — full scaffold-driven contacts list + board view.
 *
 * - Primary action: Convert Lead (D4 — contacts born via conversion only).
 *   Hidden if user lacks `leads.convert` permission (Q-v3.2 option A).
 * - ViewOptionsMenu with dynamic grouping (assignee / company / tag).
 * - Per-row "Revert to Lead" menu action on converted contacts.
 * - Toolbar search with rank-to-top + flash highlight on matches.
 */

import type { ColumnDef } from "@tanstack/react-table";
import { useMutation, useQuery } from "convex/react";
import { formatDistanceToNow } from "date-fns";
import { ArrowRightCircleIcon, PencilIcon, Undo2Icon } from "lucide-react";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Checkbox } from "@/components/ui/checkbox";
import { DropdownMenuItem } from "@/components/ui/dropdown-menu";
import { api } from "@/convex/_generated/api";
import type { Doc, Id } from "@/convex/_generated/dataModel";
import { DataTableRowActions } from "@/core/datatable/components/DataTableRowActions";
import { EditContactDrawer } from "@/core/entities/contacts/components/EditContactDrawer";
import { ConvertLeadDrawer } from "@/core/entities/leads/components/ConvertLeadDrawer";
import { useLeadMutations } from "@/core/entities/leads/hooks/useLeadMutations";
import { EntityListPage } from "@/core/entities/scaffolds/EntityListPage";
import type { PrimaryActionConfig } from "@/core/entities/scaffolds/EntityPageLayout";
import { AssigneeCell } from "@/core/entities/shared/components/AssigneeCell";
import { CompanyCell } from "@/core/entities/shared/components/CompanyCell";
import { EntityCard } from "@/core/entities/shared/components/EntityCard";
import { TagsCell } from "@/core/entities/shared/components/TagsCell";
import { ViewOptionsMenu } from "@/core/entities/shared/components/ViewOptionsMenu";
import { getStatusColor } from "@/core/entities/shared/config/defaults";
import { useCustomFields } from "@/core/entities/shared/hooks/useCustomFields";
import { useEntityTagsMap } from "@/core/entities/shared/hooks/useEntityTagsMap";
import { useModuleDisplay } from "@/core/entities/shared/hooks/useModuleDisplay";
import { useViewToggle } from "@/core/entities/shared/hooks/useViewToggle";
import { PersonCodeBadge } from "@/core/entities/shared/PersonCodeBadge";
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

type ContactRow = Record<string, unknown> & {
	id: string;
	_id?: Id<"contacts">;
	leadId?: Id<"leads">;
	orgId?: Id<"orgs">;
};

const CONTACT_SEARCH_FIELDS = ["displayName", "email", "phone", "personCode"] as const;

export function ContactsView({ orgSlug }: { orgSlug: string }) {
	const labels = useEntityLabels();
	const params = useParams();
	const orgs = useQuery(api.orgs.queries.listMyOrgs);
	const orgId = orgs?.find((o) => o.org.slug === (params?.orgSlug ?? orgSlug))?.org._id;

	const contacts = useQuery(api.crm.entities.contacts.queries.list, orgId ? { orgId } : "skip");
	const items = useMemo(
		() =>
			contacts?.map((c) => ({
				...c,
				id: c._id as string,
				orgId,
			})) as ContactRow[] | undefined,
		[contacts, orgId],
	);

	const [view, setView] = useViewToggle("contact");
	const { cardFields: defaultCardFields, listColumns } = useModuleDisplay("contact");
	const { convert } = useLeadMutations(orgId);
	const canConvert = useOrgPermission(orgId, "leads.convert");
	const revertToLead = useMutation(api.crm.entities.contacts.mutations.revertToLead);
	const softDeleteContact = useMutation(api.crm.entities.contacts.mutations.softDelete);

	const [convertOpen, setConvertOpen] = useState(false);
	const [editOpen, setEditOpen] = useState(false);
	const [editingContact, setEditingContact] = useState<Doc<"contacts"> | null>(null);
	const [search, setSearch] = useState("");
	const [cardFields, setCardFields] = useState<string[]>(defaultCardFields);
	const [groupBy, setGroupBy] = useState<string>("assignedTo");

	useEffect(() => {
		setCardFields(defaultCardFields);
	}, [defaultCardFields]);

	// Global quick-add listener — "New contact" from anywhere opens the
	// Convert drawer (contacts can only be created via conversion).
	useQuickAddListener("create-contact", () => setConvertOpen(true));

	// Custom fields — user-defined fields appear in ViewOptionsMenu.
	const customFields = useCustomFields("contact", orgId);

	// Search ranking
	const rankedItems = useMemo(
		() =>
			rankBySearch(
				(items ?? []) as SearchableItem[],
				search,
				CONTACT_SEARCH_FIELDS as unknown as string[],
			),
		[items, search],
	);
	const [flashEpoch, setFlashEpoch] = useState(0);
	useEffect(() => {
		if (!search) return;
		setFlashEpoch((e) => e + 1);
	}, [search]);

	// Members lookup for assignee grouping labels
	const members = useQuery(api.orgs.queries.listMembers, orgId ? { orgId } : "skip");
	const memberNameById = useMemo(() => {
		const map = new Map<string, string>();
		for (const m of members ?? []) {
			map.set(m.userId as string, m.user?.name ?? m.user?.email ?? (m.userId as string));
		}
		return map;
	}, [members]);

	// Batched tag map — for table tag column + board tag-grouping.
	const { tagsByEntityId, uniqueTags } = useEntityTagsMap(orgId, "contact");

	// ── Dynamic board columns ────────────────────────────────────────────────
	const boardColumns: KanbanColumnConfig[] = useMemo(() => {
		if (groupBy === "assignedTo") {
			const assignees = new Set<string>();
			for (const it of items ?? []) assignees.add(String(it.assignedTo ?? NO_GROUP_KEY));
			return Array.from(assignees).map((a) => ({
				id: a,
				title: a === NO_GROUP_KEY ? "Unassigned" : (memberNameById.get(a) ?? a),
				color: getStatusColor("contact", a === NO_GROUP_KEY ? "unassigned" : "assigned"),
			}));
		}
		if (groupBy === "tag" || groupBy === "tags") {
			const cols: KanbanColumnConfig[] = uniqueTags.map((t) => ({
				id: t.name,
				title: t.name,
				color: (t.color as string | undefined) ?? getStatusColor("contact", t.name),
			}));
			cols.push({
				id: NO_GROUP_KEY,
				title: "Untagged",
				color: getStatusColor("contact", "unassigned"),
			});
			return cols;
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
			color: getStatusColor("contact", v),
		}));
	}, [groupBy, items, memberNameById, uniqueTags]);

	const itemsByColumnId = useMemo(() => {
		const grouped: Record<string, typeof rankedItems.items> = {};
		for (const col of boardColumns) grouped[col.id] = [];
		if (groupBy === "tag" || groupBy === "tags") {
			for (const item of rankedItems.items) {
				const tagList = tagsByEntityId[item.id] ?? [];
				if (tagList.length === 0) {
					if (!grouped[NO_GROUP_KEY]) grouped[NO_GROUP_KEY] = [];
					grouped[NO_GROUP_KEY].push(item);
					continue;
				}
				for (const tag of tagList) {
					if (!grouped[tag.name]) grouped[tag.name] = [];
					grouped[tag.name].push(item);
				}
			}
			return grouped;
		}
		for (const item of rankedItems.items) {
			const raw = (item as Record<string, unknown>)[groupBy];
			const key = raw ? String(raw) : NO_GROUP_KEY;
			if (!grouped[key]) grouped[key] = [];
			grouped[key].push(item);
		}
		return grouped;
	}, [rankedItems.items, boardColumns, groupBy, tagsByEntityId]);

	const handleRevert = useCallback(
		async (contactId: Id<"contacts">) => {
			if (!orgId) return;
			try {
				await revertToLead({ orgId, contactId });
				toast.success(
					`${labels.contact.singular} reverted to ${labels.lead.singular.toLowerCase()}`,
				);
			} catch (err) {
				toast.error(err instanceof Error ? err.message : "Couldn't revert");
			}
		},
		[orgId, revertToLead, labels],
	);

	// List columns
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
						cell: ({ row }) => {
							const r = row.original as ContactRow;
							const personCode = r.personCode as string | undefined;
							return (
								<CompanyCell
									orgId={orgId}
									personCode={personCode}
									entityType="contact"
								/>
							);
						},
					});
					break;
				case "tags":
					cols.push({
						accessorKey: "tags",
						header: "Tags",
						cell: ({ row }) => {
							const r = row.original as ContactRow;
							const id = (r._id ?? r.id) as string;
							return orgId ? (
								<TagsCell
									orgId={orgId}
									entityType="contact"
									entityId={id}
									size="xs"
									max={3}
								/>
							) : (
								<span className="text-xs text-muted-foreground">—</span>
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

		// Row actions — revert + delete
		cols.push({
			id: "actions",
			enableSorting: false,
			enableHiding: false,
			size: 44,
			cell: ({ row }) => {
				const r = row.original as ContactRow;
				const canRevert = !!r.leadId && canConvert === true;
				return (
					// biome-ignore lint/a11y/noStaticElementInteractions: event-stop wrapper keeps the dots menu from opening row detail
					<div
						className="flex justify-end"
						onClick={(e) => e.stopPropagation()}
						onKeyDown={(e) => e.stopPropagation()}
					>
						<DataTableRowActions
							row={row}
							extraItems={
								<>
									<DropdownMenuItem
										onClick={() => {
											setEditingContact(r as unknown as Doc<"contacts">);
											setEditOpen(true);
										}}
									>
										<PencilIcon className="me-2 size-4" />
										Edit
									</DropdownMenuItem>
									{canRevert && (
										<DropdownMenuItem
											onClick={() =>
												handleRevert((r._id ?? r.id) as Id<"contacts">)
											}
										>
											<Undo2Icon className="me-2 size-4" />
											Revert to {labels.lead.singular.toLowerCase()}
										</DropdownMenuItem>
									)}
								</>
							}
							onDelete={async (row) => {
								const orig = row.original as ContactRow;
								const contactId = (orig._id ?? orig.id) as Id<"contacts">;
								if (!orgId) return;
								try {
									await softDeleteContact({ orgId, contactId });
									toast.success("Contact deleted");
								} catch (err) {
									toast.error(
										err instanceof Error ? err.message : "Failed to delete",
									);
								}
							}}
						/>
					</div>
				);
			},
		});
		return cols;
	}, [listColumns, orgId, canConvert, labels, softDeleteContact, handleRevert]);

	// Primary action — Convert Lead (hidden if no permission)
	const primaryAction: PrimaryActionConfig | undefined =
		canConvert === true
			? {
					label: `Convert ${labels.lead.singular}`,
					icon: ArrowRightCircleIcon,
					permission: "leads.convert",
					onClick: () => setConvertOpen(true),
				}
			: undefined;

	// Hide grouped-by field + reveal complementary
	const effectiveCardFields = useMemo(() => {
		const hidden = new Set(getHiddenCardFieldsForGrouping(groupBy));
		let next = cardFields.filter((f) => !hidden.has(f));
		const reveal = getRevealedCardFieldForGrouping(groupBy, "contact");
		if (reveal && !next.includes(reveal)) next = [reveal, ...next];
		return next;
	}, [cardFields, groupBy]);

	return (
		<>
			<EntityListPage
				slot="contact"
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
					placeholder: `Search ${labels.contact.plural.toLowerCase()}…`,
				}}
				renderToolbarExtras={() => (
					<ViewOptionsMenu
						slot="contact"
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
				renderCard={(item, isDragging) => {
					const r = item as ContactRow;
					const contactId = (r._id ?? r.id) as Id<"contacts">;
					const menuItems: Array<{
						label: string;
						icon?: typeof PencilIcon;
						onSelect: () => void;
						variant?: "default" | "destructive";
					}> = [
						{
							label: "Edit",
							icon: PencilIcon,
							onSelect: () => {
								setEditingContact(r as unknown as Doc<"contacts">);
								setEditOpen(true);
							},
						},
					];
					if (r.leadId && canConvert === true) {
						menuItems.push({
							label: `Revert to ${labels.lead.singular.toLowerCase()}`,
							icon: Undo2Icon,
							onSelect: () => handleRevert(contactId),
						});
					}
					return (
						<EntityCard
							key={item.id}
							slot="contact"
							item={{ ...item, orgId }}
							cardFields={effectiveCardFields}
							isDragging={isDragging}
							isHighlighted={search ? rankedItems.matchedIds.has(item.id) : false}
							highlightEpoch={flashEpoch}
							menuItems={menuItems}
						/>
					);
				}}
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

			<EditContactDrawer
				open={editOpen}
				onOpenChange={(v) => {
					setEditOpen(v);
					if (!v) setEditingContact(null);
				}}
				orgId={orgId}
				contact={editingContact}
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
