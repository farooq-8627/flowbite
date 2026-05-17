"use client";

/**
 * NotesView — org-wide notes page at `/{locale}/{orgSlug}/notes`.
 *
 * Two view modes (toggled via a two-icon pill in the toolbar between the
 * filter popover and the primary action; persisted in the URL via `nuqs`
 * so deep-links share):
 *   1. **Category Board** (`?tab=category`, default) — multi-column kanban
 *      grouped by category (`NotesCategoryKanban`). Cards: `pickers="entity"`
 *      because column drag IS the recategorize, so the dot would duplicate
 *      the affordance.
 *   2. **Sticky Board** (`?tab=board`) — single canvas, free-position 2D wall
 *      (`NotesSingleBoard`). Cards: `pickers="both"` so the user can pick
 *      category AND entity from the card.
 *
 * The toggle is icon-only (Columns icon for Category, Grid icon for Board) so
 * it lines up visually with the entity-page `ViewToggleIcons` pill — but it's
 * Notes-owned, not the shared widget, because the two views here are both
 * BOARD shapes (no list view applies). The shared `ViewToggleIcons` is hidden
 * by passing `views={[]}` to `EntityPageLayout`.
 *
 * Both tabs read the SAME `useNotesForOrg` query, so any edit / drag /
 * category change appears in the other tab in real time. The toolbar
 * `+ Add Note` button creates on whichever tab is active. The search
 * input drives the same `note-card-flash` highlight on both tabs.
 *
 * Filtering — single popover for both tabs (2026-05-17 semantics):
 *   • `?cats=A,B` → show ONLY cards/columns in those categories. Empty = show all.
 *     (Inclusive selection model — no checkbox = no match. Pick one to focus on it.)
 *   • `?pinned=1` → show ONLY pinned cards.
 *   • Filters compose: `?cats=A&pinned=1` → only pinned cards in category A.
 *   • Internally the kanban / sticky-board components still take a
 *     `hiddenCategoryIds` prop (legacy contract); we translate selection →
 *     hidden in this view so consumers stay simple.
 */

import { useMutation, useQuery } from "convex/react";
import {
	Columns3Icon,
	FilterIcon,
	LayoutGridIcon,
	Pin,
	PlusIcon,
} from "lucide-react";
import {
	parseAsArrayOf,
	parseAsBoolean,
	parseAsString,
	parseAsStringEnum,
	useQueryState,
} from "nuqs";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import { api } from "@/convex/_generated/api";
import type { Doc, Id } from "@/convex/_generated/dataModel";
import {
	EntityPageLayout,
	type PrimaryActionConfig,
} from "@/core/shell/shared/entity-layout";
import { useCurrentOrg } from "@/core/shell/shared/hooks/useCurrentOrg";
import { rankBySearch, type SearchableItem } from "@/core/entities/shared/utils/search";
import { cn } from "@/lib/utils";
import { toast } from "@/lib/toast";
import { NotesCategoryKanban } from "../components/NotesCategoryKanban";
import { NotesSingleBoard } from "../components/NotesSingleBoard";
import {
	useDefaultNoteCategory,
	useEnsureNoteCategories,
	useNoteCategories,
	useNotesForOrg,
} from "../hooks";

const NOTES_TABS = ["category", "board"] as const;
type NotesTab = (typeof NOTES_TABS)[number];

/**
 * String fields scored by `rankBySearch` for the notes board search.
 */
const NOTE_SEARCH_FIELDS = ["content", "title", "personCode", "entityId"] as const;

