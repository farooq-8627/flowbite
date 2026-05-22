/**
 * Follow-ups hooks — wrap the Convex queries + mutations.
 *
 * STATUS: IMPLEMENTED.
 *
 * Doctrine: follow-ups are reminders with `source === "followup"`. The
 * persistence layer is the same `reminders` table — these hooks just
 * read/write the followup subset.
 *
 * Mutations land in the same Convex functions used by the reminders
 * surface (`update`, `complete`, `remove`) so optimistic updates flow
 * through ONE `useReminderMutations` cache patcher and BOTH lists update
 * instantly. The dedicated `createFollowup` mutation exists because the
 * AI tool layer needs a CRM-cadence-specific arg schema and a distinct
 * activity-log verb (`followup_created` vs `reminder_created`).
 */
"use client";

import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
// Reuse the optimistic-update wrappers from the reminders module — they
// already patch every cached `reminders.*` list (including
// `listFollowupsForOrg/Person/Entity` once we add them to the patcher,
// see useFollowupMutations below).
import {
	useCompleteReminderOptimistic,
	useDeleteReminderOptimistic,
	useUpdateReminderOptimistic,
} from "@/core/scheduling/reminders/hooks/useReminderMutations";

// ─── Read hooks ──────────────────────────────────────────────────────────────

/**
 * All follow-ups across the org. Powers `FollowUpsView` and the
 * dashboard's Follow-ups card.
 *
 * Filter on the server via the `by_org_and_source_and_due` index — no
 * full-table scan. Members without `reminders.manage` see only their own
 * assigned items.
 */
export function useFollowupsForOrg(args: { orgId?: Id<"orgs">; status?: "pending" | "completed" }) {
	return useQuery(
		api.crm.shared.reminders.queries.listFollowupsForOrg,
		args.orgId
			? args.status
				? { orgId: args.orgId, status: args.status }
				: { orgId: args.orgId }
			: "skip",
	);
}

/**
 * Follow-ups for one person. Used by the profile-tab Follow-ups panel.
 */
export function useFollowupsForPerson(args: { orgId?: Id<"orgs">; personCode: string }) {
	return useQuery(
		api.crm.shared.reminders.queries.listFollowupsForPerson,
		args.orgId ? { orgId: args.orgId, personCode: args.personCode } : "skip",
	);
}

/**
 * Follow-ups for one entity (deal/company detail). Used by the deal /
 * company detail Follow-ups tab.
 */
export function useFollowupsForEntity(args: {
	orgId?: Id<"orgs">;
	entityType?: string;
	entityId?: string;
}) {
	return useQuery(
		api.crm.shared.reminders.queries.listFollowupsForEntity,
		args.orgId && args.entityType && args.entityId
			? { orgId: args.orgId, entityType: args.entityType, entityId: args.entityId }
			: "skip",
	);
}

// ─── Write hooks ─────────────────────────────────────────────────────────────

/**
 * Create a follow-up. Wraps the dedicated `createFollowup` mutation
 * which:
 *   - sets `source: "followup"` server-side
 *   - resolves default `dueAt` from `org.settings.followupDefaults.defaultDueOffsetDays`
 *   - resolves default `priority` from `org.settings.followupDefaults.defaultPriority`
 *   - logs `followup_created` (not `reminder_created`)
 *
 * No optimistic update — server assigns the id + followUpCode + dueAt.
 * The list re-renders in ~250ms when the new row lands.
 */
export function useCreateFollowup() {
	return useMutation(api.crm.shared.reminders.mutations.createFollowup);
}

/**
 * Update a follow-up. Same `reminders.update` mutation as the reminders
 * surface — the optimistic patch flows through `useReminderMutations`
 * and updates every cached list (including the followups lists added
 * via `useFollowupMutations`).
 */
export function useUpdateFollowup() {
	return useUpdateReminderOptimistic();
}

/** Mark a follow-up completed — instant via optimistic update. */
export function useCompleteFollowup() {
	return useCompleteReminderOptimistic();
}

/** Delete a follow-up — instant via optimistic update. */
export function useDeleteFollowup() {
	return useDeleteReminderOptimistic();
}
