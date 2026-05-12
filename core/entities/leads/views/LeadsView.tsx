"use client";

/**
 * LeadsView — scaffold-driven leads list + board view.
 *
 * Primary action: Add Lead (no dropdown chevron — Convert is selection-driven).
 * Selection toolbar above DataTable for bulk convert. Per-row convert via the
 * row actions menu (vertical dots). Drag a card between board columns to update
 * its status.
 *
 * Board options:
 *   - Per-session cardFields menu (click "View" button in toolbar).
 *   - Hidden terminal statuses ("converted", "lost") toggleable via same menu.
 *
 * Search: wired to EntityPageLayout's toolbar search and filters both list
 * and board views before grouping.
 */

import { useMutation, useQuery } from "convex/react";
import { PlusIcon, XIcon } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { EntityListPage } from "@/core/entities/scaffolds/EntityListPage";
import type { PrimaryActionConfig } from "@/core/entities/scaffolds/EntityPageLayout";
import { BoardOptionsMenu } from "@/core/entities/shared/components/BoardOptionsMenu";
import { LEAD_STATUSES } from "@/core/entities/shared/config/defaults";
import { useModuleDisplay } from "@/core/entities/shared/hooks/useModuleDisplay";
import { useViewToggle } from "@/core/entities/shared/hooks/useViewToggle";
import type { KanbanColumnConfig } from "@/core/kanban/components/KanbanBoard";
import { useEntityLabels } from "@/core/shared/hooks/useEntityLabels";
import { useQuickAddListener } from "@/core/shell/components/QuickAddMenu";
import { matchesShortcut, useShortcut } from "@/stores/shortcuts/shortcuts-store";
import { AddLeadDrawer } from "../components/AddLeadDrawer";
import { ConvertLeadDrawer } from "../components/ConvertLeadDrawer";
import { LeadCard } from "../components/LeadCard";
import { useLeadColumns } from "../hooks/useLeadColumns";
import { useLeadMutations } from "../hooks/useLeadMutations";
import { useLeads } from "../hooks/useLeads";

// Terminal statuses hidden by default on the board (too noisy otherwise).
const HIDDEN_LEAD_STATUSES: string[] = ["converted", "lost"];

export function LeadsView(_props: { orgSlug: string }) {
	const labels = useEntityLabels();
	const { items, orgId } = useLeads();
	const [view, setView] = useViewToggle("lead");
	const { boardGroupBy, cardFields: defaultCardFields } = useModuleDisplay("lead");
	const { create, convert, remove } = useLeadMutations(orgId);
	const updateLead = useMutation(api.crm.entities.leads.mutations.update);

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
	const [search, setSearch] = useState("");
	const [cardFields, setCardFields] = useState<string[]>(defaultCardFields);
	const [revealedStatuses, setRevealedStatuses] = useState<string[]>([]);

	// Keep the board cardFields in sync with settings changes until the user
	// overrides per-session.
	useEffect(() => {
		setCardFields(defaultCardFields);
	}, [defaultCardFields]);

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
		// If nothing selected, pop the drawer open with no pre-selected ids —
		// user picks inside. Otherwise prefill with the first lead by id.
		const firstId = items?.[0]?.id as Id<"leads"> | undefined;
		if (firstId) openConvertFor([firstId]);
	});

	const columns = useLeadColumns({
		onConvert: (leadId) => openConvertFor([leadId]),
	});

	// Board columns — exclude terminal statuses unless revealed in the menu
	const visibleStatuses = useMemo(() => {
		return LEAD_STATUSES.filter(
			(s) => !HIDDEN_LEAD_STATUSES.includes(s) || revealedStatuses.includes(s),
		);
	}, [revealedStatuses]);

	const boardColumns: KanbanColumnConfig[] = useMemo(
		() => visibleStatuses.map((s) => ({ id: s, title: s })),
		[visibleStatuses],
	);

	// Search filter (applied at source → used by both list + board)
	const filteredItems = useMemo(() => {
		if (!items) return items;
		const q = search.trim().toLowerCase();
		if (!q) return items;
		return items.filter((it) => {
			const i = it as Record<string, unknown>;
			return [i.displayName, i.email, i.phone, i.personCode, i.status, i.source].some(
				(v) => typeof v === "string" && v.toLowerCase().includes(q),
			);
		});
	}, [items, search]);

	// Group items by the board groupBy field (default: status)
	const itemsByColumnId = useMemo(() => {
		if (!filteredItems) return {};
		const grouped: Record<string, typeof filteredItems> = {};
		for (const col of boardColumns) grouped[col.id] = [];
		for (const item of filteredItems) {
			const key = String((item as Record<string, unknown>)[boardGroupBy] ?? "new");
			if (!grouped[key]) continue; // item in a hidden column — skip
			grouped[key].push(item);
		}
		return grouped;
	}, [filteredItems, boardColumns, boardGroupBy]);

	// Drag card → update status
	const handleCardMove = useCallback(
		async (itemId: string, _from: string, to: string) => {
			if (!orgId) return;
			if (boardGroupBy !== "status") return;
			try {
				await updateLead({ orgId, leadId: itemId as Id<"leads">, status: to });
			} catch (err) {
				toast.error("Couldn't update status", {
					description: err instanceof Error ? err.message : undefined,
				});
			}
		},
		[orgId, updateLead, boardGroupBy],
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

	return (
		<>
			<EntityListPage
				slot="lead"
				items={filteredItems}
				columns={columns}
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
						<BoardOptionsMenu
							slot="lead"
							cardFields={cardFields}
							onCardFieldsChange={setCardFields}
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
						cardFields={cardFields}
						staleness={staleness}
						isDragging={isDragging}
						onConvert={() => openConvertFor([item.id as Id<"leads">])}
						onDelete={() => handleDelete(item.id as Id<"leads">)}
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
				leadRecords={convertIds
					.map((id) => leadLookup.get(id))
					.filter((r): r is NonNullable<typeof r> => !!r)}
				onConvert={(leadId) => convert(leadId)}
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