export function NotesView() {
	const { orgId, orgSlug } = useCurrentOrg();
	const me = useQuery(api.users.queries.me);
	const myMembership = useQuery(api.orgs.queries.getMyMembership, orgId ? { orgId } : "skip");
	const members = useQuery(api.orgs.queries.listMembers, orgId ? { orgId } : "skip");

	const categories = useNoteCategories({ orgId });
	const defaultCategory = useDefaultNoteCategory({ orgId });
	const ensureCategories = useEnsureNoteCategories();
	const createNote = useMutation(api.crm.shared.notes.mutations.create);

	useEffect(() => {
		if (!orgId) return;
		if (categories === undefined) return;
		if (categories.length > 0) return;
		ensureCategories({ orgId }).catch(() => {});
	}, [orgId, categories, ensureCategories]);

	const [search, setSearch] = useQueryState("q", parseAsString.withDefault(""));

	// Inclusive selection: empty array = show all. URL param is per-tab so a
	// user can deep-link a different focus to each view.
	const [categoryFilter, setCategoryFilter] = useQueryState(
		"cats",
		parseAsArrayOf(parseAsString).withDefault([]),
	);
	const [stickyCategoryFilter, setStickyCategoryFilter] = useQueryState(
		"sticky-cats",
		parseAsArrayOf(parseAsString).withDefault([]),
	);
	const [pinnedOnly, setPinnedOnly] = useQueryState(
		"pinned",
		parseAsBoolean.withDefault(false),
	);

	// `?tab=` matches the entity-style URL contract used elsewhere
	// (e.g. ModulesGroup). Only the two values are accepted; an unknown
	// slug falls back to the category default.
	const [tab, setTab] = useQueryState(
		"tab",
		parseAsStringEnum(NOTES_TABS as unknown as string[]).withDefault("category"),
	);
	const activeTab: NotesTab = tab as NotesTab;

	const notes = useNotesForOrg({ orgId });

	// Ranked search — matches float to the top of their column / row, non-
	// matches keep their original position underneath. The same `matchedIds`
	// set drives the per-card flash on BOTH tabs so the user gets identical
	// search UX on either layout.
	const rankedNotes = useMemo(() => {
		if (!notes)
			return {
				items: undefined as Doc<"notes">[] | undefined,
				matchedIds: new Set<string>(),
			};
		const searchable = notes.map(
			(n) => ({ ...n, id: String(n._id) }) as unknown as SearchableItem,
		);
		const ranked = rankBySearch(searchable, search, NOTE_SEARCH_FIELDS);
		return {
			items: ranked.items.map((it) => {
				const { id: _id, ...rest } = it as Record<string, unknown> & { id: string };
				return rest as unknown as Doc<"notes">;
			}),
			matchedIds: ranked.matchedIds,
		};
	}, [notes, search]);

	const [flashEpoch, setFlashEpoch] = useState(0);
	useEffect(() => {
		if (!search) return;
		setFlashEpoch((e) => e + 1);
	}, [search]);

	const authorsById = useMemo(() => {
		const map = new Map<string, { name: string; avatarUrl?: string }>();
		for (const m of members ?? []) {
			map.set(String(m.user._id), {
				name: m.user.name ?? m.user.email ?? "Member",
				avatarUrl: m.user.avatarUrl,
			});
		}
		return map;
	}, [members]);

	const permissions = (myMembership?.permissions ?? []) as ReadonlyArray<string>;
	const canCreate = permissions.includes("notes.create");
	const canManageCategories = permissions.includes("notes.categories.manage");

	const [autoFocusNoteId, setAutoFocusNoteId] = useState<string | null>(null);

	// `+ Add Note` toolbar button. The data write is identical on both tabs
	// (a `notes.create` row in the org's default category attached to the
	// org), and both tabs read the same query so the new note appears in
	// either layout. Auto-focus is claimed by whichever board renders the
	// new id.
	const handleQuickAdd = useCallback(async () => {
		if (!orgId) return;
		const targetCategory = defaultCategory?._id;
		if (!targetCategory) {
			toast.warning("Set a default category in Settings → Notes → Categories.");
			return;
		}
		try {
			const newId = await createNote({
				orgId,
				entityType: "org",
				entityId: orgSlug ?? "org",
				content: "New note",
				categoryId: targetCategory,
				authorType: "user",
				isInternal: false,
			});
			setAutoFocusNoteId(String(newId));
		} catch (err) {
			toast.mutationError(err, "Couldn't create note.");
		}
	}, [orgId, orgSlug, defaultCategory, createNote]);

	const primaryAction: PrimaryActionConfig | undefined = canCreate
		? {
				label: "Add Note",
				icon: PlusIcon,
				permission: "notes.create",
				onClick: handleQuickAdd,
			}
		: undefined;

	// Translate INCLUSIVE selection ("show only these") → EXCLUSIVE hidden set
	// ("hide these") for the kanban / sticky-board components, which still
	// take the legacy `hiddenCategoryIds` prop. Empty selection ⇒ no hidden
	// ids ⇒ everything visible. A non-empty selection ⇒ hide every category
	// NOT in the selection.
	const visibleCats = useMemo(
		() => (categories ?? []).filter((c) => !c.isArchived),
		[categories],
	);
	const activeFilter = activeTab === "category" ? categoryFilter : stickyCategoryFilter;
	const setActiveFilter = activeTab === "category" ? setCategoryFilter : setStickyCategoryFilter;

	const hiddenCategoryIds = useMemo<Id<"noteCategories">[]>(() => {
		if (activeFilter.length === 0) return [];
		const allowed = new Set(activeFilter);
		return visibleCats
			.map((c) => c._id)
			.filter((id) => !allowed.has(String(id))) as Id<"noteCategories">[];
	}, [activeFilter, visibleCats]);

	return (
		<EntityPageLayout
			views={[]}
			view="board"
			onViewChange={() => {}}
			primaryAction={primaryAction}
			orgId={orgId}
			search={{
				value: search,
				onChange: setSearch,
				placeholder: "Search notes…",
			}}
			toolbarExtras={
				<>
					<NotesFilterPopover
						categories={visibleCats}
						selected={activeFilter}
						onSelectedChange={(next) =>
							setActiveFilter(next.length === 0 ? null : next)
						}
						pinnedOnly={pinnedOnly}
						onPinnedOnlyChange={(next) => setPinnedOnly(next || null)}
					/>
					<NotesViewToggle tab={activeTab} onTabChange={setTab} />
				</>
			}
		>
			{/* Same outer padding box as EntityListPage's board branch. */}
			<div className="flex min-h-0 min-w-0 flex-1 flex-col gap-2 py-3 xl:p-4">
				<div className="flex min-h-0 min-w-0 flex-1">
					{activeTab === "category" ? (
						<NotesCategoryKanban
							notes={rankedNotes.items}
							categories={categories}
							authorsById={authorsById}
							currentUserId={me?._id as Id<"users"> | undefined}
							permissions={permissions}
							orgSlug={orgSlug}
							defaultAttachment={{
								entityType: "org",
								entityId: orgSlug ?? "org",
							}}
							canCreate={canCreate}
							canManageCategories={canManageCategories}
							hiddenCategoryIds={hiddenCategoryIds}
							pinnedOnly={pinnedOnly}
							pickers="entity"
							autoFocusNoteId={autoFocusNoteId}
							onAutoFocusConsumed={() => setAutoFocusNoteId(null)}
							onCreatedNote={(id) => setAutoFocusNoteId(id)}
							matchedNoteIds={rankedNotes.matchedIds}
							highlightEpoch={flashEpoch}
						/>
					) : (
						<NotesSingleBoard
							notes={rankedNotes.items}
							categories={categories}
							authorsById={authorsById}
							currentUserId={me?._id as Id<"users"> | undefined}
							permissions={permissions}
							orgSlug={orgSlug}
							defaultAttachment={{
								entityType: "org",
								entityId: orgSlug ?? "org",
							}}
							canCreate={canCreate}
							hiddenCategoryIds={hiddenCategoryIds}
							pinnedOnly={pinnedOnly}
							autoFocusNoteId={autoFocusNoteId}
							onAutoFocusConsumed={() => setAutoFocusNoteId(null)}
							onCreatedNote={(id) => setAutoFocusNoteId(id)}
							matchedNoteIds={rankedNotes.matchedIds}
							highlightEpoch={flashEpoch}
							showAddButton={false}
						/>
					)}
				</div>
			</div>
		</EntityPageLayout>
	);
}

