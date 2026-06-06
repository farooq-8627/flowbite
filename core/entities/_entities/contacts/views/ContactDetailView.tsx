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

import { useQuery } from "convex/react";
import { ArrowRightCircleIcon, PencilIcon, Undo2Icon } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { DropdownMenuItem } from "@/components/ui/dropdown-menu";
import { api } from "@/convex/_generated/api";
import type { Doc, Id } from "@/convex/_generated/dataModel";
import type { KanbanColumnConfig } from "@/core/data-display/kanban/components/KanbanBoard";
import { usePersistedColumnOrder } from "@/core/data-display/kanban/hooks/usePersistedColumnOrder";
import { computeSortOrderForDrop } from "@/core/data-display/kanban/utils/sort-order";
import { EditContactDrawer } from "@/core/entities/_entities/contacts/components/EditContactDrawer";
import { ConvertLeadDrawer } from "@/core/entities/_entities/leads/components/ConvertLeadDrawer";
import { useLeadMutations } from "@/core/entities/_entities/leads/hooks/useLeadMutations";
import { EntityListPage } from "@/core/entities/scaffolds/EntityListPage";
import { EntityCard } from "@/core/entities/shared/components/EntityCard";
import { ViewOptionsMenu } from "@/core/entities/shared/components/ViewOptionsMenu";
import { getStatusColor } from "@/core/entities/shared/config/defaults";
import { useCompaniesByPersonCodes } from "@/core/entities/shared/hooks/useCompaniesByPersonCodes";
import { useEntityColumns } from "@/core/entities/shared/hooks/useEntityColumns";
import { useEntityFields } from "@/core/entities/shared/hooks/useEntityFields";
import { useEntityFieldValuesMap } from "@/core/entities/shared/hooks/useEntityFieldValuesMap";
import {
	useAttachTagToEntity,
	useDetachTagFromEntity,
	useRevertContactToLead,
	useSoftDeleteContact,
	useUpdateContact,
} from "@/core/entities/shared/hooks/useEntityMutations";
import { useEntityTagsMap } from "@/core/entities/shared/hooks/useEntityTagsMap";
import { useViewToggle } from "@/core/entities/shared/hooks/useViewToggle";
import {
	getHiddenCardFieldsForGrouping,
	getRevealedCardFieldForGrouping,
	NO_GROUP_KEY,
} from "@/core/entities/shared/utils/board-grouping";
import { rankBySearch, type SearchableItem } from "@/core/entities/shared/utils/search";
import type { PrimaryActionConfig } from "@/core/shell/shared/entity-layout";
import { useCurrentOrg, useOrgMembers } from "@/core/shell/shared/hooks/useCurrentOrg";
import { useEntityLabels } from "@/core/shell/shared/hooks/useEntityLabels";
import { useQuickAddListener } from "@/core/shell/shell/components/QuickAddMenu";
import { useOrgPermission } from "@/features/orgs/hooks/useOrgPermission";
import { usePersistedState } from "@/lib/hooks/use-persisted-state";
import { normalizeError, normalizeErrorDescription } from "@/lib/normalizeError";

type ContactRow = Record<string, unknown> & {
	id: string;
	_id?: Id<"contacts">;
	leadId?: Id<"leads">;
	orgId?: Id<"orgs">;
};

const CONTACT_SEARCH_FIELDS = ["displayName", "email", "phone", "personCode"] as const;

