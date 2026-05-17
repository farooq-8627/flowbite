"use client";

/**
 * NotesCategoryKanban — single Kanban grouped by note category.
 *
 * Built on the SAME `core/data-display/kanban/components/KanbanBoard`
 * primitive that Leads / Contacts / Deals / Companies use. Same drag,
 * same column header (drag handle, color dot, count, optional `+`),
 * same drop animation, same optimistic-update pattern.
 *
 * Notes-specific deltas vs. an entity board:
 *   1. The header `+` button on a column creates a real note card (no
 *      intermediate inline composer). The fresh card mounts in edit mode
 *      with its placeholder text selected so the user can type immediately
 *      — exactly the same flow as the page-level "Add Note" button. The
 *      auto-focus claim is owned by the parent (NotesView / NotesPanel)
 *      so it survives the Convex round-trip and the subscription update
 *      that brings the new note into the cached list.
 *   2. The card itself is `NoteCard` (sticky-styled, coloured by
 *      category, draggable via the same `KanbanItem` primitive).
 *   3. There is NO category dropdown on the card — recategorize is by
 *      drag only, matching the entities pattern.
 */

import { useMemo } from "react";
import type { Doc, Id } from "@/convex/_generated/dataModel";
import {
	KanbanBoard,
	type KanbanColumnConfig,
} from "@/core/data-display/kanban/components/KanbanBoard";
import { computeSortOrderForDrop } from "@/core/data-display/kanban/utils/sort-order";
import { toast } from "@/lib/toast";
import { cn } from "@/lib/utils";
import { useCreateNote, useReorderNote, useReorderNoteCategories, useSetNoteCategory } from "../hooks";
import { NoteCard } from "./NoteCard";

/**
 * Each item handed to `KanbanBoard` must have a string `id`. Notes carry a
 * Convex `_id`, so we wrap them once at the parent and re-expose the original
 * doc via `note`.
 */
type NoteItem = { id: string; note: Doc<"notes"> };

interface NotesCategoryKanbanProps {
	notes: Doc<"notes">[] | undefined;
	categories: Doc<"noteCategories">[] | undefined;
	authorsById: Map<string, { name: string; avatarUrl?: string }>;
	currentUserId: Id<"users"> | undefined;
	permissions: ReadonlyArray<string>;
	orgSlug?: string;
	/** Default attachment for newly-created cards. */
	defaultAttachment: { entityType: string; entityId: string; personCode?: string };
	canCreate: boolean;
	/** When true, board column drag persists to the server (Owner/Admin). */
	canManageCategories?: boolean;
	className?: string;
	/** Optional: hidden category ids (view-options). */
	hiddenCategoryIds?: ReadonlyArray<Id<"noteCategories">>;
	/**
	 * When true, only pinned cards (`note.isPinned`) are rendered. Applied
	 * after the hidden-categories filter so pin + category filters compose
	 * (AND — both must match for a card to show).
	 */
	pinnedOnly?: boolean;
	/**
	 * Which corner pickers each card should render. Default `"both"` for
	 * the org-wide page; `"category"` for embedded panels where the entity
	 * is locked by context. See `NoteCard.pickers`.
	 */
	pickers?: "category" | "entity" | "both";
	/**
	 * Note id to mount in edit-mode + auto-focused on the next render. The
	 * parent sets this after a `createNote` mutation returns. The kanban
	 * threads it down to the matching `NoteCard` and clears it through
	 * `onAutoFocusConsumed` once the focus has been applied.
	 */
	autoFocusNoteId?: string | null;
	onAutoFocusConsumed?: () => void;
	/**
	 * Called when the parent should claim auto-focus for a freshly-created
	 * note id (the column `+` flow). Receives the new note's id.
	 */
	onCreatedNote?: (noteId: string) => void;
	/**
	 * Set of note ids that match the current search query. When non-empty,
	 * matches float to the top of every column (above pinned) and trigger
	 * the per-card `note-card-flash` outline highlight.
	 */
	matchedNoteIds?: ReadonlySet<string>;
	/** Incrementing counter that retriggers the flash on every fresh search. */
	highlightEpoch?: number;
}