// ─── View toggle (two-icon pill, toolbar) ───────────────────────────────────

interface NotesViewToggleProps {
	tab: NotesTab;
	onTabChange: (next: NotesTab) => void;
}

/**
 * Icon-only toggle pill that mirrors the visual language of
 * `core/shell/shared/entity-layout/ViewToggleIcons` — same height, same
 * radius, same `aria-pressed` semantics — but with two notes-specific
 * board variants instead of list/board.
 *
 *   • Category view → `Columns3Icon` (multi-column kanban grouped by category)
 *   • Sticky board  → `LayoutGridIcon` (free-position 2D wall)
 *
 * Lives next to the View / Filter popover and the +Add Note primary action
 * so the user always sees the switch without scrolling.
 */
function NotesViewToggle({ tab, onTabChange }: NotesViewToggleProps) {
	return (
		<div className="inline-flex h-8 items-center overflow-hidden rounded-[var(--radius)] border bg-background p-0.5">
			<Button
				variant="ghost"
				size="icon"
				aria-label="Category view"
				title="Category view"
				aria-pressed={tab === "category"}
				onClick={() => onTabChange("category")}
				className={cn(
					"size-6 shrink-0 rounded-[calc(var(--radius)-2px)]",
					tab === "category"
						? "bg-accent text-accent-foreground"
						: "text-muted-foreground hover:text-foreground",
				)}
			>
				<Columns3Icon className="size-3.5" />
			</Button>
			<Button
				variant="ghost"
				size="icon"
				aria-label="Board view"
				title="Board view"
				aria-pressed={tab === "board"}
				onClick={() => onTabChange("board")}
				className={cn(
					"size-6 shrink-0 rounded-[calc(var(--radius)-2px)]",
					tab === "board"
						? "bg-accent text-accent-foreground"
						: "text-muted-foreground hover:text-foreground",
				)}
			>
				<LayoutGridIcon className="size-3.5" />
			</Button>
		</div>
	);
}

