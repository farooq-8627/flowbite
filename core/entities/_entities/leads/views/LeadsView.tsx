"use client";

/**
 * LeadsView — scaffold-driven leads list + board view.
 *
 * - Primary action: Add Lead (convert is a per-row action).
 * - Dynamic board grouping — status (default) / assignee / source / tag.
 *   When grouping by a non-status field, the card auto-hides that field and
 *   surfaces a complementary one so the user still sees status etc.
 * - Selection toolbar above DataTable for bulk convert.
 * - Board drag updates whichever field the board is grouped by (status,
 *   assignedTo, source, …) — no more "drag did nothing" when the grouping
 *   axis wasn't status.
 * - Single-click a card's convert shortcut → instant convert (no form).
 * - Double-click the convert shortcut → open convert drawer (with deal option).
 * - Lost shortcut (trash icon) → marks lead as lost.
 *
 * View-options PERSISTENCE: every per-session knob (cardFields, revealed
 * statuses, board groupBy axis) is mirrored to localStorage via
 * `usePersistedState`. The state survives navigation and reload — the user
 * decides when to change it; we never silently reset.
 *
 * Search:
 *   - Wired into EntityPageLayout's toolbar search.
 *   - Matching cards move to the TOP of their column.
 *   - Briefly flash-highlighted so they're easy to spot.
 */

import { useMutation, useQuery } from "convex/react";
import { ArrowRightCircleIcon, PencilIcon, PlusIcon, XIcon } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { DropdownMenuItem } from "@/components/ui/dropdown-menu";
import { FirstTimeTour, type TourStep } from "@/components/ui/first-time-tour";
import { api } from "@/convex/_generated/api";
import type { Doc, Id } from "@/convex/_generated/dataModel";
import type { KanbanColumnConfig } from "@/core/data-display/kanban/components/KanbanBoard";
import { EntityListPage } from "@/core/entities/scaffolds/EntityListPage";
import type { PrimaryActionConfig } from "@/core/entities/scaffolds/EntityPageLayout";
import { ViewOptionsMenu } from "@/core/entities/shared/components/ViewOptionsMenu";
import { getStatusColor, LEAD_STATUSES } from "@/core/entities/shared/config/defaults";
import { useEntityColumns } from "@/core/entities/shared/hooks/useEntityColumns";
import { useEntityFields } from "@/core/entities/shared/hooks/useEntityFields";
import { useEntityFieldValuesMap } from "@/core/entities/shared/hooks/useEntityFieldValuesMap";
import { useEntityTagsMap } from "@/core/entities/shared/hooks/useEntityTagsMap";
import { useModuleDisplay } from "@/core/entities/shared/hooks/useModuleDisplay";
import { useViewToggle } from "@/core/entities/shared/hooks/useViewToggle";
import {
	getHiddenCardFieldsForGrouping,
	getRevealedCardFieldForGrouping,
	NO_GROUP_KEY,
} from "@/core/entities/shared/utils/board-grouping";
import { rankBySearch, type SearchableItem } from "@/core/entities/shared/utils/search";
import { useEntityLabels } from "@/core/shell/shared/hooks/useEntityLabels";
import { useQuickAddListener } from "@/core/shell/shell/components/QuickAddMenu";
import { usePersistedState } from "@/lib/hooks/use-persisted-state";
import { matchesShortcut, useShortcut } from "@/stores/shortcuts/shortcuts-store";
import { AddLeadDrawer } from "../components/AddLeadDrawer";
import { ConvertLeadDrawer } from "../components/ConvertLeadDrawer";
import { EditLeadDrawer } from "../components/EditLeadDrawer";
import { LeadCard } from "../components/LeadCard";
import { useLeadMutations } from "../hooks/useLeadMutations";
import { useLeads } from "../hooks/useLeads";

// Terminal statuses hidden by default on the board (too noisy otherwise).
const HIDDEN_LEAD_STATUSES: string[] = ["converted", "lost"];

// Lead fields to match against when searching.
const LEAD_SEARCH_FIELDS = [
	"displayName",
	"email",
	"phone",
	"personCode",
	"status",
	"source",
] as const;

/**
 * One-time coachmarks that play the first time a user sees the leads board.
 * Each step's `target` is matched against `data-tour="…"` on a DOM node.
 *
 * SCOPE: per-entity. The `id` carries the entity slug (`leads-board-v2`) so
 * the contacts board / deals board / companies board run their own tours
 * even on the same device. Adding view-options + lost-button steps bumped
 * the version from v1 → v2 so users see the updated walkthrough.
 *
 * Bump the id again when the steps change meaningfully.
 */
