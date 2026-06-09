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

import { ArrowRightCircleIcon, PencilIcon, PlusIcon, XIcon } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { DropdownMenuItem } from "@/components/ui/dropdown-menu";
import type { Doc, Id } from "@/convex/_generated/dataModel";
import type { KanbanColumnConfig } from "@/core/data-display/kanban/components/KanbanBoard";
import { usePersistedColumnOrder } from "@/core/data-display/kanban/hooks/usePersistedColumnOrder";
import { computeSortOrderForDrop } from "@/core/data-display/kanban/utils/sort-order";
import { EntityListPage } from "@/core/entities/scaffolds/EntityListPage";
import { ViewOptionsMenu } from "@/core/entities/shared/components/ViewOptionsMenu";
import { getStatusColor, LEAD_STATUSES } from "@/core/entities/shared/config/defaults";
import { useCompaniesByPersonCodes } from "@/core/entities/shared/hooks/useCompaniesByPersonCodes";
import { useEntityColumns } from "@/core/entities/shared/hooks/useEntityColumns";
import { useEntityFields } from "@/core/entities/shared/hooks/useEntityFields";
import { useEntityFieldValuesMap } from "@/core/entities/shared/hooks/useEntityFieldValuesMap";
import {
	useAttachTagToEntity,
	useDetachTagFromEntity,
	useUpdateLead,
} from "@/core/entities/shared/hooks/useEntityMutations";
import { useEntityTagsMap } from "@/core/entities/shared/hooks/useEntityTagsMap";
import { useModuleDisplay } from "@/core/entities/shared/hooks/useModuleDisplay";
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
import { usePersistedState } from "@/lib/hooks/use-persisted-state";
import { normalizeError, normalizeErrorDescription } from "@/lib/normalizeError";
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

