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
import { useMemo } from "react";
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
 * Batched attachment-display lookup for an entire board (NotesView).
 * Replaces 50+ per-card individual subscriptions with a single query.
 * The caller passes the unique (entityType, entityId) tuples extracted
 * from the visible notes; the result is a Record keyed by
 * `${entityType}:${entityId}` mapping to display info.
 *
 * Returns `undefined` while loading and an empty record when there are no
 * non-org-wide attachments.
 */
export function useAttachmentDisplaysForOrg(args: {
	orgId?: Id<"orgs">;
	attachments: ReadonlyArray<{ entityType: string; entityId: string }>;
}) {
	// Stabilise the tuple list so the Convex client doesn't see a new args
	// reference on every parent render. We compute a deterministic string
	// key first (ordered, de-duped), then derive the array from it. This
	// keeps the hook deps as a single PRIMITIVE — biome is happy and the
	// `useMemo` cache only invalidates when the actual set of tuples changes.
	const cacheKey = useMemo(() => {
		const seen = new Set<string>();
		const keys: string[] = [];
		for (const a of args.attachments) {
			if (a.entityType === "org") continue;
			const k = `${a.entityType}:${a.entityId}`;
			if (seen.has(k)) continue;
			seen.add(k);
			keys.push(k);
		}
		keys.sort();
		return keys.join("|");
	}, [args.attachments]);

	const stableAttachments = useMemo(() => {
		if (cacheKey.length === 0) return [] as Array<{ entityType: string; entityId: string }>;
		return cacheKey.split("|").map((k) => {
			const [entityType, ...rest] = k.split(":");
			return { entityType: entityType as string, entityId: rest.join(":") };
		});
	}, [cacheKey]);

	return useQuery(
		api.crm.shared.notes.queries.listAttachmentDisplaysForOrg,
		args.orgId && stableAttachments.length > 0
			? { orgId: args.orgId, attachments: stableAttachments }
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
			//
			// We do NOT optimistically bump `updatedAt` — `Date.now()` would
			// change the value on every render, cascading invalidations to
			// every subscriber. The server stamp lands when the mutation
			// resolves; until then the cached `updatedAt` stays stable.
			const allOrgQueries = store.getAllQueries(api.crm.shared.notes.queries.listForOrg);
			for (const { args: queryArgs, value: list } of allOrgQueries) {
				if (!list) continue;
				if (queryArgs.orgId !== args.orgId) continue;
				const patched = list.map((n) =>
					n._id === args.noteId
						? {
								...n,
								categoryId: args.categoryId,
								sortOrder: args.sortOrder ?? n.sortOrder,
							}
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
							? {
									...n,
									categoryId: args.categoryId,
									sortOrder: args.sortOrder ?? n.sortOrder,
								}
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
							? {
									...n,
									categoryId: args.categoryId,
									sortOrder: args.sortOrder ?? n.sortOrder,
								}
							: n,
					),
				);
			}
		},
	);
}

/**
 * In-column reorder fast-path. Drag-drop within the same column updates
 * only `sortOrder`; the optimistic patch keeps the card in its dropped
 * position the moment the user releases the mouse.
 *
 * Note: we DO NOT bump `updatedAt` in the optimistic patch. Bumping it
 * with `Date.now()` would change the row reference on every render even
 * if the cached value matches the server (since `Date.now()` always
 * differs), which would cascade through every subscriber of every cached
 * `listForOrg` / `listForEntity` / `listForPerson` query that includes
 * this note. The server stamp is authoritative when the mutation lands.
 */
export function useReorderNote() {
	return useMutation(api.crm.shared.notes.mutations.reorder).withOptimisticUpdate(
		(store, args) => {
			const patchList = <
				Q extends
					| typeof api.crm.shared.notes.queries.listForOrg
					| typeof api.crm.shared.notes.queries.listForEntity
					| typeof api.crm.shared.notes.queries.listForPerson,
			>(
				query: Q,
			) => {
				const all = store.getAllQueries(query);
				for (const { args: queryArgs, value: list } of all) {
					if (!list) continue;
					if ((queryArgs as { orgId: Id<"orgs"> }).orgId !== args.orgId) continue;
					if (!list.some((n) => n._id === args.noteId)) continue;
					store.setQuery(
						query,
						queryArgs,
						list.map((n) =>
							n._id === args.noteId ? { ...n, sortOrder: args.sortOrder } : n,
						),
					);
				}
			};
			patchList(api.crm.shared.notes.queries.listForOrg);
			patchList(api.crm.shared.notes.queries.listForEntity);
			patchList(api.crm.shared.notes.queries.listForPerson);
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
