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
import { dropAiNextActionsByCode } from "@/core/ai/lib/aiNextActionsCache";

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
			let personCode: string | undefined;
			for (const { args: qa, value: list } of all) {
				if (!list) continue;
				if (qa.orgId !== args.orgId) continue;
				const target = list.find((l) => l._id === args.leadId);
				if (!target) continue;
				if (!personCode) personCode = target.personCode;
				const { orgId: _o, leadId: _l, ...patch } = args;
				store.setQuery(
					api.crm.entities.leads.queries.list,
					qa,
					list.map((l) => (l._id === args.leadId ? { ...l, ...patch } : l)),
				);
			}
			// Pulse-row drop — when status flips to a closed bucket
			// the Pulse Ribbon's `lead_stale_*` row is no longer
			// applicable. Backend reactively rebuilds via
			// `scheduleNextActionsRebuild`; this is the no-flash UX.
			const closedStatuses = new Set(["Won", "Lost", "Converted"]);
			if (personCode && args.status && closedStatuses.has(args.status)) {
				dropAiNextActionsByCode(store, args.orgId, "lead", personCode);
			}
		},
	);
}

export function useSoftDeleteLead() {
	return useMutation(api.crm.entities.leads.mutations.softDelete).withOptimisticUpdate(
		(store, args) => {
			const all = store.getAllQueries(api.crm.entities.leads.queries.list);
			let personCode: string | undefined;
			for (const { args: qa, value: list } of all) {
				if (!list) continue;
				if (qa.orgId !== args.orgId) continue;
				const target = list.find((l) => l._id === args.leadId);
				if (!target) continue;
				if (!personCode) personCode = target.personCode;
				store.setQuery(
					api.crm.entities.leads.queries.list,
					qa,
					list.filter((l) => l._id !== args.leadId),
				);
			}
			// Pulse-row drop — soft-delete clears every ribbon row
			// referencing this lead's personCode.
			if (personCode) {
				dropAiNextActionsByCode(store, args.orgId, "lead", personCode);
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
			let personCode: string | undefined;
			for (const { args: qa, value: list } of all) {
				if (!list) continue;
				if (qa.orgId !== args.orgId) continue;
				const target = list.find((c) => c._id === args.contactId);
				if (!target) continue;
				if (!personCode) personCode = target.personCode;
				store.setQuery(
					api.crm.entities.contacts.queries.list,
					qa,
					list.filter((c) => c._id !== args.contactId),
				);
			}
			if (personCode) {
				dropAiNextActionsByCode(store, args.orgId, "contact", personCode);
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
			// 1. Flat list cache — used by the list view.
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

			// 2. Grouped-by-stage cache — used by the board view. The
			// kanban also fires `update` for in-column reorder
			// (sortOrder), assignedTo changes (groupBy=assignedTo), and
			// tag swaps (groupBy=tag). For all of those the row stays
			// in the same stage column; we just patch the matching row
			// in place so the card doesn't flash back while the server
			// commits.
			const grouped = store.getAllQueries(api.crm.entities.deals.queries.listGroupedByStage);
			for (const { args: qa, value: byStage } of grouped) {
				if (!byStage) continue;
				if (qa.orgId !== args.orgId) continue;
				const { orgId: _o, dealId: _d, ...patch } = args;
				let touched = false;
				const next: typeof byStage = {};
				for (const [stageId, rows] of Object.entries(byStage)) {
					if (!rows.some((r) => r._id === args.dealId)) {
						next[stageId] = rows;
						continue;
					}
					touched = true;
					next[stageId] = rows.map((r) =>
						r._id === args.dealId ? { ...r, ...patch } : r,
					);
				}
				if (touched) {
					store.setQuery(api.crm.entities.deals.queries.listGroupedByStage, qa, next);
				}
			}
		},
	);
}

export function useSoftDeleteDeal() {
	return useMutation(api.crm.entities.deals.mutations.softDelete).withOptimisticUpdate(
		(store, args) => {
			let dealCode: string | undefined;
			// Flat list cache.
			const all = store.getAllQueries(api.crm.entities.deals.queries.list);
			for (const { args: qa, value: list } of all) {
				if (!list) continue;
				if (qa.orgId !== args.orgId) continue;
				const target = list.find((d) => d._id === args.dealId);
				if (!target) continue;
				if (!dealCode) dealCode = target.dealCode;
				store.setQuery(
					api.crm.entities.deals.queries.list,
					qa,
					list.filter((d) => d._id !== args.dealId),
				);
			}

			// Grouped-by-stage cache.
			const grouped = store.getAllQueries(api.crm.entities.deals.queries.listGroupedByStage);
			for (const { args: qa, value: byStage } of grouped) {
				if (!byStage) continue;
				if (qa.orgId !== args.orgId) continue;
				let touched = false;
				const next: typeof byStage = {};
				for (const [stageId, rows] of Object.entries(byStage)) {
					if (!rows.some((r) => r._id === args.dealId)) {
						next[stageId] = rows;
						continue;
					}
					if (!dealCode) {
						const found = rows.find((r) => r._id === args.dealId);
						if (found?.dealCode) dealCode = found.dealCode;
					}
					touched = true;
					next[stageId] = rows.filter((r) => r._id !== args.dealId);
				}
				if (touched) {
					store.setQuery(api.crm.entities.deals.queries.listGroupedByStage, qa, next);
				}
			}

			// Pulse-row drop — clears `deal_stuck_*` rows for this deal.
			if (dealCode) {
				dropAiNextActionsByCode(store, args.orgId, "deal", dealCode);
			}
		},
	);
}

/**
 * `moveToStage` — kanban drag handler for deals. Patches `currentStageId` +
 * `stageEnteredAt` in every cached `deals.list` variant AND in
 * `listGroupedByStage`, the query the board view actually subscribes to.
 *
 * Why we patch the grouped query
 * ──────────────────────────────
 * Earlier versions deliberately skipped `listGroupedByStage` because its
 * rows carry server-derived `daysInStage` and `isStale` we couldn't
 * recompute on the client without duplicating the staleness logic. The
 * trade-off was visible: the card snapped back to the source column for
 * the round-trip window before the server response landed. Per the
 * AGENTS.md "Every list-affecting mutation has `withOptimisticUpdate`"
 * rule, that's a no-go — the user-visible flash is exactly what
 * optimistic updates are for.
 *
 * Reconciliation strategy: when the moved deal enters the new column we
 * stamp `daysInStage = 0` and `isStale = false` (the deal just landed
 * — 0 days is exactly correct). Any deviation gets reconciled when the
 * server response arrives a few hundred ms later. This keeps the visual
 * truth aligned with what the user just did.
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
			let dealCode: string | undefined;

			// 1. Flat list cache — used by the list view.
			const all = store.getAllQueries(api.crm.entities.deals.queries.list);
			for (const { args: qa, value: list } of all) {
				if (!list) continue;
				if (qa.orgId !== args.orgId) continue;
				const target = list.find((d) => d._id === args.dealId);
				if (!target) continue;
				if (!dealCode) dealCode = target.dealCode;
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

			// 2. Grouped-by-stage cache — used by the board view. We move
			// the deal row out of its previous stage's bucket and into
			// the new one in one patch so the card sticks in the column
			// the user just dropped it into.
			const grouped = store.getAllQueries(api.crm.entities.deals.queries.listGroupedByStage);
			for (const { args: qa, value: byStage } of grouped) {
				if (!byStage) continue;
				if (qa.orgId !== args.orgId) continue;

				let foundRow: (typeof byStage)[string][number] | undefined;
				const next: typeof byStage = {};
				for (const [stageId, rows] of Object.entries(byStage)) {
					const idx = rows.findIndex((r) => r._id === args.dealId);
					if (idx >= 0 && !foundRow) {
						foundRow = rows[idx];
						if (!dealCode && foundRow.dealCode) dealCode = foundRow.dealCode;
						next[stageId] = rows.filter((_, i) => i !== idx);
					} else {
						next[stageId] = rows;
					}
				}
				if (!foundRow) continue;

				const moved = {
					...foundRow,
					currentStageId: args.stageId,
					stageEnteredAt: now,
					// Just landed in the new column — 0 days, never stale.
					// Server will reconcile if the row had a different
					// staleness rule attached on commit.
					daysInStage: 0,
					isStale: false,
				};
				next[args.stageId] = next[args.stageId] ? [...next[args.stageId], moved] : [moved];

				store.setQuery(api.crm.entities.deals.queries.listGroupedByStage, qa, next);
			}

			// Pulse-row drop — stage move resets the staleness clock,
			// so any `deal_stuck_*` row for this dealCode is no longer
			// applicable. Backend reactively rebuilds; this is the
			// no-flash UX layer.
			if (dealCode) {
				dropAiNextActionsByCode(store, args.orgId, "deal", dealCode);
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
			const tagDoc = store
				.getQuery(api.crm.shared.tags.queries.listByOrg, {
					orgId: args.orgId,
				})
				?.find((t) => t._id === args.tagId);
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
