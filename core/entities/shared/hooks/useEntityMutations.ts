"use client";

/**
 * Entity-mutation hooks with optimistic updates wired in.
 *
 * Why this exists
 * ───────────────
 * Per AGENTS.md "Every list-affecting mutation has `withOptimisticUpdate`":
 *
 *   "If a mutation changes a row that's rendered in a list, it MUST
 *    patch the local cache via `withOptimisticUpdate`. This eliminates
 *    the 'fire mutation → wait → re-render → flash' loop and the
 *    `listX` re-subscription spam that triggers when the cache
 *    invalidates."
 *
 * Before this file landed, only `LeadsView::updateLead` and
 * `DealsView::moveToStage` had optimistic updates. Inline edits, drag
 * persists in Contacts/Companies, soft-deletes, and "revert to lead"
 * went through bare `useMutation(...)` calls — every one of which
 * caused the corresponding `list` query to invalidate, refetch, and
 * cascade re-renders to every subscriber.
 *
 * What's optimistic
 * ─────────────────
 * Each `update*` hook patches every cached `list` query for the org so
 * the row updates the moment the user commits an edit / finishes a
 * drag. `softDelete*` hooks remove the row from the cache. `revert*`
 * (contact → lead) removes the contact from the contacts cache; the
 * leads list re-renders from the server response when navigation
 * lands the user on the leads page.
 *
 * What's NOT optimistic (intentional)
 * ───────────────────────────────────
 *   - `create*` — no row to patch yet; the server-assigned id is
 *     authoritative. The `list` query naturally re-renders when the
 *     new row lands.
 *   - `convertToContact` — splits one row across two tables and runs
 *     code-generation server-side; too much state to mirror locally.
 *   - `attachTag` / `detachTag` — already covered by the batched
 *     `useEntityTagsMap` cache key invalidation.
 *
 * Critical rule (verbatim from AGENTS.md)
 * ───────────────────────────────────────
 *   "The optimistic update MUST NOT bump `updatedAt: Date.now()` —
 *    that changes row identity on every render and cascades list
 *    invalidations."
 *
 * We honour this everywhere below: every patch reuses the existing
 * `updatedAt` from the cached row.
 */

import { useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Doc } from "@/convex/_generated/dataModel";

// ─── leads ─────────────────────────────────────────────────────────────────

/**
 * `updateLead` — patches the matching row in every cached `leads.list`
 * variant. Replaces `LeadsView`'s inline copy; can be reused from
 * `EditLeadDrawer`, `InlineFieldEdit`, `useLeadMutations`, etc.
 *
 * `getAllQueries` covers callers that filter by status/assignedTo/source —
 * the row may exist in N caches simultaneously and each must be patched.
 */
export function useUpdateLead() {
	return useMutation(api.crm.entities.leads.mutations.update).withOptimisticUpdate(
		(store, args) => {
			const all = store.getAllQueries(api.crm.entities.leads.queries.list);
			for (const { args: qa, value: list } of all) {
				if (!list) continue;
				if (qa.orgId !== args.orgId) continue;
				if (!list.some((l) => l._id === args.leadId)) continue;
				const { orgId: _o, leadId: _l, ...patch } = args;
				store.setQuery(
					api.crm.entities.leads.queries.list,
					qa,
					list.map((l) => (l._id === args.leadId ? { ...l, ...patch } : l)),
				);
			}
		},
	);
}

export function useSoftDeleteLead() {
	return useMutation(api.crm.entities.leads.mutations.softDelete).withOptimisticUpdate(
		(store, args) => {
			const all = store.getAllQueries(api.crm.entities.leads.queries.list);
			for (const { args: qa, value: list } of all) {
				if (!list) continue;
				if (qa.orgId !== args.orgId) continue;
				if (!list.some((l) => l._id === args.leadId)) continue;
				store.setQuery(
					api.crm.entities.leads.queries.list,
					qa,
					list.filter((l) => l._id !== args.leadId),
				);
			}
		},
	);
}

// ─── contacts ──────────────────────────────────────────────────────────────