// ─── Filter popover (categories + pinned) ───────────────────────────────────

interface NotesFilterPopoverProps {
	categories: ReadonlyArray<{
		_id: Id<"noteCategories">;
		name: string;
		bgColor: string;
		isArchived: boolean;
	}>;
	/** Selected category ids. Empty = show all. */
	selected: ReadonlyArray<string>;
	onSelectedChange: (next: string[]) => void;
	/** When true, only pinned cards are shown. */
	pinnedOnly: boolean;
	onPinnedOnlyChange: (next: boolean) => void;
}

/**
 * Inclusive filter popover (2026-05-17 semantics). The model matches a
 * standard CRM "filter" button:
 *
 *   • EMPTY selection (= zero checkboxes) = show all categories.
 *   • NON-EMPTY selection = show ONLY checked categories. Pick one
 *     to drill in; pick three to scope to those three.
 *
 * This is the inverse of the legacy "hide" model where every box was
 * pre-checked and unchecking removed a category. The new model is what
 * users expect from a filter — and avoids the awkward "to focus on
 * Urgent I have to uncheck four other things first" workflow.
 *
 * Plus a separate **Pinned only** switch at the top so the user can
 * combine "category = Urgent" with "show only pinned". Filters compose
 * (AND, not OR) — both must be satisfied for a card to render.
 *
 * Used on both the Category kanban tab AND the Sticky board tab; the
 * model is identical so we don't need two popovers anymore.
 */
