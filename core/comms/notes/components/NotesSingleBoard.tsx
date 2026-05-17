"use client";

/**
 * NotesSingleBoard — a single-canvas sticky-note board.
 *
 * One container, no column header. Cards live in a free-position
 * `sortOrder`-driven order: the user can drop a card anywhere in the
 * stack and the position persists. New cards land at the top.
 *
 * Layout
 * ──────
 * Cards flow in a CSS grid (`grid-cols-[repeat(auto-fill,minmax(220px,1fr))]`)
 * — they pack horizontally up to the container width and wrap to the
 * next row. Drag works in BOTH axes: the underlying `SortableContext`
 * uses `rectSortingStrategy` so dnd-kit computes collisions across the
 * 2D grid. Order is still linear (`sortOrder asc`) — wrapping is purely
 * visual.
 *
 * Used in two places:
 *   1. Org-wide `/notes` page — sticky-board tab. Cards: `pickers="both"`.
 *   2. Embedded panels (`NotesPanel` for profile / deal / company /
 *      project tabs) — same component, same props.
 *
 * Inputs supported:
 *   - `matchedNoteIds` + `highlightEpoch` — search-match flash, identical
 *     to the entity boards / category kanban.
 *   - `hiddenCategoryIds` — client-side filter applied before render so the
 *     org-page's category filter popover shows only matching cards.
 *   - `defaultCategoryId` — used by the `+ Add note` flow (overrides the
 *     org's default).
 *
 * Drag persistence: `useReorderNote` updates `sortOrder` on the moved
 * card. The dnd-kit primitive emits `onValueChange` with the new column
 * state; we walk it, find the card whose index changed, compute the
 * midpoint sortOrder from its post-drop neighbours, and patch.
 */

import { rectSortingStrategy } from "@dnd-kit/sortable";
import { PlusIcon } from "lucide-react";
import { useCallback, useMemo, useRef } from "react";
import { Button } from "@/components/ui/button";
import {
	Kanban,
	KanbanBoard as KanbanBoardPrimitive,
	KanbanColumn,
	KanbanOverlay,
} from "@/components/ui/kanban";
import type { Doc, Id } from "@/convex/_generated/dataModel";
import { createRestrictToContainer } from "@/core/data-display/kanban/utils/restrict-to-container";
import { computeSortOrderForDrop } from "@/core/data-display/kanban/utils/sort-order";
import { toast } from "@/lib/toast";
import { cn } from "@/lib/utils";
import { useCreateNote, useReorderNote } from "../hooks";
import { NoteCard } from "./NoteCard";

const SINGLE_COLUMN_ID = "single";
const PLACEHOLDER_CONTENT = "New note";

/**
 * Each item handed to `Kanban` needs a stable string id. We wrap the doc
 * once and re-expose it via `note` — same shape as `NotesCategoryKanban`.
 */
type NoteItem = { id: string; note: Doc<"notes"> };

interface NotesSingleBoardProps {
	notes: Doc<"notes">[] | undefined;
	categories: Doc<"noteCategories">[] | undefined;
	authorsById: Map<string, { name: string; avatarUrl?: string }>;
	currentUserId: Id<"users"> | undefined;
	permissions: ReadonlyArray<string>;
	orgSlug?: string;
	/** Default attachment for newly-created cards. */
	defaultAttachment: { entityType: string; entityId: string; personCode?: string };
	/** Default category id for newly-created cards. Falls back to the org's default. */
	defaultCategoryId?: Id<"noteCategories">;
	canCreate: boolean;
	className?: string;
	/**
	 * Hide cards whose `categoryId` is in this set. Applied client-side
	 * before render. Used by the `/notes` page's category-filter popover
	 * on the sticky-board tab.
	 */
	hiddenCategoryIds?: ReadonlyArray<Id<"noteCategories">>;
	/**
	 * When true, only pinned cards (`note.isPinned`) are rendered. Applied
	 * after the hidden-categories filter so pin + category filters compose
	 * (AND — both must match for a card to show).
	 */
	pinnedOnly?: boolean;
	/**
	 * Note id to mount in edit-mode + auto-focused on the next render. Same
	 * contract as NotesCategoryKanban — parent owns the claim, child clears
	 * it via `onAutoFocusConsumed`.
	 */
	autoFocusNoteId?: string | null;
	onAutoFocusConsumed?: () => void;
	onCreatedNote?: (noteId: string) => void;
	/**
	 * Set of note ids matching the current search query. Cards in the set
	 * float to the top and trigger the per-card outline-flash animation.
	 */
	matchedNoteIds?: ReadonlySet<string>;
	highlightEpoch?: number;
	/** When false, hide the internal `+ Add note` header bar (parent provides one). */
	showAddButton?: boolean;
	/** Empty-state copy when the column is empty AND not loading. */
	emptyTitle?: string;
	emptyDescription?: string;
}