export function LeadsView(_props: { orgSlug: string }) {
	const labels = useEntityLabels();
	const { items, orgId } = useLeads();
	const [view, setView] = useViewToggle("lead");
	const { boardGroupBy: defaultGroupBy } = useModuleDisplay("lead");
	const { visibleFields } = useEntityFields("lead", orgId);
	const defaultCardFields = useMemo(() => visibleFields.map((f) => f.name), [visibleFields]);
	const { create, convert, remove } = useLeadMutations(orgId);
	// Centralized — see `core/entities/shared/hooks/useEntityMutations.ts`
	// for the optimistic update implementation. Wired across LeadsView,
	// EditLeadDrawer, and InlineFieldEdit so every lead update flows
	// through the same patch path.
	const updateLead = useUpdateLead();

	// Org-level staleness thresholds (falls back gracefully when not configured)
	// Read from shared OrgProvider context — no extra `orgs.get` subscription.
	const { fullOrgEntry } = useCurrentOrg();
	const org = fullOrgEntry?.org;
	const staleness = useMemo(
		() => ({
			staleAfterDays: org?.settings?.leadStaleAfterDays,
			warningAfterDays: undefined,
		}),
		[org?.settings?.leadStaleAfterDays],
	);

	const [addOpen, setAddOpen] = useState(false);
	const [convertOpen, setConvertOpen] = useState(false);
	const [convertIds, setConvertIds] = useState<Id<"leads">[]>([]);
	const [editOpen, setEditOpen] = useState(false);
	const [editingLead, setEditingLead] = useState<NonNullable<typeof items>[number] | null>(null);
	const [pendingDelete, setPendingDelete] = useState<{ id: string; name: string } | null>(null);
	const [search, setSearch] = useState("");

	// Persisted view-options — survive navigation. Keyed by slot so each
	// entity has its own persisted preferences (board fields for leads, board
	// fields for contacts, etc.).
	//
	// `cardFields` key is bumped to `v2` (2026-05-18) so old sessions that
	// expected the always-on built-in field strip get a fresh, default-seeded
	// list. Old `:cardFields` entries are simply ignored — we don't migrate
	// because the previous values are still semantically valid; we just
	// want a clean re-seed against the current admin-visible field set.
	const [cardFields, setCardFields] = usePersistedState<string[]>(
		"viewopts:lead:cardFields:v2",
		[],
	);
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

	// Batched company lookup — eliminates per-row CompanyCell subscriptions.
	const personCodes = useMemo(
		() =>
			(items ?? [])
				.map((it) => (it as Record<string, unknown>).personCode as string)
				.filter(Boolean),
		[items],
	);
	const companiesByPersonCode = useCompaniesByPersonCodes(orgId, personCodes);

	const { columns } = useEntityColumns<NonNullable<typeof items>[number]>("lead", orgId, {
		customValuesByEntityId,
		tagsByEntityId,
		companiesByPersonCode,
		onDelete: async (row) => {
			const candidate = (row as unknown as { displayName?: unknown }).displayName;
			const name = typeof candidate === "string" ? candidate : labels.lead.singular;
			setPendingDelete({ id: row.id as string, name });
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
	const members = useOrgMembers();
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
			//
			// Column id MUST be the tag's `_id` (Convex Id), NOT the tag
			// `name`. The drag handler (`handleCardMove`) passes
			// `fromCol`/`toCol` as `tagId: Id<"tags">` to
			// `tags.attachToEntity` / `detachFromEntity`. Using the tag
			// name fails server validation
			// (`v.id("tags")` rejects "New", "Hot", etc.) — exactly the
			// `ArgumentValidationError: Path: .tagId Value: "New"` the
			// dashboard was throwing. Title stays as `name` for display.
			const cols: KanbanColumnConfig[] = uniqueTags.map((t) => ({
				id: t._id as string,
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

	// Per-user persisted column order. Survives reloads and locks the layout
	// the user picked until they drag again.
	const { orderedColumns: boardColumnsOrdered, onColumnReorder } = usePersistedColumnOrder(
		`lead:${groupBy}`,
		boardColumns,
	);

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
			//
			// Bucket key MUST match the column id, which is now `tag._id`
			// (Convex Id) so the drag handler can pass it straight through
			// to `tags.attachToEntity` / `detachFromEntity`.
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

		// Sort each column by sortOrder (asc) so dragged-to-position cards
		// show up exactly where the user dropped them. `rankBySearch`
		// already floats search matches to the top; we preserve that for
		// the matched IDs, then fall back to sortOrder for the rest.
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
	// Tag groupBy is a special case: tags live in a join table (`entityTags`),
	// so a column move means detach(fromTag) + attach(toTag). We do NOT also
	// detach all OTHER tags — a lead can carry multiple tags, and dragging
	// only changes whether THIS one is attached. The NO_GROUP_KEY column
	// represents "untagged"; dropping there detaches the source tag without
	// attaching anything new.
	const attachTag = useAttachTagToEntity();
	const detachTag = useDetachTagFromEntity();
	const handleCardMove = useCallback(
		async (itemId: string, fromCol: string, toCol: string, newIndex: number) => {
			if (!orgId) return;
			// Reconstruct the destination column AFTER the drop so we can
			// read the two cards on either side of `newIndex`. The kanban
			// primitive has already mutated its visible state via
			// `arrayMove`; we replicate that here without mutating React
			// state (purely for the neighbour lookup).
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

			// Compute the midpoint sortOrder so the card sticks at the
			// dropped position when the page re-renders from a fresh query
			// result.
			const sortOrder = computeSortOrderForDrop(
				itemsAfter as Array<{ id: string; sortOrder?: number; _creationTime?: number }>,
				newIndex,
			);

			try {
				const baseArgs = {
					orgId,
					leadId: itemId as Id<"leads">,
					sortOrder,
				};
				if (fromCol === toCol) {
					// In-column reorder — only sortOrder changes.
					await updateLead(baseArgs);
				} else if (groupBy === "status") {
					await updateLead({ ...baseArgs, status: toCol });
				} else if (groupBy === "assignedTo") {
					await updateLead({
						...baseArgs,
						assignedTo: toCol === NO_GROUP_KEY ? undefined : (toCol as Id<"users">),
					});
				} else if (groupBy === "source") {
					await updateLead({ ...baseArgs, source: toCol });
				} else if (groupBy === "tag" || groupBy === "tags") {
					// Tag move: persist position first (so the card sticks),
					// then mutate the join table. Detach from `fromCol` and
					// attach to `toCol`. NO_GROUP_KEY columns are virtual
					// (no tag id), so we skip the join mutation for them.
					await updateLead(baseArgs);
					if (fromCol !== NO_GROUP_KEY) {
						await detachTag({
							orgId,
							tagId: fromCol as Id<"tags">,
							entityType: "lead",
							entityId: itemId,
						});
					}
					if (toCol !== NO_GROUP_KEY) {
						await attachTag({
							orgId,
							tagId: toCol as Id<"tags">,
							entityType: "lead",
							entityId: itemId,
						});
					}
				} else {
					// Custom groupBy — only persist position, not the field.
					await updateLead(baseArgs);
				}
			} catch (err) {
				toast.error("Couldn't update", {
					description: normalizeErrorDescription(err),
				});
			}
		},
		[orgId, updateLead, groupBy, itemsByColumnId, rankedItems.items, attachTag, detachTag],
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

	// Lead deletion is funneled through the ConfirmDialog at the bottom
	// of the JSX. Both the LIST view's row kebab AND the BOARD view's
	// card kebab call this helper so the user always gets the same
	// "Delete X — moved to trash" confirmation modal. The actual
	// soft-delete fires inside the dialog's onConfirm handler.
	const handleDelete = (leadId: Id<"leads">) => {
		const lead = leadLookup.get(leadId);
		const candidate = (lead as unknown as { displayName?: unknown } | undefined)?.displayName;
		const name = typeof candidate === "string" ? candidate : labels.lead.singular;
		setPendingDelete({ id: leadId, name });
	};

	const handleMarkLost = async (leadId: Id<"leads">) => {
		if (!orgId) return;
		try {
			await updateLead({ orgId, leadId, status: "lost" });
			toast.success(`${labels.lead.singular} marked as lost`);
		} catch (err) {
			toast.error(normalizeError(err, "Couldn't mark as lost"));
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
					description: normalizeErrorDescription(err),
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

	// Resolver for the EntityCard's "fill the gap" indicator. Leads' reveal
	// matrix only ever surfaces clean string fields (status / source) so we
	// only need to resolve `assignedTo` for the dot-tooltip case. Wrapped in
	// useCallback so the card can rely on a stable reference.
	const resolveReplacementLabel = useCallback(
		(fieldName: string, raw: string): string | undefined => {
			if (fieldName === "assignedTo") return memberNameById.get(raw);
			return undefined;
		},
		[memberNameById],
	);

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
				boardColumns={boardColumnsOrdered}
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
						groupBy={groupBy}
						resolveReplacementLabel={resolveReplacementLabel}
						prefetchedTags={tagsByEntityId[item.id] ?? []}
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
				onColumnReorder={onColumnReorder}
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

			<ConfirmDialog
				open={pendingDelete !== null}
				onOpenChange={(v) => {
					if (!v) setPendingDelete(null);
				}}
				title={`Delete "${pendingDelete?.name ?? ""}"?`}
				description={`The ${labels.lead.singular.toLowerCase()} will be moved to trash. Owners can restore it from Settings → Data → Trash within the retention window.`}
				confirmLabel={`Delete ${labels.lead.singular.toLowerCase()}`}
				busyLabel="Deleting…"
				confirmVariant="destructive"
				onConfirm={async () => {
					if (!pendingDelete) return;
					try {
						await remove(pendingDelete.id as Id<"leads">);
						toast.success(`${labels.lead.singular} moved to trash`);
						setPendingDelete(null);
					} catch (err) {
						toast.error(normalizeError(err, "Couldn't delete"));
						throw err;
					}
				}}
			/>
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