export function useUpdateContact() {
	return useMutation(api.crm.entities.contacts.mutations.update).withOptimisticUpdate(
		(store, args) => {
			const all = store.getAllQueries(api.crm.entities.contacts.queries.list);
			for (const { args: qa, value: list } of all) {
				if (!list) continue;
				if (qa.orgId !== args.orgId) continue;
				if (!list.some((c) => c._id === args.contactId)) continue;
				const { orgId: _o, contactId: _c, ...patch } = args;
				store.setQuery(
					api.crm.entities.contacts.queries.list,
					qa,
					list.map((c) => (c._id === args.contactId ? { ...c, ...patch } : c)),
				);
			}
		},
	);
}

export function useSoftDeleteContact() {
	return useMutation(api.crm.entities.contacts.mutations.softDelete).withOptimisticUpdate(
		(store, args) => {
			const all = store.getAllQueries(api.crm.entities.contacts.queries.list);
			for (const { args: qa, value: list } of all) {
				if (!list) continue;
				if (qa.orgId !== args.orgId) continue;
				if (!list.some((c) => c._id === args.contactId)) continue;
				store.setQuery(
					api.crm.entities.contacts.queries.list,
					qa,
					list.filter((c) => c._id !== args.contactId),
				);
			}
		},
	);
}

/**
 * `revertToLead` — removes the row from the contacts list cache. We
 * deliberately do NOT optimistically insert the resurrected lead into
 * the leads cache because we don't have all required lead fields
 * client-side (e.g. status resolution, regenerated indexes). The leads
 * list will re-render from the server response when the user lands on
 * the leads page; meanwhile the contacts list reflects the user's
 * intent immediately.
 */
export function useRevertContactToLead() {
	return useMutation(api.crm.entities.contacts.mutations.revertToLead).withOptimisticUpdate(
		(store, args) => {
			const all = store.getAllQueries(api.crm.entities.contacts.queries.list);
			for (const { args: qa, value: list } of all) {
				if (!list) continue;
				if (qa.orgId !== args.orgId) continue;
				if (!list.some((c) => c._id === args.contactId)) continue;
				store.setQuery(
					api.crm.entities.contacts.queries.list,
					qa,
					list.filter((c) => c._id !== args.contactId),
				);
			}
		},
	);
}

// ─── deals ─────────────────────────────────────────────────────────────────

export function useUpdateDeal() {
	return useMutation(api.crm.entities.deals.mutations.update).withOptimisticUpdate(
		(store, args) => {
			const all = store.getAllQueries(api.crm.entities.deals.queries.list);
			for (const { args: qa, value: list } of all) {
				if (!list) continue;
				if (qa.orgId !== args.orgId) continue;
				if (!list.some((d) => d._id === args.dealId)) continue;
				const { orgId: _o, dealId: _d, ...patch } = args;
				store.setQuery(
					api.crm.entities.deals.queries.list,
					qa,
					list.map((d) => (d._id === args.dealId ? { ...d, ...patch } : d)),
				);
			}
		},
	);
}

export function useSoftDeleteDeal() {
	return useMutation(api.crm.entities.deals.mutations.softDelete).withOptimisticUpdate(
		(store, args) => {
			const all = store.getAllQueries(api.crm.entities.deals.queries.list);
			for (const { args: qa, value: list } of all) {
				if (!list) continue;
				if (qa.orgId !== args.orgId) continue;
				if (!list.some((d) => d._id === args.dealId)) continue;
				store.setQuery(
					api.crm.entities.deals.queries.list,
					qa,
					list.filter((d) => d._id !== args.dealId),
				);
			}
		},
	);
}

/**
 * `moveToStage` — kanban drag handler for deals. Patches `currentStageId` +
 * `stageEnteredAt` in every cached `deals.list` variant.
 *
 * We deliberately skip patching `listGroupedByStage`: its return value
 * carries server-derived fields (`daysInStage`, `isStale`) that we can't
 * recompute correctly on the client without duplicating the staleness
 * logic. The drag visual is driven by the flat `list` cache (which the
 * board view also reads via `flatDeals`); when the server response lands
 * for the grouped variant, it reconciles smoothly.
 *
 * `stageEnteredAt` IS bumped optimistically (unlike `updatedAt`) because
 * it's a user-visible field rendered on the card ("In stage X for N
 * days"). Rendering yesterday's value during the optimistic window would
 * be misleading. The server stamps it for real on commit.
 */
