/**
 * Platform-owner limits — SINGLE SOURCE OF TRUTH for plan tiers.
 *
 * **Migration in progress (Stage 4 — 2026-05-27):**
 *   Tier limits are moving from these in-code constants to the
 *   `platformTiers` table. The sync `getPlanLimits()` keeps reading the
 *   constants (no consumer break) and `getPlanLimitsFromDb()` provides a
 *   DB-first async variant. New consumers should prefer the async helper
 *   so owner-panel edits are honoured immediately. Existing consumers
 *   keep using the sync version until they're migrated one-by-one.
 *
 * RULES:
 *   - Never hardcode plan limits anywhere else. Always import from here.
 *   - Use -1 for "unlimited" (matches the convention in deep-plan).
 *   - Adding a new limit key requires updating PlanLimits + every plan tier.
 */

import type { QueryCtx } from "../_generated/server";

export type PlanTier = "free" | "starter" | "pro" | "enterprise";

export interface PlanLimits {
	/** Max pipelines per entityType per org. -1 = unlimited. */
	maxPipelinesPerEntityType: number;
	/** Max active deals per org (open + closed combined). -1 = unlimited. */
	maxDeals: number;
	/** Max members per org. -1 = unlimited. */
	maxMembers: number;
	/** Max custom fieldDefinitions per entityType. -1 = unlimited. */
	maxCustomFieldsPerEntityType: number;
	/** Max storage bytes per org. -1 = unlimited. */
	maxStorageBytes: number;
	/** AI tokens per month. -1 = unlimited. 0 = disabled. */
	aiTokensPerMonth: number;
}

export const PLAN_LIMITS: Record<PlanTier, PlanLimits> = {
	free: {
		maxPipelinesPerEntityType: 1,
		maxDeals: 100,
		maxMembers: 3,
		maxCustomFieldsPerEntityType: 5,
		maxStorageBytes: 100 * 1024 * 1024, // 100 MB
		aiTokensPerMonth: 0, // AI disabled on free
	},
	starter: {
		maxPipelinesPerEntityType: 3,
		maxDeals: 1_000,
		maxMembers: 10,
		maxCustomFieldsPerEntityType: 20,
		maxStorageBytes: 5 * 1024 * 1024 * 1024, // 5 GB
		aiTokensPerMonth: 100_000,
	},
	pro: {
		maxPipelinesPerEntityType: 10,
		maxDeals: 10_000,
		maxMembers: 50,
		maxCustomFieldsPerEntityType: 100,
		maxStorageBytes: 50 * 1024 * 1024 * 1024, // 50 GB
		aiTokensPerMonth: 1_000_000,
	},
	enterprise: {
		maxPipelinesPerEntityType: -1,
		maxDeals: -1,
		maxMembers: -1,
		maxCustomFieldsPerEntityType: -1,
		maxStorageBytes: -1,
		aiTokensPerMonth: -1,
	},
};

/**
 * Synchronous, constant-backed lookup. Stable signature for the broad
 * call site population. Owner-panel edits to `platformTiers` are NOT
 * reflected here — switch the caller to `getPlanLimitsFromDb` when DB-
 * authoritative limits matter.
 */
export function getPlanLimits(tier: PlanTier): PlanLimits {
	return PLAN_LIMITS[tier];
}

/**
 * DB-first async lookup — returns the row in `platformTiers.<tier>` when
 * present and falls back to the in-code constants when the row is missing
 * (the seed migration ensures this is rare). Use from contexts where the
 * caller already has a Convex `QueryCtx` / `MutationCtx` and wants
 * owner-panel edits honoured.
 */
export async function getPlanLimitsFromDb(ctx: QueryCtx, tier: PlanTier): Promise<PlanLimits> {
	const row = await ctx.db
		.query("platformTiers")
		.withIndex("by_key", (q) => q.eq("key", tier))
		.unique();
	if (row?.limits) {
		return row.limits;
	}
	return PLAN_LIMITS[tier];
}

/** Returns true if `currentCount` is below the limit (or limit is unlimited). */
export function isWithinLimit(currentCount: number, limit: number): boolean {
	return limit === -1 || currentCount < limit;
}

/** Returns the human-readable label for a plan tier. */
export function getPlanLabel(tier: PlanTier): string {
	switch (tier) {
		case "free":
			return "Free";
		case "starter":
			return "Starter";
		case "pro":
			return "Pro";
		case "enterprise":
			return "Enterprise";
	}
}
