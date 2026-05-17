/**
 * Notes hooks — wrap Convex queries + mutations for the notes module.
 *
 * Read hooks
 *   - useNotesForEntity     — every note on a single entity (panel use)
 *   - useNotesForPerson     — every note tied to a personCode (cross-entity)
 *   - useNotesForOrg        — org-wide board with optional filters
 *   - useNoteAuthors        — distinct author list for the filter chip
 *   - useNoteCategories     — list of org-defined categories (sorted)
 *   - useDefaultNoteCategory — the org's default category, or null
 *   - useEntitySearch       — typeahead for the per-card +-button popover
 *
 * Write hooks
 *   - useCreateNote, useUpdateNote, useToggleNotePin,
 *     useSetNoteCategory, useSetNoteEntity, useDeleteNote
 *   - useCreateNoteCategory, useUpdateNoteCategory, useArchiveNoteCategory,
 *     useReorderNoteCategories, useSetDefaultNoteCategory,
 *     useDeleteNoteCategory
 *   - useEnsureNoteCategories — idempotent lazy seed (call once on mount)
 */
"use client";

import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";

// ─── Read hooks: notes ───────────────────────────────────────────────────────

/** All notes on an entity. Pinned first, then newest. Used by `NotesPanel`. */
export function useNotesForEntity(args: {
	orgId?: Id<"orgs">;
	entityType: string;
	entityId: string;
}) {
	return useQuery(
		api.crm.shared.notes.queries.listForEntity,
		args.orgId
			? {
					orgId: args.orgId,
					entityType: args.entityType,
					entityId: args.entityId,
				}
			: "skip",
	);
}

/** Notes tied to a personCode (across entity types). */
export function useNotesForPerson(args: { orgId?: Id<"orgs">; personCode: string }) {
	return useQuery(
		api.crm.shared.notes.queries.listForPerson,
		args.orgId ? { orgId: args.orgId, personCode: args.personCode } : "skip",
	);
}

/**
 * Org-wide notes feed with optional filters. Used by `NotesView`. The server
 * picks the cheapest index based on the most selective filter.
 */
export function useNotesForOrg(args: {
	orgId?: Id<"orgs">;
	categoryId?: Id<"noteCategories">;
	authorId?: Id<"users">;
	entityType?: string;
	isPinned?: boolean;
	limit?: number;
}) {
	return useQuery(
		api.crm.shared.notes.queries.listForOrg,
		args.orgId
			? {
					orgId: args.orgId,
					categoryId: args.categoryId,
					authorId: args.authorId,
					entityType: args.entityType,
					isPinned: args.isPinned,
					limit: args.limit,
				}
			: "skip",
	);
}

/** Distinct author list for the filter bar's "by author" chip. */
export function useNoteAuthors(args: { orgId?: Id<"orgs"> }) {
	return useQuery(
		api.crm.shared.notes.queries.listAuthors,
		args.orgId ? { orgId: args.orgId } : "skip",
	);
}

// ─── Read hooks: categories ──────────────────────────────────────────────────

/** Live list of the org's note categories, sorted by `position`. */
export function useNoteCategories(args: { orgId?: Id<"orgs">; includeArchived?: boolean }) {
	return useQuery(
		api.crm.shared.noteCategories.queries.listForOrg,
		args.orgId ? { orgId: args.orgId, includeArchived: args.includeArchived } : "skip",
	);
}

/** Org's default category, or `null` if none is configured yet. */
export function useDefaultNoteCategory(args: { orgId?: Id<"orgs"> }) {
	return useQuery(
		api.crm.shared.noteCategories.queries.getDefault,
		args.orgId ? { orgId: args.orgId } : "skip",
	);
}

// ─── Read hooks: entity search (per-card +-button popover) ───────────────────

export function useEntitySearch(args: {
	orgId?: Id<"orgs">;
	query: string;
	enabled?: boolean;
	limitPerType?: number;
}) {
	const enabled = args.enabled ?? true;
	return useQuery(
		api.crm.shared.notes.queries.searchEntities,
		args.orgId && enabled
			? { orgId: args.orgId, query: args.query, limitPerType: args.limitPerType }
			: "skip",
	);
}

/**
 * Look up the display info for a note's current attachment so the per-card
 * trigger can render the entity's initials avatar instead of the `+` icon.
 * Returns `null` for org-wide notes or when the record was soft-deleted.
 */
export function useAttachmentDisplay(args: {
	orgId?: Id<"orgs">;
	entityType: string;
	entityId: string;
}) {
	const isOrgWide = args.entityType === "org";
	return useQuery(
		api.crm.shared.notes.queries.getAttachmentDisplay,
		args.orgId && !isOrgWide
			? { orgId: args.orgId, entityType: args.entityType, entityId: args.entityId }
			: "skip",
	);
}

// ─── Write hooks: notes ──────────────────────────────────────────────────────

