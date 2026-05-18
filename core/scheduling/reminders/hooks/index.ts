/**
 * Reminders hooks — wrap Convex queries + mutations.
 *
 * STATUS: IMPLEMENTED.
 *
 * Mutations use the optimistic-update wrappers from
 * `./useReminderMutations.ts` so quick-complete, drag-to-reschedule,
 * inline edits, and deletes update every list (org-wide, per-person,
 * open-only) instantly — per AGENTS.md "every list-affecting mutation
 * has `withOptimisticUpdate`".
 */
"use client";

import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import {
	useCompleteReminderOptimistic,
	useDeleteReminderOptimistic,
	useUpdateReminderOptimistic,
} from "./useReminderMutations";

// ─── Read hooks ──────────────────────────────────────────────────────────────

/** All reminders for one person — used by `RemindersPanel`. */
export function useRemindersForPerson(args: { orgId?: Id<"orgs">; personCode: string }) {
	return useQuery(
		api.crm.shared.reminders.queries.listForPerson,
		args.orgId ? { orgId: args.orgId, personCode: args.personCode } : "skip",
	);
}

/** Reminders due today (across the org). Used by `DueTodayWidget` + `MyOverdueWidget`. */
export function useRemindersDueToday(args: { orgId?: Id<"orgs"> }) {
	return useQuery(
		api.crm.shared.reminders.queries.getDueToday,
		args.orgId ? { orgId: args.orgId } : "skip",
	);
}

/**
 * Reminders pending AND (overdue OR due today). Powers the dashboard
 * "Reminders" card so reminders dragged to yesterday still surface as
 * overdue.
 */
export function useRemindersDueAndOverdue(args: { orgId?: Id<"orgs">; lookbackDays?: number }) {
	return useQuery(
		api.crm.shared.reminders.queries.getDueAndOverdue,
		args.orgId
			? args.lookbackDays !== undefined
				? { orgId: args.orgId, lookbackDays: args.lookbackDays }
				: { orgId: args.orgId }
			: "skip",
	);
}

/**
 * Next N pending reminders strictly after today. Used by the "next
 * reminder" fallback shown when overdue + today are empty.
 */
export function useRemindersNextUpcoming(args: {
	orgId?: Id<"orgs">;
	limit?: number;
	horizonDays?: number;
}) {
	return useQuery(
		api.crm.shared.reminders.queries.getNextUpcoming,
		args.orgId
			? {
					orgId: args.orgId,
					...(args.limit !== undefined ? { limit: args.limit } : {}),
					...(args.horizonDays !== undefined ? { horizonDays: args.horizonDays } : {}),
				}
			: "skip",
	);
}

/** ALL reminders for the org — powers RemindersView (Today/Open/Completed/All tabs). */
export function useRemindersAllForOrg(args: { orgId?: Id<"orgs"> }) {
	return useQuery(
		api.crm.shared.reminders.queries.listAllForOrg,
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

/**
 * Create a reminder (followUpCode auto-generated).
 *
 * `create` does NOT have an optimistic update — server-assigned id is
 * authoritative, and the `getDueToday` / `listForPerson` lists naturally
 * re-render when the new row lands (~250ms).
 */
export function useCreateReminder() {
	return useMutation(api.crm.shared.reminders.mutations.create);
}

/** Mark a reminder as completed — instant via optimistic update. */
export function useCompleteReminder() {
	return useCompleteReminderOptimistic();
}

/** Update reminder fields — instant via optimistic update. */
export function useUpdateReminder() {
	return useUpdateReminderOptimistic();
}

/** Delete a reminder — instant via optimistic update. */
export function useDeleteReminder() {
	return useDeleteReminderOptimistic();
}
