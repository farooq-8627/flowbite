/**
 * Reminders hooks — wrap Convex queries + mutations.
 *
 * Status: IMPLEMENTED (Phase 2 backend already exists; this is the React wrapper).
 */
"use client";

import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";

// ─── Read hooks ──────────────────────────────────────────────────────────────

/** All reminders for one person — used by `RemindersPanel`. */
export function useRemindersForPerson(args: { orgId?: Id<"orgs">; personCode: string }) {
	return useQuery(
		api.crm.shared.reminders.queries.listForPerson,
		args.orgId ? { orgId: args.orgId, personCode: args.personCode } : "skip",
	);
}

/** Reminders due today (across the org). Used by `DueTodayWidget`. */
export function useRemindersDueToday(args: { orgId?: Id<"orgs"> }) {
	return useQuery(
		api.crm.shared.reminders.queries.getDueToday,
		args.orgId ? { orgId: args.orgId } : "skip",
	);
}

/** Pending reminders for one person. */
export function useRemindersOpen(args: { orgId?: Id<"orgs">; personCode: string }) {
	return useQuery(
		api.crm.shared.reminders.queries.listOpen,
		args.orgId ? { orgId: args.orgId, personCode: args.personCode } : "skip",
	);
}

// ─── Write hooks ─────────────────────────────────────────────────────────────

/** Create a reminder (followUpCode auto-generated). */
export function useCreateReminder() {
	return useMutation(api.crm.shared.reminders.mutations.create);
}

/** Mark a reminder as completed. */
export function useCompleteReminder() {
	return useMutation(api.crm.shared.reminders.mutations.complete);
}

/** Update reminder fields (title, note, dueAt, assignedTo). */
export function useUpdateReminder() {
	return useMutation(api.crm.shared.reminders.mutations.update);
}

/** Delete a reminder. */
export function useDeleteReminder() {
	return useMutation(api.crm.shared.reminders.mutations.remove);
}