export function useMoveDealToStage() {
	return useMutation(api.crm.entities.deals.mutations.moveToStage).withOptimisticUpdate(
		(store, args) => {
			const now = Date.now();
			const all = store.getAllQueries(api.crm.entities.deals.queries.list);
			for (const { args: qa, value: list } of all) {
				if (!list) continue;
				if (qa.orgId !== args.orgId) continue;
				if (!list.some((d) => d._id === args.dealId)) continue;
				store.setQuery(
					api.crm.entities.deals.queries.list,
					qa,
					list.map((d) =>
						d._id === args.dealId
							? {
									...d,
									currentStageId: args.stageId,
									stageEnteredAt: now,
								}
							: d,
					),
				);
			}
		},
	);
}

// ─── companies ─────────────────────────────────────────────────────────────

export function useUpdateCompany() {
	return useMutation(api.crm.entities.companies.mutations.update).withOptimisticUpdate(
		(store, args) => {
			const all = store.getAllQueries(api.crm.entities.companies.queries.list);
			for (const { args: qa, value: list } of all) {
				if (!list) continue;
				if (qa.orgId !== args.orgId) continue;
				if (!list.some((c) => c._id === args.companyId)) continue;
				const { orgId: _o, companyId: _c, ...patch } = args;
				store.setQuery(
					api.crm.entities.companies.queries.list,
					qa,
					list.map((c) => (c._id === args.companyId ? { ...c, ...patch } : c)),
				);
			}
		},
	);
}

export function useSoftDeleteCompany() {
	return useMutation(api.crm.entities.companies.mutations.softDelete).withOptimisticUpdate(
		(store, args) => {
			const all = store.getAllQueries(api.crm.entities.companies.queries.list);
			for (const { args: qa, value: list } of all) {
				if (!list) continue;
				if (qa.orgId !== args.orgId) continue;
				if (!list.some((c) => c._id === args.companyId)) continue;
				store.setQuery(
					api.crm.entities.companies.queries.list,
					qa,
					list.filter((c) => c._id !== args.companyId),
				);
			}
		},
	);
}

// ─── tag attach / detach ───────────────────────────────────────────────────

/**
 * Tag attach/detach happens on drag (board re-bucketing) and on click in
 * the picker. The server response invalidates `getTagsForEntity` and
 * `listTagsForEntities`, but those are batched per-entity-type so the
 * window before the response lands is short. We patch
 * `listTagsForEntities` optimistically anyway because the kanban drag
 * pulls from it directly and a flicker is visible.
 *
 * No optimistic update for `getTagsForEntity` — that's only used by
 * single-row pages where one extra refetch is fine.
 */
type TagDoc = Doc<"tags">;

export function useAttachTagToEntity() {
	return useMutation(api.crm.shared.tags.mutations.attachToEntity).withOptimisticUpdate(
		(store, args) => {
			const all = store.getAllQueries(api.crm.shared.tags.queries.listTagsForEntities);
			const tagDoc = store.getQuery(api.crm.shared.tags.queries.listByOrg, {
				orgId: args.orgId,
			})?.find((t) => t._id === args.tagId);
			if (!tagDoc) return;
			for (const { args: qa, value: byEntity } of all) {
				if (!byEntity) continue;
				if (qa.orgId !== args.orgId) continue;
				if (qa.entityType !== args.entityType) continue;
				const existing = byEntity[args.entityId] ?? [];
				if (existing.some((t) => t._id === args.tagId)) continue;
				store.setQuery(api.crm.shared.tags.queries.listTagsForEntities, qa, {
					...byEntity,
					[args.entityId]: [...existing, tagDoc as TagDoc],
				});
			}
		},
	);
}

export function useDetachTagFromEntity() {
	return useMutation(api.crm.shared.tags.mutations.detachFromEntity).withOptimisticUpdate(
		(store, args) => {
			const all = store.getAllQueries(api.crm.shared.tags.queries.listTagsForEntities);
			for (const { args: qa, value: byEntity } of all) {
				if (!byEntity) continue;
				if (qa.orgId !== args.orgId) continue;
				if (qa.entityType !== args.entityType) continue;
				const existing = byEntity[args.entityId];
				if (!existing) continue;
				const filtered = existing.filter((t) => t._id !== args.tagId);
				if (filtered.length === existing.length) continue;
				store.setQuery(api.crm.shared.tags.queries.listTagsForEntities, qa, {
					...byEntity,
					[args.entityId]: filtered,
				});
			}
		},
	);
}
