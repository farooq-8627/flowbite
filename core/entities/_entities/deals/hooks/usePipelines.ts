"use client";

/**
 * usePipelines — centralized pipeline subscriptions for the deal surface.
 *
 * Why this hook exists
 * ────────────────────
 * Before this module, three separate components each called
 * `useQuery(api.crm.fields.pipelines.queries.{getDefault|listByOrg})`:
 *
 *   - `core/entities/_entities/deals/views/DealDetailView.tsx` (deals board + detail page)
 *   - `core/entities/_entities/leads/components/ConvertLeadDrawer.tsx` (lead-to-contact convert flow)
 *   - `core/platform/settings/components/groups/modules/SlotPipelinesSection.tsx` (settings UI)
 *
 * Convex deduplicates the network round-trip when args match, so the wire
 * cost is paid once. But each `useQuery` call still REGISTERS as a function
 * subscription, shows up in the dashboard "Function Calls" counter, and
 * triggers an independent React render whenever the result changes.
 *
 * This module exposes ONE subscription per `(orgId)` (via `usePipelinesRaw`)
 * and derives every consumer-friendly shape from it:
 *
 *   - `usePipelines(orgId)`            → all pipelines for the org
 *   - `useDealPipelines(orgId)`        → only `entityType === "deal"` pipelines
 *   - `useDefaultDealPipeline(orgId)`  → the row with `isDefault === true`,
 *                                        or the first deal pipeline as fallback
 *   - `useActiveDealPipeline(orgId)`   → persisted "currently active" pipeline,
 *                                        with a setter; falls back to default
 *
 * Pipelines are NOT session-scoped — they're org-scoped but only relevant
 * on a handful of routes (deals, settings, lead conversion). So this is a
 * regular hook (not a React context) — when no consumer mounts, no
 * subscription fires.
 *
 * Locked architectural decision (2026-05-20). Per AGENTS.md identity-via-
 * context rule: components MUST NOT call
 * `useQuery(api.crm.fields.pipelines.queries.*)` directly. Use these hooks.
 */

import { useQuery } from "convex/react";
import { useCallback, useMemo } from "react";
import { api } from "@/convex/_generated/api";
import type { Doc, Id } from "@/convex/_generated/dataModel";
import { usePersistedState } from "@/lib/hooks/use-persisted-state";

export type Pipeline = Doc<"pipelines">;
export type Stage = Pipeline["stages"][number];

/**
 * Raw subscription — fires `pipelines.listByOrg` ONCE per orgId, regardless
 * of how many descendant components consume it (Convex caches identical
 * args). Returns `undefined` while loading, `[]` if the org has none yet.
 */
function usePipelinesRaw(orgId: Id<"orgs"> | undefined): readonly Pipeline[] | undefined {
	return useQuery(api.crm.fields.pipelines.queries.listByOrg, orgId ? { orgId } : "skip");
}

/**
 * All pipelines for the current org, regardless of `entityType`.
 *
 * Returns `undefined` while loading, `[]` if the org has none yet.
 *
 * Most callers should prefer `useDealPipelines` since pipelines are
 * deals-only today (locked decision in `pipelines-plan.md` §10).
 */
export function usePipelines(orgId: Id<"orgs"> | undefined): readonly Pipeline[] | undefined {
	return usePipelinesRaw(orgId);
}

/**
 * All deal pipelines for the org, sorted with the default row first.
 *
 * `undefined` while loading. `[]` if the org has none yet.
 */
export function useDealPipelines(orgId: Id<"orgs"> | undefined): readonly Pipeline[] | undefined {
	const pipelines = usePipelinesRaw(orgId);
	return useMemo(() => {
		if (pipelines === undefined) return undefined;
		const deals = pipelines.filter((p) => p.entityType === "deal");
		// Default row first, then alphabetical for stability.
		return deals.sort((a, b) => {
			if (a.isDefault && !b.isDefault) return -1;
			if (!a.isDefault && b.isDefault) return 1;
			return a.name.localeCompare(b.name);
		});
	}, [pipelines]);
}

/**
 * The default deal pipeline (`isDefault === true`). Falls back to the first
 * deal pipeline if no row is explicitly flagged default.
 *
 * `undefined` while loading. `null` once loaded if the org has zero deal
 * pipelines.
 */
export function useDefaultDealPipeline(orgId: Id<"orgs"> | undefined): Pipeline | null | undefined {
	const dealPipelines = useDealPipelines(orgId);
	return useMemo(() => {
		if (dealPipelines === undefined) return undefined;
		if (dealPipelines.length === 0) return null;
		return dealPipelines.find((p) => p.isDefault) ?? dealPipelines[0];
	}, [dealPipelines]);
}

/**
 * The "currently active" deal pipeline — persisted per device under
 * `viewopts:deal:activePipelineId`. Falls back to the default when the
 * persisted id no longer exists (e.g. the pipeline was deleted).
 *
 * Returns `{ activePipeline, dealPipelines, defaultPipeline, setActivePipelineId }`.
 *
 * `setActivePipelineId(undefined)` resets to the default.
 */
export function useActiveDealPipeline(orgId: Id<"orgs"> | undefined): {
	/** All deal pipelines (sorted, default first). `undefined` while loading. */
	dealPipelines: readonly Pipeline[] | undefined;
	/** The default pipeline. `undefined` while loading; `null` if none exists. */
	defaultPipeline: Pipeline | null | undefined;
	/** Pipeline matching the persisted activePipelineId, falls back to default. */
	activePipeline: Pipeline | null | undefined;
	/** The persisted active id (raw — caller usually doesn't need this). */
	activePipelineId: Id<"pipelines"> | undefined;
	/** Persists a new active pipeline id. Pass `undefined` to reset to default. */
	setActivePipelineId: (id: Id<"pipelines"> | undefined) => void;
} {
	const dealPipelines = useDealPipelines(orgId);
	const defaultPipeline = useDefaultDealPipeline(orgId);

	const [activePipelineId, setActivePipelineIdRaw] = usePersistedState<
		Id<"pipelines"> | undefined
	>("viewopts:deal:activePipelineId", undefined);

	const activePipeline = useMemo<Pipeline | null | undefined>(() => {
		if (dealPipelines === undefined) return undefined;
		if (dealPipelines.length === 0) return null;
		if (activePipelineId) {
			const match = dealPipelines.find((p) => p._id === activePipelineId);
			if (match) return match;
		}
		// Fall through to default — either no persisted id or the persisted
		// id no longer exists (pipeline deleted).
		return defaultPipeline ?? dealPipelines[0];
	}, [dealPipelines, activePipelineId, defaultPipeline]);

	const setActivePipelineId = useCallback(
		(id: Id<"pipelines"> | undefined) => {
			setActivePipelineIdRaw(id);
		},
		[setActivePipelineIdRaw],
	);

	return {
		dealPipelines,
		defaultPipeline,
		activePipeline,
		activePipelineId,
		setActivePipelineId,
	};
}
