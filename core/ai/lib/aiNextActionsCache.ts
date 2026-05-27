"use client";

/**
 * core/ai/lib/aiNextActionsCache.ts
 *
 * Optimistic-cache helpers for the AI Pulse Ribbon's source query
 * `api.ai.queries.nextActions.listForUser`. Used by every list-affecting
 * mutation hook (task complete/delete, lead delete + status flip, deal
 * delete + stage move + close + reopen) to drop matching ribbon rows
 * before the backend's reactive rebuild lands.
 *
 * Why a shared helper
 * ───────────────────
 * Task/lead/contact/deal mutations all need to drop rows from the same
 * `aiNextActions.listForUser` cache, identified by (recordKind,
 * recordCode). Inlining the same patch loop in 6+ optimistic hooks
 * was duplicating logic and inviting drift. This module owns the
 * single canonical implementation.
 *
 * Backend coverage
 * ────────────────
 * The Convex side runs `scheduleNextActionsRebuild` after every
 * relevant mutation (see `convex/ai/queries/nextActionsTrigger.ts`),
 * so the ribbon corrects itself within ~250ms even without an
 * optimistic patch. These helpers exist purely to eliminate the
 * "flash of stale row" between the user's click and the rebuild.
 */

import type { useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";

type StoreLike = Parameters<
	Parameters<ReturnType<typeof useMutation>["withOptimisticUpdate"]>[0]
>[0];

/**
 * Filter rows out of every cached `listForUser` query whose
 * (recordKind, recordCode) === (kind, code). Silently no-ops when the
 * query binding can't be resolved (e.g. on routes where the ribbon
 * never mounts and the api shape isn't loaded). Safe to call multiple
 * times in the same transaction.
 */
export function dropAiNextActionsByCode(
	store: StoreLike,
	orgId: string,
	kind: "lead" | "contact" | "company" | "deal" | "reminder",
	code: string,
): void {
	const queryRef = api.ai?.queries?.nextActions?.listForUser;
	if (!queryRef) return;

	const entries = store.getAllQueries(queryRef);
	for (const { args: qa, value } of entries) {
		if (!value || (qa as { orgId?: string }).orgId !== orgId) continue;
		const v = value as {
			count: number;
			rows: Array<{ recordKind: string; recordCode: string }>;
		};
		const filtered = v.rows.filter((r) => !(r.recordKind === kind && r.recordCode === code));
		if (filtered.length === v.rows.length) continue; // no change

		// Cast to the authoritative query value type — we know our
		// patch keeps the same shape (count + filtered rows). Convex
		// re-hydrates the proper Id types on the next subscription tick.
		store.setQuery(queryRef, qa, {
			...(value as object),
			count: filtered.length,
			rows: filtered,
		} as Parameters<typeof store.setQuery>[2]);
	}
}

/**
 * Convenience wrapper for the common "drop everything that points at
 * this entity by record code" pattern. Useful when a soft-delete or
 * conversion happens — the ribbon should clear all matching rows
 * regardless of `recordKind` (e.g. a person could have rows under
 * `lead` or `contact` depending on stage). Pass the candidate kinds
 * you care about; defaults to all five.
 */
export function dropAiNextActionsForCode(
	store: StoreLike,
	orgId: string,
	code: string,
	kinds: ReadonlyArray<"lead" | "contact" | "company" | "deal" | "reminder"> = [
		"lead",
		"contact",
		"company",
		"deal",
		"reminder",
	],
): void {
	for (const kind of kinds) {
		dropAiNextActionsByCode(store, orgId, kind, code);
	}
}
