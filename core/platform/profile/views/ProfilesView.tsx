"use client";

/**
 * ProfilesView — unified people page (`/profile`).
 *
 * Replaces the earlier two-tab AllProfilesView per direct user feedback
 * (2026-05-19): "I dont want seperate tabs for the leads and contacts
 * with rendering same data i want a single tab only in that we will
 * have only 2 boards saying leads, contacts and we show leads
 * (excluding converted), contacts thats it."
 *
 * Layout
 * ──────
 *   ┌── EntityPageLayout (toolbar: search + view toggle) ─────┐
 *   │                                                         │
 *   │  ┌────────── Leads ──┐  ┌────── Contacts ─────┐         │
 *   │  │  LeadCard         │  │  EntityCard          │         │
 *   │  │  …                │  │  …                   │         │
 *   │  └───────────────────┘  └──────────────────────┘         │
 *   └─────────────────────────────────────────────────────────┘
 *
 * Why a single board (and not two pages or two tabs)
 * ──────────────────────────────────────────────────
 *   - Sales people think of a "person" as a single concept regardless of
 *     whether they're a lead or a contact. Two columns side by side lets
 *     them see the whole funnel at a glance.
 *   - Lead↔contact conversion is a single click on the LeadCard (the +
 *     shortcut). After conversion, the row vanishes from the Leads
 *     column (we filter `convertedAt`) and reappears in the Contacts
 *     column instantly via Convex reactivity.
 *   - No separate dynamic group-by — the columns are fixed (Leads /
 *     Contacts). If the user wants finer slicing they can drill into
 *     the per-entity board (`/leads`, `/contacts`).
 *
 * What we reuse
 * ─────────────
 *   - `EntityPageLayout`         — toolbar + view toggle.
 *   - `LeadCard`                 — exact same card renderer used on the
 *                                  per-entity Leads board, including
 *                                  status dot, AI summary, follow-ups
 *                                  badge, etc.
 *   - `EntityCard`               — used for contacts, tags + assignee
 *                                  + AI summary + group-replacement
 *                                  strip etc.
 *   - `useEntityTagsMap`         — batched tag lookup (no per-card sub).
 *   - Mutations from the lead/contact hooks for convert / lost / edit.
 *
 * What's deliberately omitted
 * ───────────────────────────
 *   - List view — the user explicitly said "skip the table here".
 *   - Per-column drag — Leads and Contacts are different tables; you
 *     can't drag a card from Lead → Contact without going through the
 *     convert mutation. The Lead's "+ convert" shortcut is the canonical
 *     path.
 *   - Group-by — fixed two-column layout makes the board predictable.
 */

import { useQuery } from "convex/react";
import { ArrowRightCircleIcon, PencilIcon, PlusIcon, Trash2Icon } from "lucide-react";
import { useCallback, useMemo, useState } from "react";
import { toast } from "sonner";
import { api } from "@/convex/_generated/api";
import type { Doc, Id } from "@/convex/_generated/dataModel";
import type { KanbanColumnConfig } from "@/core/data-display/kanban/components/KanbanBoard";
import { EditContactDrawer } from "@/core/entities/_entities/contacts/components/EditContactDrawer";
import { AddLeadDrawer } from "@/core/entities/_entities/leads/components/AddLeadDrawer";
import { ConvertLeadDrawer } from "@/core/entities/_entities/leads/components/ConvertLeadDrawer";
import { EditLeadDrawer } from "@/core/entities/_entities/leads/components/EditLeadDrawer";
import { LeadCard } from "@/core/entities/_entities/leads/components/LeadCard";
import { useLeadMutations } from "@/core/entities/_entities/leads/hooks/useLeadMutations";
import { useLeads } from "@/core/entities/_entities/leads/hooks/useLeads";
import { EntityListPage } from "@/core/entities/scaffolds/EntityListPage";
import { EntityCard } from "@/core/entities/shared/components/EntityCard";
import { getStatusColor } from "@/core/entities/shared/config/defaults";
import {
	useRevertContactToLead,
	useSoftDeleteContact,
	useUpdateLead,
} from "@/core/entities/shared/hooks/useEntityMutations";
import { useEntityTagsMap } from "@/core/entities/shared/hooks/useEntityTagsMap";
import type { PrimaryActionConfig } from "@/core/shell/shared/entity-layout";
import { useCurrentOrg, useOrgMembers } from "@/core/shell/shared/hooks/useCurrentOrg";
import { useEntityLabels } from "@/core/shell/shared/hooks/useEntityLabels";
import { useOrgPermission } from "@/features/orgs/hooks/useOrgPermission";
import { normalizeError, normalizeErrorDescription } from "@/lib/normalizeError";