export function ContactsView({ orgSlug: _orgSlug }: { orgSlug: string }) {
	const labels = useEntityLabels();
	const { orgId } = useCurrentOrg();

	const contacts = useQuery(api.crm.entities.contacts.queries.list, orgId ? { orgId } : "skip");
	const items = useMemo(
		() =>
			contacts
				?.map((c) => ({
					...c,
					id: c._id as string,
					orgId,
				}))
				// Newest first by default — matches user expectation that just-
				// added records appear at the top of the list.
				.sort((a, b) => (b._creationTime ?? 0) - (a._creationTime ?? 0)) as
				| ContactRow[]
				| undefined,
		[contacts, orgId],
	);

	const [view, setView] = useViewToggle("contact");
	const { visibleFields: contactFields } = useEntityFields("contact", orgId);
	const defaultCardFields = useMemo(() => contactFields.map((f) => f.name), [contactFields]);
	const { convert } = useLeadMutations(orgId);
	const canConvert = useOrgPermission(orgId, "leads.convert");
	const revertToLead = useRevertContactToLead();
	const softDeleteContact = useSoftDeleteContact();

	const [convertOpen, setConvertOpen] = useState(false);
	const [editOpen, setEditOpen] = useState(false);
	const [editingContact, setEditingContact] = useState<Doc<"contacts"> | null>(null);
	const [search, setSearch] = useState("");
	// Persisted view options — survive route changes / reloads.
	// `cardFields:v2` (2026-05-18) — see LeadsView for context.
	const [cardFields, setCardFields] = usePersistedState<string[]>(
		"viewopts:contact:cardFields:v2",
		[],
	);
	const [groupBy, setGroupBy] = usePersistedState<string>(
		"viewopts:contact:groupBy",
		"assignedTo",
	);

	useEffect(() => {
		setCardFields((prev) => {
			if (!prev || prev.length === 0) return defaultCardFields;
			const allowed = new Set(defaultCardFields);
			const next = prev.filter((f) => allowed.has(f));
			return next.length === prev.length ? prev : next;
		});
	}, [defaultCardFields, setCardFields]);

	// Global quick-add listener — "New contact" from anywhere opens the
	// Convert drawer (contacts can only be created via conversion).
	useQuickAddListener("create-contact", () => setConvertOpen(true));

	const { valuesByEntityId: customValuesByEntityId } = useEntityFieldValuesMap("contact", orgId);

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
	const members = useOrgMembers();
	const memberNameById = useMemo(() => {
		const map = new Map<string, string>();
		for (const m of members ?? []) {
			map.set(m.userId as string, m.user?.name ?? m.user?.email ?? (m.userId as string));
		}
		return map;
	}, [members]);

	// Companies lookup — only needed when board is grouped by companyId.
	// Scoped to avoid a full-table subscription on every mount.
	const companies = useQuery(
		api.crm.entities.companies.queries.list,
		orgId && groupBy === "companyId" ? { orgId } : "skip",
	);
	const companyNameById = useMemo(() => {
		const map = new Map<string, string>();
		for (const c of companies ?? []) map.set(c._id as string, c.name);
		return map;
	}, [companies]);

	// Batched tag map — for table tag column + board tag-grouping.
	const { tagsByEntityId, uniqueTags } = useEntityTagsMap(orgId, "contact");

	// Batched company lookup — eliminates the per-row CompanyCell
	// `getByPersonCode` subscription that was firing once per visible row
	// (and re-firing on every list mutation), causing the "company keeps
	// refetching" symptom on the contacts table.
	const personCodes = useMemo(
		() =>
			(items ?? [])
				.map((it) => (it as Record<string, unknown>).personCode as string)
				.filter(Boolean),
		[items],
	);
	const companiesByPersonCode = useCompaniesByPersonCodes(orgId, personCodes);

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
			// Tag column id MUST be `tag._id` (Convex Id) so the drag
			// handler can pass it straight through to
			// `tags.attachToEntity` / `detachFromEntity`. Using the name
			// fails server validation (`v.id("tags")` rejects "New", etc.).
			const cols: KanbanColumnConfig[] = uniqueTags.map((t) => ({
				id: t._id as string,
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

	// Per-user persisted column order. Survives reloads.
	const { orderedColumns: boardColumnsOrdered, onColumnReorder } = usePersistedColumnOrder(
		`contact:${groupBy}`,
		boardColumns,
	);

	const itemsByColumnId = useMemo(() => {
		const grouped: Record<string, typeof rankedItems.items> = {};
		for (const col of boardColumns) grouped[col.id] = [];
		if (groupBy === "tag" || groupBy === "tags") {
			// Bucket key matches the column id (`tag._id`).
			for (const item of rankedItems.items) {
				const tagList = tagsByEntityId[item.id] ?? [];
				if (tagList.length === 0) {
					if (!grouped[NO_GROUP_KEY]) grouped[NO_GROUP_KEY] = [];
					grouped[NO_GROUP_KEY].push(item);
					continue;
				}
				for (const tag of tagList) {
					const key = tag._id as string;
					if (!grouped[key]) grouped[key] = [];
					grouped[key].push(item);
				}
			}
		} else {
			for (const item of rankedItems.items) {
				const raw = (item as Record<string, unknown>)[groupBy];
				const key = raw ? String(raw) : NO_GROUP_KEY;
				if (!grouped[key]) grouped[key] = [];
				grouped[key].push(item);
			}
		}
		// Sort each column by sortOrder asc with search-match boost so
		// dragged-to-position cards stick.
		const matched = rankedItems.matchedIds;
		for (const key of Object.keys(grouped)) {
			grouped[key].sort((a, b) => {
				const aMatch = matched.has(a.id);
				const bMatch = matched.has(b.id);
				if (aMatch !== bMatch) return aMatch ? -1 : 1;
				const aKey =
					(a as { sortOrder?: number; _creationTime?: number }).sortOrder ??
					-((a as { _creationTime?: number })._creationTime ?? 0);
				const bKey =
					(b as { sortOrder?: number; _creationTime?: number }).sortOrder ??
					-((b as { _creationTime?: number })._creationTime ?? 0);
				return aKey - bKey;
			});
		}
		return grouped;
	}, [rankedItems.items, rankedItems.matchedIds, boardColumns, groupBy, tagsByEntityId]);

	// Drag card → persist position via sortOrder + (when groupBy is one of
	// the writable axes) update the column-field. Cross-column move and
	// in-column reorder dispatch through the same callback.
	//
	// Tag groupBy: contacts can carry multiple tags. Dragging across tag
	// columns swaps just the source/destination tag (not all tags) — same
	// semantics as LeadsView.
	const updateContact = useUpdateContact();
	const attachTag = useAttachTagToEntity();
	const detachTag = useDetachTagFromEntity();
	const handleCardMove = useCallback(
		async (itemId: string, fromCol: string, toCol: string, newIndex: number) => {
			if (!orgId) return;
			const destBefore = itemsByColumnId[toCol] ?? [];
			let itemsAfter: typeof destBefore;
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
				const movedItem = (rankedItems.items ?? []).find((it) => it.id === itemId);
				if (!movedItem) return;
				const copy = destBefore.slice();
				copy.splice(newIndex, 0, movedItem as (typeof destBefore)[number]);
				itemsAfter = copy;
			}
			const sortOrder = computeSortOrderForDrop(
				itemsAfter as Array<{ id: string; sortOrder?: number; _creationTime?: number }>,
				newIndex,
			);

			try {
				const baseArgs = {
					orgId,
					contactId: itemId as Id<"contacts">,
					sortOrder,
				};
				if (fromCol === toCol) {
					await updateContact(baseArgs);
				} else if (groupBy === "assignedTo") {
					await updateContact({
						...baseArgs,
						assignedTo: toCol === NO_GROUP_KEY ? undefined : (toCol as Id<"users">),
					});
				} else if (groupBy === "companyId") {
					await updateContact({
						...baseArgs,
						companyId: toCol === NO_GROUP_KEY ? undefined : (toCol as Id<"companies">),
					});
				} else if (groupBy === "tag" || groupBy === "tags") {
					// Tag move — sortOrder first, then detach old / attach new.
					await updateContact(baseArgs);
					if (fromCol !== NO_GROUP_KEY) {
						await detachTag({
							orgId,
							tagId: fromCol as Id<"tags">,
							entityType: "contact",
							entityId: itemId,
						});
					}
					if (toCol !== NO_GROUP_KEY) {
						await attachTag({
							orgId,
							tagId: toCol as Id<"tags">,
							entityType: "contact",
							entityId: itemId,
						});
					}
				} else {
					// Custom groupBy — only persist position.
					await updateContact(baseArgs);
				}
			} catch (err) {
				toast.error("Couldn't update", {
					description: normalizeErrorDescription(err),
				});
			}
		},
		[orgId, updateContact, groupBy, itemsByColumnId, rankedItems.items, attachTag, detachTag],
	);

	const handleRevert = useCallback(
		async (contactId: Id<"contacts">) => {
			if (!orgId) return;
			try {
				await revertToLead({ orgId, contactId });
				toast.success(
					`${labels.contact.singular} reverted to ${labels.lead.singular.toLowerCase()}`,
				);
			} catch (err) {
				toast.error(normalizeError(err, "Couldn't revert"));
			}
		},
		[orgId, revertToLead, labels],
	);

	// Columns flow through the central `useEntityColumns` factory — same
	// path as LeadsView. The factory iterates `tableFields` from
	// `useEntityFields("contact")`, dispatches each through the cell
	// renderer (so tags get TagsCell, company gets CompanyCell with the
	// batched lookup, assignee gets AssigneeCell, empty cells get the `+`
	// inline-edit button), and wraps every header in
	// `<DataTableColumnHeader>` so the table is sortable everywhere.
	const { columns } = useEntityColumns<ContactRow>("contact", orgId, {
		customValuesByEntityId,
		tagsByEntityId,
		companiesByPersonCode,
		onDelete: async (row) => {
			if (!orgId) return;
			const contactId = (row._id ?? row.id) as Id<"contacts">;
			try {
				await softDeleteContact({ orgId, contactId });
				toast.success(`${labels.contact.singular} deleted`);
			} catch (err) {
				toast.error(normalizeError(err, "Failed to delete"));
			}
		},
		rowExtraActions: (row) => {
			const canRevert = !!row.leadId && canConvert === true;
			return (
				<>
					<DropdownMenuItem
						onClick={() => {
							setEditingContact(row as unknown as Doc<"contacts">);
							setEditOpen(true);
						}}
					>
						<PencilIcon className="me-2 size-4" />
						Edit
					</DropdownMenuItem>
					{canRevert && (
						<DropdownMenuItem
							onClick={() => handleRevert((row._id ?? row.id) as Id<"contacts">)}
						>
							<Undo2Icon className="me-2 size-4" />
							Revert to {labels.lead.singular.toLowerCase()}
						</DropdownMenuItem>
					)}
				</>
			);
		},
	});

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

	// Resolver for the EntityCard "fill the gap" indicator. Contacts'
	// reveal matrix can surface either `assignedTo` (user id) or `companyId`
	// (company id) — both opaque ids that need a lookup to render a useful
	// label. Wrapped in useCallback so the card can rely on a stable ref.
	const resolveReplacementLabel = useCallback(
		(fieldName: string, raw: string): string | undefined => {
			if (fieldName === "assignedTo") return memberNameById.get(raw);
			if (fieldName === "companyId") return companyNameById.get(raw);
			return undefined;
		},
		[memberNameById, companyNameById],
	);

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
				renderToolbarExtras={() =>
					view === "board" ? (
						<ViewOptionsMenu
							slot="contact"
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
							customFieldValues={customValuesByEntityId[item.id]}
							isDragging={isDragging}
							isHighlighted={search ? rankedItems.matchedIds.has(item.id) : false}
							highlightEpoch={flashEpoch}
							menuItems={menuItems}
							groupBy={groupBy}
							resolveReplacementLabel={resolveReplacementLabel}
							prefetchedTags={tagsByEntityId[item.id] ?? []}
						/>
					);
				}}
				onCardMove={handleCardMove}
				onColumnReorder={onColumnReorder}
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
