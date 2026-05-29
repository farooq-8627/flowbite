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
 * **2026-05-27 P0.2.E update:** added `maxLeads` + `aiMessageCreditsPerMonth`
 * to `PlanLimits` to ship the audit's pricing-ladder credit pool. Free
 * tier tightened (`maxLeads: 100`, `maxDeals: 50`, `maxCustomFieldsPerEntityType: 5`,
 * `aiMessageCreditsPerMonth: 50`). Pro tier gets the documented
 * 50,000-credit pool. The new fields are OPTIONAL on the platformTiers
 * row validator (so existing rows pass schema), but the in-code defaults
 * are populated; the migration `_migrations/2026_05_27_seedPlanLimitsExtensions.ts`
 * fills in any DB rows missing the new keys.
 *
 * RULES:
 *   - Never hardcode plan limits anywhere else. Always import from here.
 *   - Use -1 for "unlimited" (matches the convention in deep-plan).
 *   - Adding a new limit key requires updating PlanLimits + every plan tier
 *     + the platformTiers validator + the migration.
 */

import type { QueryCtx } from "../_generated/server";

export type PlanTier = "free" | "starter" | "pro" | "enterprise";

export interface PlanLimits {
	/** Max pipelines per entityType per org. -1 = unlimited. */
	maxPipelinesPerEntityType: number;
	/** Max active deals per org (open + closed combined). -1 = unlimited. */
	maxDeals: number;
	/** Max leads per org. -1 = unlimited. Lead-specific cap so Free can give
	 * generous deals headroom while gating prospect entry, which is the
	 * primary growth lever. */
	maxLeads: number;
	/** Max members per org. -1 = unlimited. */
	maxMembers: number;
	/** Max custom fieldDefinitions per entityType. -1 = unlimited. */
	maxCustomFieldsPerEntityType: number;
	/** Max storage bytes per org. -1 = unlimited. */
	maxStorageBytes: number;
	/** AI tokens per month. -1 = unlimited. 0 = disabled. */
	aiTokensPerMonth: number;
	/**
	 * AI message credits per month — separate from `aiTokensPerMonth`.
	 *
	 * Why a second metric: the pricing ladder (LANDING-PAGE.md + audit)
	 * promises "50,000 credits / month" on Pro. One credit = one user
	 * turn (one assistant message), regardless of how many tokens that
	 * turn consumes. Tokens are an observability metric; credits are a
	 * billing metric. Both gates run independently in `quotaGate.ts`:
	 * whichever exhausts first blocks the next turn.
	 *
	 * -1 = unlimited.  0 = AI message limit not enforced (only tokens
	 * matter — keeps the legacy "tokens-only" behaviour usable on rows
	 * the operator hasn't migrated yet).
	 */
	aiMessageCreditsPerMonth: number;
}

export const PLAN_LIMITS: Record<PlanTier, PlanLimits> = {
	free: {
		maxPipelinesPerEntityType: 1,
		maxDeals: 50,
		maxLeads: 100,
		maxMembers: 3,
		maxCustomFieldsPerEntityType: 5,
		maxStorageBytes: 100 * 1024 * 1024, // 100 MB
		aiTokensPerMonth: 0, // AI disabled on free (BYOK still works)
		aiMessageCreditsPerMonth: 0,
	},
	starter: {
		maxPipelinesPerEntityType: 3,
		maxDeals: 1_000,
		maxLeads: 5_000,
		maxMembers: 10,
		maxCustomFieldsPerEntityType: 20,
		maxStorageBytes: 5 * 1024 * 1024 * 1024, // 5 GB
		aiTokensPerMonth: 100_000,
		aiMessageCreditsPerMonth: 5_000,
	},
	pro: {
		maxPipelinesPerEntityType: 10,
		maxDeals: 10_000,
		maxLeads: 50_000,
		maxMembers: 50,
		maxCustomFieldsPerEntityType: 100,
		maxStorageBytes: 50 * 1024 * 1024 * 1024, // 50 GB
		aiTokensPerMonth: 1_000_000,
		aiMessageCreditsPerMonth: 50_000,
	},
	enterprise: {
		maxPipelinesPerEntityType: -1,
		maxDeals: -1,
		maxLeads: -1,
		maxMembers: -1,
		maxCustomFieldsPerEntityType: -1,
		maxStorageBytes: -1,
		aiTokensPerMonth: -1,
		aiMessageCreditsPerMonth: -1,
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
 *
 * **2026-05-27 P0.2.E** — when a DB row was seeded BEFORE the `maxLeads`
 * + `aiMessageCreditsPerMonth` keys were introduced, we backfill from
 * the in-code constants for that tier. The migration
 * `_migrations/2026_05_27_seedPlanLimitsExtensions.ts` writes the
 * defaults to every existing row idempotently — but the read path
 * stays defensive so a missing key never crashes a quota gate.
 */
export async function getPlanLimitsFromDb(ctx: QueryCtx, tier: PlanTier): Promise<PlanLimits> {
	const row = await ctx.db
		.query("platformTiers")
		.withIndex("by_key", (q) => q.eq("key", tier))
		.unique();
	if (row?.limits) {
		const fallback = PLAN_LIMITS[tier];
		return {
			maxPipelinesPerEntityType: row.limits.maxPipelinesPerEntityType,
			maxDeals: row.limits.maxDeals,
			maxLeads: row.limits.maxLeads ?? fallback.maxLeads,
			maxMembers: row.limits.maxMembers,
			maxCustomFieldsPerEntityType: row.limits.maxCustomFieldsPerEntityType,
			maxStorageBytes: row.limits.maxStorageBytes,
			aiTokensPerMonth: row.limits.aiTokensPerMonth,
			aiMessageCreditsPerMonth:
				row.limits.aiMessageCreditsPerMonth ?? fallback.aiMessageCreditsPerMonth,
		};
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
