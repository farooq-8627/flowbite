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

import { useMutation, useQuery } from "convex/react";
import { PencilIcon, PlusIcon } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { DropdownMenuItem } from "@/components/ui/dropdown-menu";
import { FirstTimeTour } from "@/components/ui/first-time-tour";
import { api } from "@/convex/_generated/api";
import type { Doc, Id } from "@/convex/_generated/dataModel";
import { EntityTimeline } from "@/core/comms/timeline/components/EntityTimeline";
import type { KanbanColumnConfig } from "@/core/data-display/kanban/components/KanbanBoard";
import { usePersistedColumnOrder } from "@/core/data-display/kanban/hooks/usePersistedColumnOrder";
import { computeSortOrderForDrop } from "@/core/data-display/kanban/utils/sort-order";
import { CompanyDrawer } from "@/core/entities/_entities/companies/components/CompanyDrawer";
import { EntityListPage } from "@/core/entities/scaffolds/EntityListPage";
import { EntityCard } from "@/core/entities/shared/components/EntityCard";
import { ViewOptionsMenu } from "@/core/entities/shared/components/ViewOptionsMenu";
import { getStatusColor } from "@/core/entities/shared/config/defaults";
import { useEntityColumns } from "@/core/entities/shared/hooks/useEntityColumns";
import { useEntityFields } from "@/core/entities/shared/hooks/useEntityFields";
import { useEntityFieldValuesMap } from "@/core/entities/shared/hooks/useEntityFieldValuesMap";
import {
	useAttachTagToEntity,
	useDetachTagFromEntity,
	useSoftDeleteCompany,
	useUpdateCompany,
} from "@/core/entities/shared/hooks/useEntityMutations";
import { useEntityTagsMap } from "@/core/entities/shared/hooks/useEntityTagsMap";
import { useViewToggle } from "@/core/entities/shared/hooks/useViewToggle";
import { buildEntityBoardTour } from "@/core/entities/shared/tours";
import {
	getHiddenCardFieldsForGrouping,
	getRevealedCardFieldForGrouping,
	NO_GROUP_KEY,
} from "@/core/entities/shared/utils/board-grouping";
import { rankBySearch, type SearchableItem } from "@/core/entities/shared/utils/search";
import { EntityCalendarPanel } from "@/core/scheduling/calendar/panels/EntityCalendarPanel";
import { EntityFollowups } from "@/core/scheduling/followups/components/EntityFollowups";
import type { PrimaryActionConfig } from "@/core/shell/shared/entity-layout";
import { useCurrentOrg, useOrgMembers } from "@/core/shell/shared/hooks/useCurrentOrg";
import { useEntityLabels } from "@/core/shell/shared/hooks/useEntityLabels";
import { useQuickAddListener } from "@/core/shell/shell/components/QuickAddMenu";
import { usePersistedState } from "@/lib/hooks/use-persisted-state";
import { displayUrlLabel, normalizeExternalUrl } from "@/lib/url";

type CompanyRow = Record<string, unknown> & { id: string };

const COMPANY_SEARCH_FIELDS = ["name", "companyCode", "industry", "website"] as const;