type ProfileRow = Record<string, unknown> & {
	id: string;
	role: "lead" | "contact";
	personCode?: string;
	displayName: string;
	email?: string;
	phone?: string;
	status?: string;
	source?: string;
	assignedTo?: Id<"users">;
	updatedAt?: number;
	leadId?: Id<"leads">;
	contactId?: Id<"contacts">;
	orgId?: Id<"orgs">;
};

const PROFILE_COLUMNS: KanbanColumnConfig[] = [
	{ id: "lead", title: "Leads", color: getStatusColor("lead", "qualified") },
	{ id: "contact", title: "Contacts", color: getStatusColor("contact", "assigned") },
];

/**
 * Default card fields for the profiles board. Without this, EntityCard's
 * `effectiveFields` is empty and nothing renders (the card shows only the
 * name). This mirrors what LeadsView/ContactsView compute from
 * `useEntityFields` but as a static list — the profiles page doesn't need
 * the full view-options machinery.
 */
const PROFILE_CARD_FIELDS = [
	"displayName",
	"email",
	"tags",
	"personCode",
	"assignedTo",
	"aiSummary",
];

const PROFILE_SEARCH_FIELDS: ReadonlyArray<keyof ProfileRow> = [
	"displayName",
	"email",
	"phone",
	"personCode",
	"status",
	"source",
];