function NotesFilterPopover({
	categories,
	selected,
	onSelectedChange,
	pinnedOnly,
	onPinnedOnlyChange,
}: NotesFilterPopoverProps) {
	const selectedSet = useMemo(() => new Set(selected), [selected]);

	function toggle(id: string) {
		const next = new Set(selectedSet);
		if (next.has(id)) next.delete(id);
		else next.add(id);
		onSelectedChange(Array.from(next));
	}

	const hasFilter = selected.length > 0 || pinnedOnly;
	// Active count surfaced on the trigger pill — categories selected + 1 if
	// pinned is active. Keeps the user oriented without opening the popover.
	const activeCount = (selected.length > 0 ? 1 : 0) + (pinnedOnly ? 1 : 0);

	function clearAll() {
		onSelectedChange([]);
		onPinnedOnlyChange(false);
	}

	return (
		<Popover>
			<PopoverTrigger asChild>
				<Button
					variant="outline"
					size="sm"
					className="h-7 gap-1.5 px-2 text-xs"
					aria-label="Filter notes"
					data-tour="view-options-trigger"
				>
					<FilterIcon className="size-3.5" />
					<span className="hidden sm:inline">Filter</span>
					{activeCount > 0 && (
						<span className="ms-0.5 rounded-full bg-primary px-1.5 text-[10px] font-medium text-primary-foreground">
							{activeCount}
						</span>
					)}
				</Button>
			</PopoverTrigger>
			<PopoverContent align="end" className="w-64 p-3" sideOffset={6}>
				{/* Pinned-only switch — sits at the top so it's always one
				    click away and visually distinct from the category list. */}
				<div className="flex items-center justify-between gap-3 px-1">
					<Label
						htmlFor="flt-notes-pinned"
						className="flex cursor-pointer items-center gap-2 text-xs"
					>
						<Pin className="size-3.5" />
						Show only pinned
					</Label>
					<Switch
						id="flt-notes-pinned"
						checked={pinnedOnly}
						onCheckedChange={onPinnedOnlyChange}
					/>
				</div>

				<Separator className="my-3" />

				<div className="space-y-1.5">
					<div className="flex items-center justify-between px-1">
						<Label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
							Categories
						</Label>
						{selected.length > 0 && (
							<button
								type="button"
								onClick={() => onSelectedChange([])}
								className="text-[10px] text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
							>
								Clear
							</button>
						)}
					</div>
					<p className="px-1 text-[10px] text-muted-foreground">
						Pick one or more to filter — leave empty to show all.
					</p>
					<div className="-mx-1 flex max-h-64 flex-col gap-0.5 overflow-y-auto">
						{categories.map((c) => {
							const id = String(c._id);
							const isSelected = selectedSet.has(id);
							const checkboxId = `flt-notes-${id}`;
							return (
								<label
									key={id}
									htmlFor={checkboxId}
									className="flex cursor-pointer items-center gap-2 rounded-[var(--radius)] px-2 py-1 text-xs hover:bg-accent"
								>
									<Checkbox
										id={checkboxId}
										checked={isSelected}
										onCheckedChange={() => toggle(id)}
									/>
									<span
										aria-hidden
										className="inline-block size-2 shrink-0 rounded-full"
										style={{ backgroundColor: c.bgColor }}
									/>
									<span className="flex-1 truncate">{c.name}</span>
								</label>
							);
						})}
						{categories.length === 0 && (
							<div className="px-2 py-1 text-xs text-muted-foreground">
								No categories yet.
							</div>
						)}
					</div>
				</div>

				{hasFilter && (
					<>
						<Separator className="my-3" />
						<button
							type="button"
							onClick={clearAll}
							className="w-full rounded-[var(--radius)] px-2 py-1 text-start text-xs text-muted-foreground hover:bg-accent"
						>
							Clear all filters
						</button>
					</>
				)}
			</PopoverContent>
		</Popover>
	);
}