export function CompaniesView({ orgSlug: _orgSlug }: { orgSlug: string }) {
	const labels = useEntityLabels();
	const { orgId } = useCurrentOrg();

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
	const _createCompany = useMutation(api.crm.entities.companies.mutations.create);
	const deleteCompany = useSoftDeleteCompany();

	const [addOpen, setAddOpen] = useState(false);
	const [editOpen, setEditOpen] = useState(false);
	const [editingCompany, setEditingCompany] = useState<Doc<"companies"> | null>(null);
	const [search, setSearch] = useState("");
	// Per-session view options — persisted to localStorage so they survive
	// route changes and reloads. Stale entries that point at admin-hidden
	// fields are filtered out by the EntityCard before render.
	// `cardFields:v2` (2026-05-18) — see LeadsView for context.
	const [cardFields, setCardFields] = usePersistedState<string[]>(
		"viewopts:company:cardFields:v2",
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
	// Batched per-row tag lookup. Pulled once at the view level so each
	// card on the kanban can render its TagsCell without a per-row
	// `getTagsForEntity` subscription (which previously fired one Convex
	// query per visible card — the source of the 100+ calls/min spike).
	const { tagsByEntityId } = useEntityTagsMap(orgId, "company");

	// Members lookup for assignee grouping labels
	const members = useOrgMembers();
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
	}, [rankedItems.items, rankedItems.matchedIds, boardColumns, groupBy]);

	// Drag card → persist position via sortOrder + (when groupBy is one of
	// the writable axes) update the column-field. Cross-column move and
	// in-column reorder dispatch through the same callback.
	//
	// Tag groupBy: companies can carry multiple tags. Dragging across tag
	// columns swaps just the source/destination tag (not all tags).
	const updateCompany = useUpdateCompany();
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
					companyId: itemId as Id<"companies">,
					sortOrder,
				};
				if (fromCol === toCol) {
					await updateCompany(baseArgs);
				} else if (groupBy === "industry") {
					await updateCompany({
						...baseArgs,
						industry: toCol === "uncategorized" ? undefined : toCol,
					});
				} else if (groupBy === "assignedTo") {
					await updateCompany({
						...baseArgs,
						assignedTo: toCol === NO_GROUP_KEY ? undefined : (toCol as Id<"users">),
					});
				} else if (groupBy === "size") {
					await updateCompany({
						...baseArgs,
						size: toCol === NO_GROUP_KEY ? undefined : toCol,
					});
				} else if (groupBy === "tag" || groupBy === "tags") {
					// Tag move — sortOrder first, then detach old / attach new.
					await updateCompany(baseArgs);
					if (fromCol !== NO_GROUP_KEY) {
						await detachTag({
							orgId,
							tagId: fromCol as Id<"tags">,
							entityType: "company",
							entityId: itemId,
						});
					}
					if (toCol !== NO_GROUP_KEY) {
						await attachTag({
							orgId,
							tagId: toCol as Id<"tags">,
							entityType: "company",
							entityId: itemId,
						});
					}
				} else {
					// Custom groupBy — only persist position.
					await updateCompany(baseArgs);
				}
			} catch (err) {
				toast.error("Couldn't update", {
					description: err instanceof Error ? err.message : undefined,
				});
			}
		},
		[orgId, updateCompany, groupBy, itemsByColumnId, rankedItems.items, attachTag, detachTag],
	);

	// Columns flow through the central `useEntityColumns` factory — same
	// path as LeadsView. The factory iterates `tableFields` from
	// `useEntityFields("company")` and dispatches each field through the
	// shared cell renderer (so tags get TagsCell with the batched
	// tagsByEntityId, assignee gets AssigneeCell, empty cells get the `+`
	// inline-edit button), and wraps every header in
	// `<DataTableColumnHeader>` so the table is sortable everywhere.
	const { columns } = useEntityColumns<CompanyRow>("company", orgId, {
		customValuesByEntityId,
		tagsByEntityId,
		onDelete: async (row) => {
			if (!orgId) return;
			try {
				await deleteCompany({
					orgId,
					companyId: (row._id ?? row.id) as Id<"companies">,
				});
				toast.success(`${labels.company.singular} deleted`);
			} catch (err) {
				toast.error(err instanceof Error ? err.message : "Couldn't delete");
			}
		},
		rowExtraActions: (row) => (
			<DropdownMenuItem
				onClick={() => {
					setEditingCompany(row as unknown as Doc<"companies">);
					setEditOpen(true);
				}}
			>
				<PencilIcon className="me-2 size-4" />
				Edit {labels.company.singular.toLowerCase()}
			</DropdownMenuItem>
		),
	});

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

	// Resolver for the EntityCard "fill the gap" indicator. Companies'
	// reveal matrix surfaces `assignedTo` (user id) — opaque, needs the
	// member-name lookup. `industry` is a clean string and falls through.
	const resolveReplacementLabel = useCallback(
		(fieldName: string, raw: string): string | undefined => {
			if (fieldName === "assignedTo") return memberNameById.get(raw);
			return undefined;
		},
		[memberNameById],
	);

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
						groupBy={groupBy}
						resolveReplacementLabel={resolveReplacementLabel}
						prefetchedTags={tagsByEntityId[item.id]}
					/>
				)}
				onCardMove={handleCardMove}
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
	const { orgId } = useCurrentOrg();
	// `companyId` from the URL is the companyCode (CO-001).
	const company = useQuery(
		api.crm.entities.companies.queries.getByCompanyCode,
		orgId ? { orgId, companyCode: companyId } : "skip",
	);

	const tabs = [
		{ id: "overview" as const, label: "Overview" },
		{ id: "timeline" as const, label: "Timeline" },
		{ id: "followups" as const, label: "Follow-ups" },
		{ id: "calendar" as const, label: "Calendar" },
	];
	const [activeTab, setActiveTab] = useState<(typeof tabs)[number]["id"]>("overview");

	if (company === undefined) {
		return (
			<div
				data-org={orgSlug}
				data-id={companyId}
				className="flex h-full items-center justify-center text-sm text-muted-foreground"
			>
				Loading {labels.company.singular.toLowerCase()}…
			</div>
		);
	}
	if (company === null) {
		return (
			<div
				data-org={orgSlug}
				data-id={companyId}
				className="flex h-full flex-col items-center justify-center gap-2 text-center"
			>
				<p className="text-sm font-medium">{labels.company.singular} not found</p>
				<p className="text-xs text-muted-foreground">{companyId}</p>
			</div>
		);
	}

	return (
		<div className="flex h-full min-h-0 flex-col" data-org={orgSlug} data-id={companyId}>
			<div className="border-b bg-background px-4 py-3">
				<div className="flex flex-col gap-0.5">
					<h1 className="text-lg font-semibold tracking-tight">{company.name}</h1>
					<p className="text-xs text-muted-foreground">
						<span className="font-mono tabular-nums">{company.companyCode}</span>
						{company.industry ? (
							<>
								<span aria-hidden> · </span>
								<span>{company.industry}</span>
							</>
						) : null}
					</p>
				</div>
				<div className="mt-3 flex items-center gap-1 border-b -mb-3">
					{tabs.map((t) => {
						const active = activeTab === t.id;
						return (
							<button
								key={t.id}
								type="button"
								onClick={() => setActiveTab(t.id)}
								aria-pressed={active}
								className={`relative px-3 pb-2 pt-1 text-sm transition-colors ${
									active
										? "font-medium text-foreground"
										: "text-muted-foreground hover:text-foreground"
								}`}
							>
								{t.label}
								{active && (
									<span
										aria-hidden
										className="absolute inset-x-3 -bottom-px h-0.5 bg-primary"
									/>
								)}
							</button>
						);
					})}
				</div>
			</div>

			<div className="flex min-h-0 flex-1 flex-col overflow-auto p-4">
				{activeTab === "overview" && (
					<div className="grid gap-3 text-sm">
						<div className="rounded-[var(--radius)] border bg-card p-4">
							<h3 className="text-sm font-semibold">Details</h3>
							<dl className="mt-2 grid grid-cols-2 gap-x-6 gap-y-1.5 text-xs">
								{company.website
									? (() => {
											const safeUrl = normalizeExternalUrl(company.website);
											return (
												<>
													<dt className="text-muted-foreground">
														Website
													</dt>
													<dd className="font-medium truncate">
														{safeUrl ? (
															<a
																href={safeUrl}
																target="_blank"
																rel="noopener noreferrer external"
																className="text-primary hover:underline"
															>
																{displayUrlLabel(safeUrl, 36)}
															</a>
														) : (
															<span className="text-muted-foreground">
																{company.website}
															</span>
														)}
													</dd>
												</>
											);
										})()
									: null}
								{company.industry ? (
									<>
										<dt className="text-muted-foreground">Industry</dt>
										<dd className="font-medium">{company.industry}</dd>
									</>
								) : null}
							</dl>
						</div>

						{/* Embedded summary cards: 2-column grid mirroring the
						    profile + deal Overview layout. Timeline +
						    Follow-ups surface the most important context
						    without forcing a tab switch. */}
						<div className="grid gap-3 lg:grid-cols-2">
							<div className="flex min-h-[18rem] flex-col rounded-[var(--radius)] border bg-card">
								<div className="flex items-center justify-between border-b px-3 py-2">
									<h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
										Recent activity
									</h3>
									<button
										type="button"
										onClick={() => setActiveTab("timeline")}
										className="text-[10px] text-muted-foreground hover:text-foreground hover:underline"
									>
										View all
									</button>
								</div>
								<div className="flex min-h-0 flex-1 flex-col">
									<EntityTimeline
										entityType="company"
										entityId={company.companyCode}
										pageSize={20}
										visibleCap={20}
										showFilters={false}
										showComposer={false}
									/>
								</div>
							</div>
							<div className="flex min-h-[18rem] flex-col rounded-[var(--radius)] border bg-card">
								<div className="flex items-center justify-between border-b px-3 py-2">
									<h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
										Open follow-ups
									</h3>
									<button
										type="button"
										onClick={() => setActiveTab("followups")}
										className="text-[10px] text-muted-foreground hover:text-foreground hover:underline"
									>
										View all
									</button>
								</div>
								<div className="flex min-h-0 flex-1 flex-col p-3">
									<EntityFollowups
										entityType="company"
										entityId={company.companyCode}
									/>
								</div>
							</div>
						</div>
					</div>
				)}
				{activeTab === "timeline" && (
					<EntityTimeline entityType="company" entityId={company.companyCode} />
				)}
				{activeTab === "followups" && (
					<EntityFollowups entityType="company" entityId={company.companyCode} />
				)}
				{activeTab === "calendar" && (
					<EntityCalendarPanel entityType="company" entityId={company.companyCode} />
				)}
			</div>
		</div>
	);
}