export function useCreateNote() {
	return useMutation(api.crm.shared.notes.mutations.create);
}
export function useUpdateNote() {
	return useMutation(api.crm.shared.notes.mutations.update);
}
export function useToggleNotePin() {
	return useMutation(api.crm.shared.notes.mutations.togglePin);
}
/** Fast-path used by the Kanban drag and the per-card category dot picker. */
export function useSetNoteCategory() {
	return useMutation(api.crm.shared.notes.mutations.setCategory).withOptimisticUpdate(
		(store, args) => {
			// Patch every cached `listForOrg` result that contains this note —
			// the Notes board calls `listForOrg({ orgId })` but other panels may
			// call it with extra filter args, so iterate across all matching
			// query keys.
			const allOrgQueries = store.getAllQueries(api.crm.shared.notes.queries.listForOrg);
			for (const { args: queryArgs, value: list } of allOrgQueries) {
				if (!list) continue;
				if (queryArgs.orgId !== args.orgId) continue;
				const patched = list.map((n) =>
					n._id === args.noteId
						? { ...n, categoryId: args.categoryId, updatedAt: Date.now() }
						: n,
				);
				store.setQuery(api.crm.shared.notes.queries.listForOrg, queryArgs, patched);
			}
			// Also patch listForEntity / listForPerson when they happen to hold
			// the moved note — same shape, same field.
			const entityQueries = store.getAllQueries(api.crm.shared.notes.queries.listForEntity);
			for (const { args: queryArgs, value: list } of entityQueries) {
				if (!list) continue;
				if (queryArgs.orgId !== args.orgId) continue;
				if (!list.some((n) => n._id === args.noteId)) continue;
				store.setQuery(
					api.crm.shared.notes.queries.listForEntity,
					queryArgs,
					list.map((n) =>
						n._id === args.noteId
							? { ...n, categoryId: args.categoryId, updatedAt: Date.now() }
							: n,
					),
				);
			}
			const personQueries = store.getAllQueries(api.crm.shared.notes.queries.listForPerson);
			for (const { args: queryArgs, value: list } of personQueries) {
				if (!list) continue;
				if (queryArgs.orgId !== args.orgId) continue;
				if (!list.some((n) => n._id === args.noteId)) continue;
				store.setQuery(
					api.crm.shared.notes.queries.listForPerson,
					queryArgs,
					list.map((n) =>
						n._id === args.noteId
							? { ...n, categoryId: args.categoryId, updatedAt: Date.now() }
							: n,
					),
				);
			}
		},
	);
}
/** Re-attach a note to a different entity (used by the +-button popover). */
export function useSetNoteEntity() {
	return useMutation(api.crm.shared.notes.mutations.setEntity);
}
export function useDeleteNote() {
	return useMutation(api.crm.shared.notes.mutations.remove);
}

// ─── Write hooks: categories ─────────────────────────────────────────────────

export function useCreateNoteCategory() {
	return useMutation(api.crm.shared.noteCategories.mutations.create);
}
export function useUpdateNoteCategory() {
	return useMutation(api.crm.shared.noteCategories.mutations.update);
}
export function useArchiveNoteCategory() {
	return useMutation(api.crm.shared.noteCategories.mutations.setArchived);
}
export function useReorderNoteCategories() {
	// Optimistic update mirrors the entity-board pattern. Without this, the
	// column drops on the notes board snap back to their original slot before
	// the server response lands, then re-animate to the dropped position —
	// the entity boards don't flicker because their column order is stored in
	// localStorage (synchronous). We're patching the ONE list query the board
	// reads, plus the includeArchived variant settings pages may have open.
	return useMutation(api.crm.shared.noteCategories.mutations.reorder).withOptimisticUpdate(
		(store, args) => {
			const indexById = new Map<string, number>();
			for (let i = 0; i < args.categoryIds.length; i += 1) {
				indexById.set(String(args.categoryIds[i]), i);
			}
			const all = store.getAllQueries(api.crm.shared.noteCategories.queries.listForOrg);
			const now = Date.now();
			for (const { args: queryArgs, value: list } of all) {
				if (!list) continue;
				if (queryArgs.orgId !== args.orgId) continue;
				const patched = list
					.map((cat) => {
						const idx = indexById.get(String(cat._id));
						if (idx === undefined) return cat;
						return { ...cat, position: idx, updatedAt: now };
					})
					.slice()
					.sort((a, b) => a.position - b.position);
				store.setQuery(
					api.crm.shared.noteCategories.queries.listForOrg,
					queryArgs,
					patched,
				);
			}
		},
	);
}
export function useSetDefaultNoteCategory() {
	return useMutation(api.crm.shared.noteCategories.mutations.setDefault);
}
export function useDeleteNoteCategory() {
	return useMutation(api.crm.shared.noteCategories.mutations.remove);
}
/** Idempotent — seeds the default 6 categories on first call for an org. */
export function useEnsureNoteCategories() {
	return useMutation(api.crm.shared.noteCategories.mutations.ensureForOrg);
}
