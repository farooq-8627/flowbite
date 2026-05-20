/**
 * Platform-owner limits — SINGLE SOURCE OF TRUTH for plan tiers.
 *
 * This file IS the platform-owner dashboard for now. Every consumer
 * (mutations, UI gates, billing checks) imports from here.
 *
 * MIGRATION PATH (when the dashboard ships):
 *   1. Add a `platformLimits` table that mirrors PLAN_LIMITS.
 *   2. Replace getPlanLimits() body with a `ctx.db.get(...)` lookup.
 *   3. No consumer changes needed.
 *
 * RULES:
 *   - Never hardcode plan limits anywhere else. Always import from here.
 *   - Use -1 for "unlimited" (matches the convention in deep-plan).
 *   - Adding a new limit key requires updating PlanLimits + every plan tier.
 */

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

export function getPlanLimits(tier: PlanTier): PlanLimits {
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