const PLACEHOLDER_CONTENT = "New note";

export function NotesCategoryKanban({
	notes,
	categories,
	authorsById,
	currentUserId,
	permissions,
	orgSlug,
	defaultAttachment,
	canCreate,
	canManageCategories = false,
	className,
	hiddenCategoryIds = [],
	pinnedOnly = false,
	pickers = "both",
	autoFocusNoteId,
	onAutoFocusConsumed,
	onCreatedNote,
	matchedNoteIds,
	highlightEpoch,
}: NotesCategoryKanbanProps) {
	const setCategory = useSetNoteCategory();
	const reorderNote = useReorderNote();
	const reorderCategories = useReorderNoteCategories();
	const createNote = useCreateNote();

	const visibleCategories = useMemo(() => {
		if (!categories) return undefined;
		const hidden = new Set(hiddenCategoryIds.map(String));
		return categories
			.filter((c) => !c.isArchived && !hidden.has(String(c._id)))
			.slice()
			.sort((a, b) => a.position - b.position);
	}, [categories, hiddenCategoryIds]);

	const boardColumns: KanbanColumnConfig[] = useMemo(
		() =>
			(visibleCategories ?? []).map((c) => ({
				id: String(c._id),
				title: c.name,
				color: c.bgColor,
			})),
		[visibleCategories],
	);

	const itemsByColumnId = useMemo(() => {
		const map: Record<string, NoteItem[]> = {};
		if (visibleCategories) {
			for (const c of visibleCategories) map[String(c._id)] = [];
		}
		for (const n of notes ?? []) {
			// Pinned-only filter runs before bucketing — non-pinned cards
			// never make it into a column when the user has flipped the
			// "Show only pinned" switch in the filter popover.
			if (pinnedOnly && !n.isPinned) continue;
			const key = n.categoryId ? String(n.categoryId) : null;
			if (key !== null && map[key] !== undefined) {
				map[key].push({ id: String(n._id), note: n });
			}
		}
		// Sort priority within each column:
		//   1. search matches (so the user scans hits top-down even if a
		//      non-matching note happens to be pinned),
		//   2. sortOrder asc (the user-chosen drag-drop position).
		// Pinned-first is no longer an ordering signal — pin is purely a
		// visual flag now; users move pinned cards to the top by dragging.
		const matched = matchedNoteIds ?? new Set<string>();
		for (const key of Object.keys(map)) {
			map[key].sort((a, b) => {
				const aMatch = matched.has(a.id);
				const bMatch = matched.has(b.id);
				if (aMatch !== bMatch) return aMatch ? -1 : 1;
				const aKey = a.note.sortOrder ?? -a.note._creationTime;
				const bKey = b.note.sortOrder ?? -b.note._creationTime;
				return aKey - bKey;
			});
		}
		return map;
	}, [notes, visibleCategories, matchedNoteIds, pinnedOnly]);

	async function handleCardMove(itemId: string, fromCol: string, toCol: string, newIndex: number) {
		const note = (notes ?? []).find((n) => String(n._id) === itemId);
		if (!note) return;

		// Reconstruct the destination column AFTER the drop so we can find
		// the two cards on either side of `newIndex` and compute the
		// midpoint sortOrder.
		const destBefore = itemsByColumnId[toCol] ?? [];
		let itemsAfter: NoteItem[];
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
			const moved = { id: itemId, note };
			const copy = destBefore.slice();
			copy.splice(newIndex, 0, moved);
			itemsAfter = copy;
		}
		const sortOrder = computeSortOrderForDrop(
			itemsAfter.map((it) => ({
				id: it.id,
				sortOrder: it.note.sortOrder,
				_creationTime: it.note._creationTime,
			})),
			newIndex,
		);

		try {
			if (fromCol === toCol) {
				// In-column reorder fast-path — only sortOrder changes.
				await reorderNote({ orgId: note.orgId, noteId: note._id, sortOrder });
			} else {
				// Cross-column move — categoryId + sortOrder atomically.
				await setCategory({
					orgId: note.orgId,
					noteId: note._id,
					categoryId: toCol as Id<"noteCategories">,
					sortOrder,
				});
			}
		} catch (err) {
			toast.mutationError(err, "Couldn't move note.");
		}
	}

	/**
	 * Spawn a new card at the top of the chosen column.
	 *
	 * Mirrors the page-level `Add Note` flow: create the row with the
	 * `PLACEHOLDER_CONTENT` sentinel, then claim auto-focus on the returned
	 * id. The card itself owns the focus + select-all once it mounts (see
	 * `NoteCard.autoFocus`). No more intermediate composer component.
	 */
	async function handleAddToColumn(colId: string) {
		const cat = visibleCategories?.find((c) => String(c._id) === colId);
		if (!cat) return;
		try {
			const newId = await createNote({
				orgId: cat.orgId,
				entityType: defaultAttachment.entityType,
				entityId: defaultAttachment.entityId,
				personCode: defaultAttachment.personCode,
				content: PLACEHOLDER_CONTENT,
				categoryId: cat._id,
				authorType: "user",
				isInternal: false,
			});
			onCreatedNote?.(String(newId));
		} catch (err) {
			toast.mutationError(err, "Couldn't add note.");
		}
	}

	/**
	 * Persist a column drag. Workspace categories live in `noteCategories`
	 * with a `position` field — the reorder mutation accepts the new id list
	 * and re-stamps positions in order. The list MUST include every category
	 * (mutation rejects partial lists), so we splice the new visible order
	 * back into the full list, preserving archived rows at their existing
	 * positions.
	 */
	async function handleColumnReorder(newVisibleOrder: string[]) {
		if (!canManageCategories || !categories) return;
		const orgId = categories[0]?.orgId;
		if (!orgId) return;
		const visibleIds = new Set(newVisibleOrder);
		const orderedVisible = newVisibleOrder
			.map((id) => categories.find((c) => String(c._id) === id))
			.filter((c): c is Doc<"noteCategories"> => Boolean(c) && !c?.isArchived);
		const archivedAndHidden = categories
			.slice()
			.sort((a, b) => a.position - b.position)
			.filter((c) => c.isArchived || !visibleIds.has(String(c._id)));
		const finalOrder = [...orderedVisible, ...archivedAndHidden].map((c) => c._id);
		try {
			await reorderCategories({ orgId, categoryIds: finalOrder });
		} catch (err) {
			toast.mutationError(err, "Couldn't reorder categories.");
		}
	}

	function renderCard(item: NoteItem, isDragging: boolean) {
		const note = item.note;
		const author = authorsById.get(String(note.authorId));
		const isAutoFocusTarget = autoFocusNoteId === item.id;
		const isMatch = matchedNoteIds?.has(item.id) ?? false;
		return (
			<NoteCard
				key={item.id}
				note={note}
				categories={categories}
				authorName={author?.name ?? "Unknown"}
				authorAvatarUrl={author?.avatarUrl}
				currentUserId={currentUserId}
				permissions={permissions}
				orgSlug={orgSlug}
				isDragging={isDragging}
				pickers={pickers}
				autoFocus={isAutoFocusTarget}
				onAutoFocusConsumed={isAutoFocusTarget ? onAutoFocusConsumed : undefined}
				isHighlighted={isMatch}
				highlightEpoch={highlightEpoch}
			/>
		);
	}

	return (
		<div className={cn("flex h-full min-h-0 w-full min-w-0", className)}>
			<KanbanBoard<NoteItem>
				columns={boardColumns}
				itemsByColumnId={itemsByColumnId}
				renderCard={renderCard}
				onCardMove={handleCardMove}
				addCardAllowedColumns={canCreate ? "all" : []}
				addCardSlot="header"
				addCardLabel="Add note"
				onAddToColumn={canCreate ? handleAddToColumn : undefined}
				onColumnReorder={canManageCategories ? handleColumnReorder : undefined}
			/>
		</div>
	);
}