export function NotesSingleBoard({
	notes,
	categories,
	authorsById,
	currentUserId,
	permissions,
	orgSlug,
	defaultAttachment,
	defaultCategoryId,
	canCreate,
	className,
	hiddenCategoryIds = [],
	pinnedOnly = false,
	autoFocusNoteId,
	onAutoFocusConsumed,
	onCreatedNote,
	matchedNoteIds,
	highlightEpoch,
	showAddButton = true,
	emptyTitle = "No notes yet",
	emptyDescription = "Drop a sticky note here. Drag cards to reorder them — the layout is yours.",
}: NotesSingleBoardProps) {
	const containerRef = useRef<HTMLDivElement>(null);
	// eslint-disable-next-line react-hooks/exhaustive-deps
	const restrictToBoard = useCallback(
		createRestrictToContainer(() => containerRef.current),
		[],
	);
	const reorderNote = useReorderNote();
	const createNote = useCreateNote();

	// Build the single-column items array from the props. Cards matching
	// the current search query float to the top (matched-first), then
	// remaining cards stay in their `sortOrder asc` order. Falls back to
	// `-_creationTime` for legacy rows. Hidden categories are dropped.
	// Pinned-only filter (when active) drops every non-pinned card so the
	// remaining stack is just the user's pinned set.
	const items: NoteItem[] = useMemo(() => {
		const hidden = new Set(hiddenCategoryIds.map(String));
		const matched = matchedNoteIds ?? new Set<string>();
		return (notes ?? [])
			.filter((n) => !n.categoryId || !hidden.has(String(n.categoryId)))
			.filter((n) => !pinnedOnly || n.isPinned)
			.slice()
			.sort((a, b) => {
				const aId = String(a._id);
				const bId = String(b._id);
				const aMatch = matched.has(aId);
				const bMatch = matched.has(bId);
				if (aMatch !== bMatch) return aMatch ? -1 : 1;
				const aKey = a.sortOrder ?? -a._creationTime;
				const bKey = b.sortOrder ?? -b._creationTime;
				return aKey - bKey;
			})
			.map((n) => ({ id: String(n._id), note: n }));
	}, [notes, hiddenCategoryIds, pinnedOnly, matchedNoteIds]);

	const value: Record<string, NoteItem[]> = { [SINGLE_COLUMN_ID]: items };

	async function handleAdd() {
		const orgId = notes?.[0]?.orgId ?? categories?.[0]?.orgId;
		if (!orgId) {
			toast.error("Workspace not ready yet — try again in a moment.");
			return;
		}
		const categoryId = defaultCategoryId ?? categories?.find((c) => c.isDefault)?._id;
		if (!categoryId) {
			toast.warning("Set a default category in Settings → CRM → Note Categories.");
			return;
		}
		try {
			const newId = await createNote({
				orgId,
				entityType: defaultAttachment.entityType,
				entityId: defaultAttachment.entityId,
				personCode: defaultAttachment.personCode,
				content: PLACEHOLDER_CONTENT,
				categoryId,
				authorType: "user",
				isInternal: false,
			});
			onCreatedNote?.(String(newId));
		} catch (err) {
			toast.mutationError(err, "Couldn't add note.");
		}
	}

	async function handleValueChange(next: Record<string, NoteItem[]>) {
		const newItems = next[SINGLE_COLUMN_ID] ?? [];
		// Find the card whose index changed.
		for (let i = 0; i < newItems.length; i += 1) {
			const newItem = newItems[i];
			const prevIdx = items.findIndex((it) => it.id === newItem.id);
			if (prevIdx === -1 || prevIdx === i) continue;
			// Compute midpoint sortOrder from the dropped position's neighbours.
			const sortOrder = computeSortOrderForDrop(
				newItems.map((it) => ({
					id: it.id,
					sortOrder: it.note.sortOrder,
					_creationTime: it.note._creationTime,
				})),
				i,
			);
			try {
				await reorderNote({
					orgId: newItem.note.orgId,
					noteId: newItem.note._id,
					sortOrder,
				});
			} catch (err) {
				toast.mutationError(err, "Couldn't move note.");
			}
			break; // dnd-kit moves one card at a time
		}
	}

	const isEmpty = items.length === 0;

	return (
		<div
			ref={containerRef}
			className={cn("flex h-full min-h-0 w-full min-w-0 flex-col", className)}
		>
			{/* Internal header bar — single + button. Parents that provide
			    their own toolbar (e.g. NotesView) pass `showAddButton=false`. */}
			{showAddButton && canCreate && (
				<div className="mb-2 flex shrink-0 items-center justify-between">
					<div className="text-[11px] uppercase tracking-wide text-muted-foreground">
						Sticky notes
					</div>
					<Button
						type="button"
						size="sm"
						variant="outline"
						className="h-7 gap-1 px-2 text-xs"
						onClick={handleAdd}
					>
						<PlusIcon className="size-3.5" />
						<span>Add note</span>
					</Button>
				</div>
			)}

			{/* Single-column dnd-kit canvas with a CSS grid inside so cards
			    flow horizontally and wrap to new rows. `rectSortingStrategy`
			    powers 2D drag collisions. */}
			<div className="flex min-h-0 flex-1">
				{/* biome-ignore lint/suspicious/noExplicitAny: Kanban primitive generic slot */}
				<Kanban<any>
					value={value}
					onValueChange={handleValueChange}
					getItemValue={(item: NoteItem) => item.id}
					modifiers={[restrictToBoard]}
				>
					<div className="flex h-full w-full min-w-0 overflow-y-auto overflow-x-hidden">
						<KanbanBoardPrimitive className="flex h-full w-full items-stretch gap-3">
							<KanbanColumn
								value={SINGLE_COLUMN_ID}
								itemStrategy={rectSortingStrategy}
								className="grid h-full w-full min-w-0 auto-rows-min grid-cols-[repeat(auto-fill,minmax(220px,1fr))] content-start gap-3 rounded-[var(--radius)] border border-dashed bg-muted/30 p-3"
							>
								{isEmpty ? (
									<div className="col-span-full flex flex-1 flex-col items-center justify-center gap-1 px-4 py-8 text-center">
										<p className="text-sm font-medium">{emptyTitle}</p>
										<p className="text-xs text-muted-foreground">
											{emptyDescription}
										</p>
									</div>
								) : (
									items.map((item) => {
										const author = authorsById.get(String(item.note.authorId));
										const isAutoFocusTarget = autoFocusNoteId === item.id;
										const isMatch =
											matchedNoteIds?.has(item.id) ?? false;
										return (
											<NoteCard
												key={item.id}
												note={item.note}
												categories={categories}
												authorName={author?.name ?? "Unknown"}
												authorAvatarUrl={author?.avatarUrl}
												currentUserId={currentUserId}
												permissions={permissions}
												orgSlug={orgSlug}
												pickers="both"
												autoFocus={isAutoFocusTarget}
												onAutoFocusConsumed={
													isAutoFocusTarget
														? onAutoFocusConsumed
														: undefined
												}
												isHighlighted={isMatch}
												highlightEpoch={highlightEpoch}
											/>
										);
									})
								)}
							</KanbanColumn>
						</KanbanBoardPrimitive>
					</div>

					<KanbanOverlay>
						{({ value: activeId }) => {
							const item = items.find((it) => it.id === activeId);
							if (!item) return null;
							const author = authorsById.get(String(item.note.authorId));
							return (
								<NoteCard
									note={item.note}
									categories={categories}
									authorName={author?.name ?? "Unknown"}
									authorAvatarUrl={author?.avatarUrl}
									currentUserId={currentUserId}
									permissions={permissions}
									orgSlug={orgSlug}
									pickers="both"
									isDragging
								/>
							);
						}}
					</KanbanOverlay>
				</Kanban>
			</div>
		</div>
	);
}

/**
 * Public helper exposed for parents (e.g. NotesView) that want to drive
 * note creation from THEIR own toolbar button while still routing through
 * this component's logic. Returns the created note's id so the caller can
 * claim auto-focus.
 */
export async function createStickyNote(args: {
	orgId: Id<"orgs">;
	categoryId: Id<"noteCategories">;
	defaultAttachment: { entityType: string; entityId: string; personCode?: string };
	createNote: ReturnType<typeof useCreateNote>;
}): Promise<string> {
	const id = await args.createNote({
		orgId: args.orgId,
		entityType: args.defaultAttachment.entityType,
		entityId: args.defaultAttachment.entityId,
		personCode: args.defaultAttachment.personCode,
		content: PLACEHOLDER_CONTENT,
		categoryId: args.categoryId,
		authorType: "user",
		isInternal: false,
	});
	return String(id);
}