const LEADS_BOARD_TOUR_STEPS: TourStep[] = [
	{
		target: "lead-card-convert",
		title: "Convert with one click",
		body: "Click the + on a card to instantly convert the lead into a contact. Double-click to open the full convert form with the deal option.",
		side: "top",
	},
	{
		target: "lead-card-lost",
		title: "Mark a lead as lost",
		body: "The trash icon flags the lead as lost without deleting it — the record stays in the audit trail and can be unhidden from view options.",
		side: "top",
	},
	{
		target: "lead-card-grip",
		title: "Drag to change status",
		body: "Grab the grip on the right edge of any card and drop it onto a different column to update its status.",
		side: "start",
	},
	{
		target: "view-options-trigger",
		title: "Tune what you see",
		body: "Pick which fields appear on cards, swap the group-by axis, and reveal hidden columns like Converted or Lost.",
		side: "bottom",
	},
];

export function LeadsView(_props: { orgSlug: string }) {
	const labels = useEntityLabels();
	const { items, orgId } = useLeads();
	const [view, setView] = useViewToggle("lead");
	const { boardGroupBy: defaultGroupBy } = useModuleDisplay("lead");
	const { visibleFields } = useEntityFields("lead", orgId);
	const defaultCardFields = useMemo(() => visibleFields.map((f) => f.name), [visibleFields]);
	const { create, convert, remove } = useLeadMutations(orgId);
	const updateLead = useMutation(api.crm.entities.leads.mutations.update).withOptimisticUpdate(
		(store, args) => {
			const list = store.getQuery(api.crm.entities.leads.queries.list, { orgId: args.orgId });
			if (!list) return;
			const now = Date.now();
			const next = list.map((l) =>
				l._id === args.leadId ? { ...l, ...args, updatedAt: now } : l,
			);
			store.setQuery(api.crm.entities.leads.queries.list, { orgId: args.orgId }, next);
		},
	);

	// Org-level staleness thresholds (falls back gracefully when not configured)
	const org = useQuery(api.orgs.queries.get, orgId ? { orgId } : "skip");
	const staleness = useMemo(
		() => ({
			staleAfterDays: org?.settings?.leadStaleAfterDays,
			warningAfterDays: org?.settings?.reminderDefaults?.staleAlertDays,
		}),
		[org?.settings?.leadStaleAfterDays, org?.settings?.reminderDefaults?.staleAlertDays],
	);

	const [addOpen, setAddOpen] = useState(false);
	const [convertOpen, setConvertOpen] = useState(false);
	const [convertIds, setConvertIds] = useState<Id<"leads">[]>([]);
	const [editOpen, setEditOpen] = useState(false);
	const [editingLead, setEditingLead] = useState<NonNullable<typeof items>[number] | null>(null);
	const [search, setSearch] = useState("");

	// Persisted view-options — survive navigation. Keyed by slot so each
	// entity has its own persisted preferences (board fields for leads, board
	// fields for contacts, etc.).
	const [cardFields, setCardFields] = usePersistedState<string[]>("viewopts:lead:cardFields", []);
	const [revealedStatuses, setRevealedStatuses] = usePersistedState<string[]>(
		"viewopts:lead:revealedStatuses",
		[],
	);
	const [groupBy, setGroupBy] = usePersistedState<string>(
		"viewopts:lead:groupBy",
		defaultGroupBy,
	);

	// All field metadata now flows through useEntityFields → useEntityColumns;
	// view-options surfaces the same canonical list. No "extras" concept.
	const { valuesByEntityId: customValuesByEntityId } = useEntityFieldValuesMap("lead", orgId);

	// Seed cardFields from settings on first load. After hydration, treat the
	// user's saved selection as canonical — but always keep it pruned to the
	// CURRENT visible-field set (admin-hidden fields drop out automatically).
	useEffect(() => {
		setCardFields((prev) => {
			if (!prev || prev.length === 0) return defaultCardFields;
			const allowed = new Set(defaultCardFields);
			const next = prev.filter((f) => allowed.has(f));
			return next.length === prev.length ? prev : next;
		});
	}, [defaultCardFields, setCardFields]);

	// ⌘⇧V toggles list/board
	const scToggle = useShortcut("toggleView");
	useEffect(() => {
		function handler(e: KeyboardEvent) {
			if (matchesShortcut(e, scToggle)) {
				e.preventDefault();
				setView(view === "list" ? "board" : "list");
			}
		}
		document.addEventListener("keydown", handler);
		return () => document.removeEventListener("keydown", handler);
	}, [view, setView, scToggle]);

	const openConvertFor = useCallback((leadIds: Id<"leads">[]) => {
		setConvertIds(leadIds);
		setConvertOpen(true);
	}, []);

	// Global quick-add listeners (TopNav + button)
	useQuickAddListener("create-lead", () => setAddOpen(true));
	useQuickAddListener("convert-lead", () => {
		const firstId = items?.[0]?.id as Id<"leads"> | undefined;
		if (firstId) openConvertFor([firstId]);
	});

	// Batched tag lookup — used for both the tag column in the table and
	// for board grouping by tag. One index read covers every lead in the org.
	const { tagsByEntityId, uniqueTags } = useEntityTagsMap(orgId, "lead");

	const { columns } = useEntityColumns<NonNullable<typeof items>[number]>("lead", orgId, {
		customValuesByEntityId,
		tagsByEntityId,
		onDelete: async (row) => {
			try {
				await remove(row.id as Id<"leads">);
			} catch (err) {
				toast.error(err instanceof Error ? err.message : "Couldn't delete");
			}
		},
		rowExtraActions: (row) => (
			<>
				<DropdownMenuItem
					onClick={() => {
						const found = leadLookup.get(row.id);
						if (found) {
							setEditingLead(found);
							setEditOpen(true);
						}
					}}
				>
					<PencilIcon className="me-2 size-4" />
					Edit
				</DropdownMenuItem>
				<DropdownMenuItem onClick={() => openConvertFor([row.id as Id<"leads">])}>
					<ArrowRightCircleIcon className="me-2 size-4" />
					Convert
				</DropdownMenuItem>
			</>
		),
	});

	// ── Dynamic board grouping ───────────────────────────────────────────────
	// Visible columns depend on the active `groupBy`:
	//   - status    → LEAD_STATUSES + any in-use terminal statuses the user revealed
	//   - assignedTo→ one per unique assignee (plus "Unassigned")
	//   - source    → LEAD_SOURCES + any in-use values
	//   - tag       → one per unique tag (+ "Untagged")
	//   - default   → one column per unique raw value of the field
	const members = useQuery(api.orgs.queries.listMembers, orgId ? { orgId } : "skip");
	const memberNameById = useMemo(() => {
		const map = new Map<string, string>();
		for (const m of members ?? []) {
			map.set(m.userId as string, m.user?.name ?? m.user?.email ?? (m.userId as string));
		}
		return map;
	}, [members]);

	const boardColumns: KanbanColumnConfig[] = useMemo(() => {
		if (groupBy === "status") {
			const statusesInItems = new Set<string>();
			for (const it of items ?? [])
				statusesInItems.add(String((it as Record<string, unknown>).status ?? "new"));
			const union: string[] = [];
			const seen = new Set<string>();
			for (const s of LEAD_STATUSES) {
				union.push(s);
				seen.add(s);
			}
			for (const s of statusesInItems) if (!seen.has(s)) union.push(s);
			const visible = union.filter((s) => {
				if (!HIDDEN_LEAD_STATUSES.includes(s)) return true;
				if (revealedStatuses.includes(s)) return true;
				// Hidden by default, not revealed → hide the column even if items
				// exist in this status. (Items get bucketed but never rendered,
				// so they reappear the moment the user toggles the status on.)
				return false;
			});
			return visible.map((s) => ({
				id: s,
				title: s,
				color: getStatusColor("lead", s),
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
				color: getStatusColor("lead", a === NO_GROUP_KEY ? "unassigned" : "assigned"),
			}));
		}

		if (groupBy === "tag" || groupBy === "tags") {
			// One column per tag, plus an "Untagged" bucket at the end.
			const cols: KanbanColumnConfig[] = uniqueTags.map((t) => ({
				id: t.name,
				title: t.name,
				color: (t.color as string | undefined) ?? getStatusColor("lead", t.name),
			}));
			cols.push({
				id: NO_GROUP_KEY,
				title: "Untagged",
				color: getStatusColor("lead", "unassigned"),
			});
			return cols;
		}

		// Generic fallback — unique raw values of the field.
		const values = new Set<string>();
		for (const it of items ?? []) {
			const raw = (it as Record<string, unknown>)[groupBy];
			values.add(raw ? String(raw) : NO_GROUP_KEY);
		}
		return Array.from(values).map((v) => ({
			id: v,
			title: v === NO_GROUP_KEY ? "—" : v,
			color: getStatusColor("lead", v),
		}));
	}, [groupBy, items, revealedStatuses, memberNameById, uniqueTags]);

	// Search ranking
	const rankedItems = useMemo(
		() =>
			rankBySearch(
				(items ?? []) as SearchableItem[],
				search,
				LEAD_SEARCH_FIELDS as unknown as string[],
			),
		[items, search],
	);
	const [flashEpoch, setFlashEpoch] = useState(0);
	useEffect(() => {
		if (!search) return;
		setFlashEpoch((e) => e + 1);
	}, [search]);

	const itemsByColumnId = useMemo(() => {
		const grouped: Record<string, typeof rankedItems.items> = {};
		for (const col of boardColumns) grouped[col.id] = [];

		if (groupBy === "tag" || groupBy === "tags") {
			// Fan out: one item can appear in many tag columns. Items with no
			// tags fall into the "Untagged" (NO_GROUP_KEY) bucket.
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

	// Drag card → update whichever field is the current groupBy
	const handleCardMove = useCallback(
		async (itemId: string, _from: string, to: string) => {
			if (!orgId) return;
			try {
				if (groupBy === "status") {
					await updateLead({ orgId, leadId: itemId as Id<"leads">, status: to });
				} else if (groupBy === "assignedTo") {
					await updateLead({
						orgId,
						leadId: itemId as Id<"leads">,
						assignedTo: to === NO_GROUP_KEY ? undefined : (to as Id<"users">),
					});
				} else if (groupBy === "source") {
					await updateLead({ orgId, leadId: itemId as Id<"leads">, source: to });
				}
				// Unknown/custom groupBy — no-op (drag is visual only).
			} catch (err) {
				toast.error("Couldn't update", {
					description: err instanceof Error ? err.message : undefined,
				});
			}
		},
		[orgId, updateLead, groupBy],
	);

	const leadLookup = useMemo(() => {
		type LeadItem = NonNullable<typeof items>[number];
		const m = new Map<string, LeadItem>();
		for (const it of items ?? []) m.set(it.id, it);
		return m;
	}, [items]);

	const primaryAction: PrimaryActionConfig = {
		label: `Add ${labels.lead.singular}`,
		icon: PlusIcon,
		permission: "leads.create",
		onClick: () => setAddOpen(true),
	};

	const handleDelete = async (leadId: Id<"leads">) => {
		try {
			await remove(leadId);
		} catch (err) {
			toast.error(err instanceof Error ? err.message : "Couldn't delete");
		}
	};

	const handleMarkLost = async (leadId: Id<"leads">) => {
		if (!orgId) return;
		try {
			await updateLead({ orgId, leadId, status: "lost" });
			toast.success(`${labels.lead.singular} marked as lost`);
		} catch (err) {
			toast.error(err instanceof Error ? err.message : "Couldn't mark as lost");
		}
	};

	// Single-click convert = instant (no form); double-click = open drawer
	const handleInstantConvert = useCallback(
		async (leadId: Id<"leads">) => {
			try {
				await convert(leadId);
				toast.success(
					`${labels.lead.singular} converted to ${labels.contact.singular.toLowerCase()}`,
				);
			} catch (err) {
				toast.error("Convert failed", {
					description: err instanceof Error ? err.message : undefined,
				});
			}
		},
		[convert, labels],
	);

	// Derive what card fields to show given the active groupBy — hide the
	// grouped-by field, and reveal a complementary one from the reveal matrix.
	const effectiveCardFields = useMemo(() => {
		const hidden = new Set(getHiddenCardFieldsForGrouping(groupBy));
		let next = cardFields.filter((f) => !hidden.has(f));
		const reveal = getRevealedCardFieldForGrouping(groupBy, "lead");
		if (reveal && !next.includes(reveal)) next = [reveal, ...next];
		return next;
	}, [cardFields, groupBy]);

	// Highlighted field defs — every visible non-pinned custom field with a
	// kind/type useful enough to render as a chip. EntityCard caps the actual
	// chip count at 3 so admins can flag whichever fields matter to them via
	// `cardFields`; the user's per-session toggle still respects their choice.
	const highlightFieldDefs = useMemo(
		() =>
			visibleFields.map((f) => ({
				name: f.name,
				label: f.label,
				kind: f.kind,
				type: f.type,
			})),
		[visibleFields],
	);

	return (
		<>
			<EntityListPage
				slot="lead"
				items={rankedItems.items as typeof items}
				columns={columns as never}
				views={["list", "board"]}
				view={view}
				onViewChange={setView}
				primaryAction={primaryAction}
				orgId={orgId}
				search={{
					value: search,
					onChange: setSearch,
					placeholder: `Search ${labels.lead.plural.toLowerCase()}…`,
				}}
				renderToolbarExtras={() =>
					view === "board" ? (
						<ViewOptionsMenu
							slot="lead"
							orgId={orgId}
							view={view}
							visibleFields={cardFields}
							onVisibleFieldsChange={setCardFields}
							groupBy={groupBy}
							onGroupByChange={setGroupBy}
							allStatuses={[...LEAD_STATUSES]}
							hiddenStatuses={HIDDEN_LEAD_STATUSES}
							revealedStatuses={revealedStatuses}
							onRevealedStatusesChange={setRevealedStatuses}
						/>
					) : null
				}
				aboveBody={(table) => {
					const selectedRows = table.getFilteredSelectedRowModel().rows;
					if (selectedRows.length === 0) return null;
					const selectedIds = selectedRows.map((r) => r.original.id as Id<"leads">);
					return (
						<div className="flex items-center justify-between gap-2 rounded-[var(--radius)] border bg-muted/40 px-3 py-1.5 text-xs">
							<span className="text-muted-foreground">
								{selectedIds.length} {labels.lead.plural.toLowerCase()} selected
							</span>
							<div className="flex items-center gap-1.5">
								<Button
									size="sm"
									className="h-7 text-xs"
									onClick={() => openConvertFor(selectedIds)}
								>
									Convert to {labels.contact.singular.toLowerCase()}
								</Button>
								<Button
									size="icon"
									variant="ghost"
									className="size-7"
									onClick={() => table.resetRowSelection()}
									aria-label="Clear selection"
								>
									<XIcon className="size-3.5" />
								</Button>
							</div>
						</div>
					);
				}}
				boardColumns={boardColumns}
				itemsByColumnId={itemsByColumnId}
				renderCard={(item, isDragging) => (
					<LeadCard
						key={item.id}
						item={
							{
								...(item as Record<string, unknown>),
								orgId,
							} as unknown as Parameters<typeof LeadCard>[0]["item"]
						}
						cardFields={effectiveCardFields}
						highlightFieldDefs={highlightFieldDefs}
						customFieldValues={customValuesByEntityId[item.id]}
						staleness={staleness}
						isDragging={isDragging}
						isHighlighted={search ? rankedItems.matchedIds.has(item.id) : false}
						highlightEpoch={flashEpoch}
						onConvert={() => handleInstantConvert(item.id as Id<"leads">)}
						onConvertWithOptions={() => openConvertFor([item.id as Id<"leads">])}
						onDelete={() => handleDelete(item.id as Id<"leads">)}
						onMarkLost={() => handleMarkLost(item.id as Id<"leads">)}
						onEdit={() => {
							const lead = leadLookup.get(item.id);
							if (lead) {
								setEditingLead(lead);
								setEditOpen(true);
							}
						}}
					/>
				)}
				onCardMove={handleCardMove}
				emptyTitle={`No ${labels.lead.plural.toLowerCase()} yet`}
				emptyDescription={`Create your first ${labels.lead.singular.toLowerCase()} to get started.`}
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
				open={editOpen}
				onOpenChange={(v) => {
					setEditOpen(v);
					if (!v) setEditingLead(null);
				}}
				orgId={orgId}
				lead={editingLead as unknown as Doc<"leads"> | null}
			/>

			{/* First-time coachmarks for the leads board. Fires once per device. */}
			{view === "board" && (rankedItems.items?.length ?? 0) > 0 && (
				<FirstTimeTour id="leads-board-v2" steps={LEADS_BOARD_TOUR_STEPS} />
			)}
		</>
	);
}

export function LeadDetailView({ orgSlug, leadId }: { orgSlug: string; leadId: string }) {
	const labels = useEntityLabels();
	return (
		<div
			data-org={orgSlug}
			data-id={leadId}
			data-entity="lead"
			className="flex h-full items-center justify-center text-sm text-muted-foreground"
		>
			{labels.lead.singular} detail — coming in Slice 2
		</div>
	);
}
