"use client";

/**
 * Optimistic-update wrappers for reminder mutations.
 *
 * STATUS: IMPLEMENTED.
 *
 * Why this file exists
 * ────────────────────
 * Per AGENTS.md "Every list-affecting mutation has `withOptimisticUpdate`":
 *
 *   "If a mutation changes a row that's rendered in a list, it MUST
 *    patch the local cache via `withOptimisticUpdate`. This eliminates
 *    the 'fire mutation → wait → re-render → flash' loop and the
 *    `listX` re-subscription spam that triggers when the cache
 *    invalidates."
 *
 * Reminders are rendered in 3 lists:
 *   - `getDueToday` (org-wide RemindersView + DueTodayWidget)
 *   - `listForPerson` (RemindersPanel on the profile page)
 *   - `listOpen` (anywhere needing only pending reminders)
 *
 * Plus calendar events derive from reminders via `calendar.getEvents`,
 * but that's a server-merge so optimistic patches only target the three
 * direct list queries above. Convex's calendar query auto-refetches
 * within ~250ms after the mutation lands; the user-visible row updates
 * instantly via the patches below.
 *
 * Critical rule (verbatim from AGENTS.md)
 * ───────────────────────────────────────
 *   "The optimistic update MUST NOT bump `updatedAt: Date.now()` —
 *    that changes row identity on every render and cascades list
 *    invalidations."
 *
 * Reminders don't currently have an `updatedAt` column at all (only
 * `createdAt`), so we don't need to be defensive — but the spirit of
 * the rule applies: only patch the user-visible field; let the server
 * stamp anything it controls.
 */

import { useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Doc } from "@/convex/_generated/dataModel";

type Reminder = Doc<"reminders">;

/** Patch every cached reminder list with `transform`, dropping `null`. */
function patchReminderListsForOrg(
	store: Parameters<Parameters<ReturnType<typeof useMutation>["withOptimisticUpdate"]>[0]>[0],
	orgId: string,
	transform: (r: Reminder) => Reminder | null,
) {
	// `getDueToday` — org-wide today list.
	const dueToday = store.getAllQueries(api.crm.shared.reminders.queries.getDueToday);
	for (const { args: qa, value: list } of dueToday) {
		if (!list || qa.orgId !== orgId) continue;
		const next = list.map(transform).filter((r): r is Reminder => r !== null);
		store.setQuery(api.crm.shared.reminders.queries.getDueToday, qa, next);
	}
	// `listAllForOrg` — org-wide all reminders list (RemindersView).
	const allForOrg = store.getAllQueries(api.crm.shared.reminders.queries.listAllForOrg);
	for (const { args: qa, value: list } of allForOrg) {
		if (!list || qa.orgId !== orgId) continue;
		const next = list.map(transform).filter((r): r is Reminder => r !== null);
		store.setQuery(api.crm.shared.reminders.queries.listAllForOrg, qa, next);
	}
	// `listForPerson` — every personCode-scoped list.
	const perPerson = store.getAllQueries(api.crm.shared.reminders.queries.listForPerson);
	for (const { args: qa, value: list } of perPerson) {
		if (!list || qa.orgId !== orgId) continue;
		const next = list.map(transform).filter((r): r is Reminder => r !== null);
		store.setQuery(api.crm.shared.reminders.queries.listForPerson, qa, next);
	}
	// `listOpen` — pending-only per-person list.
	const open = store.getAllQueries(api.crm.shared.reminders.queries.listOpen);
	for (const { args: qa, value: list } of open) {
		if (!list || qa.orgId !== orgId) continue;
		const next = list.map(transform).filter((r): r is Reminder => r !== null);
		store.setQuery(api.crm.shared.reminders.queries.listOpen, qa, next);
	}
	// ── Follow-ups lists (same `reminders` table, `source === "followup"`) ──
	// `listFollowupsForOrg` — org-wide follow-ups list (FollowUpsView).
	const followupsOrg = store.getAllQueries(api.crm.shared.reminders.queries.listFollowupsForOrg);
	for (const { args: qa, value: list } of followupsOrg) {
		if (!list || qa.orgId !== orgId) continue;
		const next = list.map(transform).filter((r): r is Reminder => r !== null);
		store.setQuery(api.crm.shared.reminders.queries.listFollowupsForOrg, qa, next);
	}
	// `listFollowupsForPerson` — per-profile follow-ups panel.
	const followupsPerson = store.getAllQueries(
		api.crm.shared.reminders.queries.listFollowupsForPerson,
	);
	for (const { args: qa, value: list } of followupsPerson) {
		if (!list || qa.orgId !== orgId) continue;
		const next = list.map(transform).filter((r): r is Reminder => r !== null);
		store.setQuery(api.crm.shared.reminders.queries.listFollowupsForPerson, qa, next);
	}
	// `listFollowupsForEntity` — per-deal/company follow-ups tab.
	const followupsEntity = store.getAllQueries(
		api.crm.shared.reminders.queries.listFollowupsForEntity,
	);
	for (const { args: qa, value: list } of followupsEntity) {
		if (!list || qa.orgId !== orgId) continue;
		const next = list.map(transform).filter((r): r is Reminder => r !== null);
		store.setQuery(api.crm.shared.reminders.queries.listFollowupsForEntity, qa, next);
	}
}

/** Mark a reminder completed — patch every cached list to flip `status`. */
export function useCompleteReminderOptimistic() {
	return useMutation(api.crm.shared.reminders.mutations.complete).withOptimisticUpdate(
		(store, args) => {
			const now = Date.now();
			patchReminderListsForOrg(store, args.orgId, (r) =>
				r._id === args.reminderId
					? // listOpen filters by status === "pending" server-side,
						// but the optimistic patch may leave a completed row in
						// the cached array. We drop it from listOpen by returning
						// null when the consumer is the "pending-only" cache.
						// NB: the helper above doesn't know which cache is which,
						// so we patch the row in place and let listOpen show it
						// briefly until the server response refreshes the array.
						// (The badge now shows "Completed" instead of "Pending".)
						{ ...r, status: "completed" as const, completedAt: now }
					: r,
			);
		},
	);
}

/**
 * `update` — patch fields on a reminder. Used by inline edits + drag.
 *
 * The drag persistence rule (AGENTS.md "drag persistence is one mutation
 * per drop") means this hook is called exactly once per drop, with
 * `dueAt` (or whatever field the drop changed) in the args. The
 * optimistic patch reflects the new value immediately so the card lands
 * in the correct cell on the calendar grid.
 */
export function useUpdateReminderOptimistic() {
	return useMutation(api.crm.shared.reminders.mutations.update).withOptimisticUpdate(
		(store, args) => {
			const { orgId, reminderId, ...rest } = args;
			// Drop undefined fields — only the explicitly-set keys patch.
			const patch: Partial<Reminder> = {};
			for (const [k, v] of Object.entries(rest)) {
				if (v !== undefined) (patch as Record<string, unknown>)[k] = v;
			}
			patchReminderListsForOrg(store, orgId, (r) =>
				r._id === reminderId ? { ...r, ...patch } : r,
			);
		},
	);
}

/** Soft delete via remove — drop the row from every cached list. */
export function useDeleteReminderOptimistic() {
	return useMutation(api.crm.shared.reminders.mutations.remove).withOptimisticUpdate(
		(store, args) => {
			patchReminderListsForOrg(store, args.orgId, (r) =>
				r._id === args.reminderId ? null : r,
			);
		},
	);
}