export function ProfilesView({ orgSlug: _orgSlug }: { orgSlug: string }) {
	const labels = useEntityLabels();
	const { orgId, fullOrgEntry } = useCurrentOrg();

	// ── Data ─────────────────────────────────────────────────────────
	const { items: leadsRaw } = useLeads();
	const contactsRaw = useQuery(
		api.crm.entities.contacts.queries.list,
		orgId ? { orgId } : "skip",
	);

	const leads: ProfileRow[] = useMemo(
		() =>
			(leadsRaw ?? [])
				// Hide converted leads — they're now contacts in the right column.
				.filter((l) => !l.convertedAt && l.status !== "converted")
				.map((l) => ({
					...(l as Record<string, unknown>),
					id: l._id as string,
					role: "lead" as const,
					orgId,
				})) as ProfileRow[],
		[leadsRaw, orgId],
	);

	const contacts: ProfileRow[] = useMemo(
		() =>
			(contactsRaw ?? [])
				.map((c) => ({
					...(c as Record<string, unknown>),
					id: c._id as string,
					role: "contact" as const,
					orgId,
				}))
				// Newest first — read `_creationTime` from the spread row.
				.sort((a, b) => {
					const at = (a as { _creationTime?: number })._creationTime ?? 0;
					const bt = (b as { _creationTime?: number })._creationTime ?? 0;
					return bt - at;
				}) as ProfileRow[],
		[contactsRaw, orgId],
	);

	// ── Mutations ────────────────────────────────────────────────────
	const { create, convert, remove } = useLeadMutations(orgId);
	const updateLead = useUpdateLead();
	const revertToLead = useRevertContactToLead();
	const softDeleteContact = useSoftDeleteContact();
	const canConvert = useOrgPermission(orgId, "leads.convert");

	// ── Toolbar state ────────────────────────────────────────────────
	const [search, setSearch] = useState("");
	const [view, setView] = useState<"board">("board"); // boards-only per spec
	const [addOpen, setAddOpen] = useState(false);
	const [convertOpen, setConvertOpen] = useState(false);
	const [convertIds, setConvertIds] = useState<Id<"leads">[]>([]);
	const [editLeadOpen, setEditLeadOpen] = useState(false);
	const [editingLead, setEditingLead] = useState<Doc<"leads"> | null>(null);
	const [editContactOpen, setEditContactOpen] = useState(false);
	const [editingContact, setEditingContact] = useState<Doc<"contacts"> | null>(null);

	const openConvertFor = useCallback((leadIds: Id<"leads">[]) => {
		setConvertIds(leadIds);
		setConvertOpen(true);
	}, []);

	// ── Org-level fallbacks ──────────────────────────────────────────
	const org = fullOrgEntry?.org;
	const staleness = useMemo(
		() => ({
			staleAfterDays: org?.settings?.leadStaleAfterDays,
			warningAfterDays: undefined,
		}),
		[org?.settings?.leadStaleAfterDays],
	);

	// ── Per-card data (batched) ──────────────────────────────────────
	const { tagsByEntityId: leadTagsById } = useEntityTagsMap(orgId, "lead");
	const { tagsByEntityId: contactTagsById } = useEntityTagsMap(orgId, "contact");

	const members = useOrgMembers();
	const memberNameById = useMemo(() => {
		const m = new Map<string, string>();
		for (const mem of members ?? []) {
			m.set(
				mem.userId as string,
				mem.user?.name ?? mem.user?.email ?? (mem.userId as string),
			);
		}
		return m;
	}, [members]);

	const resolveReplacementLabel = useCallback(
		(fieldName: string, raw: string): string | undefined => {
			if (fieldName === "assignedTo") return memberNameById.get(raw);
			return undefined;
		},
		[memberNameById],
	);

	// ── Filter by search query ───────────────────────────────────────
	const matches = useCallback(
		(row: ProfileRow): boolean => {
			if (!search.trim()) return true;
			const needle = search.trim().toLowerCase();
			return PROFILE_SEARCH_FIELDS.some((f) => {
				const v = row[f];
				return typeof v === "string" && v.toLowerCase().includes(needle);
			});
		},
		[search],
	);

	const itemsByColumnId = useMemo<Record<string, ProfileRow[]>>(
		() => ({
			lead: leads.filter(matches),
			contact: contacts.filter(matches),
		}),
		[leads, contacts, matches],
	);

	const allItems = useMemo<ProfileRow[]>(
		() => [...itemsByColumnId.lead, ...itemsByColumnId.contact],
		[itemsByColumnId],
	);

	// ── Handlers ─────────────────────────────────────────────────────
	const handleInstantConvert = useCallback(
		async (leadId: Id<"leads">) => {
			try {
				await convert(leadId);
				toast.success(
					`${labels.lead.singular} converted to ${labels.contact.singular.toLowerCase()}`,
				);
			} catch (err) {
				toast.error("Convert failed", {
					description: normalizeErrorDescription(err),
				});
			}
		},
		[convert, labels],
	);

	const handleDeleteLead = useCallback(
		async (leadId: Id<"leads">) => {
			try {
				await remove(leadId);
			} catch (err) {
				toast.error(normalizeError(err, "Couldn't delete"));
			}
		},
		[remove],
	);

	const handleMarkLost = useCallback(
		async (leadId: Id<"leads">) => {
			if (!orgId) return;
			try {
				await updateLead({ orgId, leadId, status: "lost" });
				toast.success(`${labels.lead.singular} marked as lost`);
			} catch (err) {
				toast.error(normalizeError(err, "Couldn't mark as lost"));
			}
		},
		[orgId, updateLead, labels],
	);

	const handleRevertContact = useCallback(
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

	const handleDeleteContact = useCallback(
		async (contactId: Id<"contacts">) => {
			if (!orgId) return;
			try {
				await softDeleteContact({ orgId, contactId });
				toast.success("Contact deleted");
			} catch (err) {
				toast.error(normalizeError(err, "Couldn't delete"));
			}
		},
		[orgId, softDeleteContact],
	);

	// ── Primary action: Add Lead ────────────────────────────────────
	const primaryAction: PrimaryActionConfig = {
		label: `Add ${labels.lead.singular}`,
		icon: PlusIcon,
		permission: "leads.create",
		onClick: () => setAddOpen(true),
	};

	// ── Card renderer (dispatches by row.role) ──────────────────────
	const renderCard = useCallback(
		(item: ProfileRow, isDragging: boolean) => {
			if (item.role === "lead") {
				const leadId = item._id as Id<"leads">;
				return (
					<LeadCard
						key={item.id}
						item={
							{
								...item,
								orgId,
							} as unknown as Parameters<typeof LeadCard>[0]["item"]
						}
						cardFields={PROFILE_CARD_FIELDS}
						staleness={staleness}
						isDragging={isDragging}
						resolveReplacementLabel={resolveReplacementLabel}
						prefetchedTags={leadTagsById[item.id] ?? []}
						onConvert={() => handleInstantConvert(leadId)}
						onConvertWithOptions={() => openConvertFor([leadId])}
						onDelete={() => handleDeleteLead(leadId)}
						onMarkLost={() => handleMarkLost(leadId)}
						onEdit={() => {
							setEditingLead(item as unknown as Doc<"leads">);
							setEditLeadOpen(true);
						}}
					/>
				);
			}

			// Contact card — render via shared EntityCard with same parity as ContactsView.
			const contactId = item._id as Id<"contacts">;
			const menuItems: Array<{
				label: string;
				icon: typeof PencilIcon;
				onSelect: () => void;
				variant?: "default" | "destructive";
				separatorBefore?: boolean;
			}> = [
				{
					label: "Edit",
					icon: PencilIcon,
					onSelect: () => {
						setEditingContact(item as unknown as Doc<"contacts">);
						setEditContactOpen(true);
					},
				},
			];
			if (item.leadId && canConvert === true) {
				menuItems.push({
					label: `Revert to ${labels.lead.singular.toLowerCase()}`,
					icon: ArrowRightCircleIcon,
					onSelect: () => handleRevertContact(contactId),
				});
			}
			menuItems.push({
				label: "Delete",
				icon: Trash2Icon,
				onSelect: () => handleDeleteContact(contactId),
				variant: "destructive",
				separatorBefore: true,
			});

			return (
				<EntityCard
					key={item.id}
					slot="contact"
					item={item as unknown as Parameters<typeof EntityCard>[0]["item"]}
					cardFields={PROFILE_CARD_FIELDS}
					isDragging={isDragging}
					menuItems={menuItems}
					prefetchedTags={contactTagsById[item.id] ?? []}
					resolveReplacementLabel={resolveReplacementLabel}
				/>
			);
		},
		[
			orgId,
			staleness,
			resolveReplacementLabel,
			leadTagsById,
			contactTagsById,
			handleInstantConvert,
			openConvertFor,
			handleDeleteLead,
			handleMarkLost,
			canConvert,
			labels,
			handleRevertContact,
			handleDeleteContact,
		],
	);

	// ProfilesView is board-only — drag mutations would require lead↔contact
	// table swaps that don't fit the EntityListPage onCardMove signature.
	// We supply a no-op so the kanban primitive still boots; users convert
	// via the LeadCard's + shortcut instead of dragging.
	const onCardMove = useCallback(async () => {
		toast.info(
			`Use the convert shortcut on a ${labels.lead.singular.toLowerCase()} to move it to ${labels.contact.plural.toLowerCase()}.`,
		);
	}, [labels]);

	return (
		<>
			<EntityListPage
				slot="lead"
				items={allItems}
				columns={[]} /* board-only */
				views={["board"]}
				view={view}
				onViewChange={(v) => setView(v as "board")}
				primaryAction={primaryAction}
				orgId={orgId}
				search={{
					value: search,
					onChange: setSearch,
					placeholder: `Search profiles…`,
				}}
				boardColumns={PROFILE_COLUMNS}
				itemsByColumnId={itemsByColumnId}
				renderCard={renderCard}
				onCardMove={onCardMove}
				emptyTitle="No profiles yet"
				emptyDescription={`Create your first ${labels.lead.singular.toLowerCase()} or convert one to a ${labels.contact.singular.toLowerCase()}.`}
			/>

			<AddLeadDrawer
				open={addOpen}
				onOpenChange={setAddOpen}
				orgId={orgId}
				onCreate={create}
			/>

			<ConvertLeadDrawer
				open={convertOpen}
				onOpenChange={(v) => {
					setConvertOpen(v);
					if (!v) setConvertIds([]);
				}}
				orgId={orgId}
				leadIds={convertIds}
				onConvert={(leadId) => convert(leadId)}
			/>

			<EditLeadDrawer
				open={editLeadOpen}
				onOpenChange={(v) => {
					setEditLeadOpen(v);
					if (!v) setEditingLead(null);
				}}
				orgId={orgId}
				lead={editingLead}
			/>

			<EditContactDrawer
				open={editContactOpen}
				onOpenChange={(v) => {
					setEditContactOpen(v);
					if (!v) setEditingContact(null);
				}}
				orgId={orgId}
				contact={editingContact}
			/>
		</>
	);
}
