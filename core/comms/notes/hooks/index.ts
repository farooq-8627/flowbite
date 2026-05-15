/**
 * Notes hooks — wrap Convex queries + mutations for the notes module.
 *
 * Status: IMPLEMENTED (Phase 2 backend already exists; this is the React wrapper).
 */
"use client";

import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";

// ─── Read hooks ──────────────────────────────────────────────────────────────

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

// ─── Write hooks ─────────────────────────────────────────────────────────────

/** Create a note. */
export function useCreateNote() {
	return useMutation(api.crm.shared.notes.mutations.create);
}

/** Update a note (own note or admin). */
export function useUpdateNote() {
	return useMutation(api.crm.shared.notes.mutations.update);
}

/** Toggle pinned-state on a note. */
export function useToggleNotePin() {
	return useMutation(api.crm.shared.notes.mutations.togglePin);
}

/** Delete a note (own note or admin). */
export function useDeleteNote() {
	return useMutation(api.crm.shared.notes.mutations.remove);
}
