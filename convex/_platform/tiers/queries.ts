/**
 * Owner-panel tier queries — convex/_platform/tiers/queries.ts
 *
 * Read-only access to the `platformTiers` table for the owner panel UI.
 * Falls back to the in-code constants when a row is missing so the
 * owner-panel works even before the seed migration runs (the missing row
 * is surfaced as `_id: null` so the UI can prompt to seed).
 *
 * Spec: PLATFORM-OWNER-PANEL.md §5 row 3, §10 stage 4.
 */
import { v } from "convex/values";
import { internalQuery, query } from "../../_generated/server";
import { orgPlanValidator } from "../../_shared/validators";
import { PLAN_LIMITS, type PlanTier } from "../limits";
import { requirePlatformOwner } from "../ownerAuth";

const TIER_KEYS: ReadonlyArray<PlanTier> = ["free", "starter", "pro", "enterprise"];

const TIER_FALLBACK_DEFAULTS: Record<
	PlanTier,
	{ displayName: string; monthlyPriceUSD: number; yearlyPriceUSD: number; trialDays: number }
> = {
	free: { displayName: "Free", monthlyPriceUSD: 0, yearlyPriceUSD: 0, trialDays: 0 },
	starter: { displayName: "Starter", monthlyPriceUSD: 19, yearlyPriceUSD: 190, trialDays: 14 },
	pro: { displayName: "Pro", monthlyPriceUSD: 49, yearlyPriceUSD: 490, trialDays: 14 },
	enterprise: {
		displayName: "Enterprise",
		monthlyPriceUSD: 199,
		yearlyPriceUSD: 1990,
		trialDays: 30,
	},
};

/**
 * Return all four canonical tiers. Each entry is either the DB row OR a
 * synthetic fallback derived from the in-code constants. The UI uses the
 * `seeded` flag to know whether the row has been written yet.
 */
export const listTiers = query({
	args: {},
	handler: async (ctx) => {
		await requirePlatformOwner(ctx);

		const out: Array<{
			key: PlanTier;
			seeded: boolean;
			displayName: string;
			monthlyPriceUSD: number;
			yearlyPriceUSD: number;
			trialDays: number;
			limits: (typeof PLAN_LIMITS)[PlanTier];
			active: boolean;
			updatedAt: number | null;
		}> = [];

		for (const key of TIER_KEYS) {
			const row = await ctx.db
				.query("platformTiers")
				.withIndex("by_key", (q) => q.eq("key", key))
				.unique();
			if (row) {
				out.push({
					key,
					seeded: true,
					displayName: row.displayName,
					monthlyPriceUSD: row.monthlyPriceUSD,
					yearlyPriceUSD: row.yearlyPriceUSD,
					trialDays: row.trialDays,
					limits: row.limits,
					active: row.active,
					updatedAt: row.updatedAt,
				});
			} else {
				const defaults = TIER_FALLBACK_DEFAULTS[key];
				out.push({
					key,
					seeded: false,
					displayName: defaults.displayName,
					monthlyPriceUSD: defaults.monthlyPriceUSD,
					yearlyPriceUSD: defaults.yearlyPriceUSD,
					trialDays: defaults.trialDays,
					limits: PLAN_LIMITS[key],
					active: true,
					updatedAt: null,
				});
			}
		}

		return out;
	},
});

/** Single-tier lookup — useful for the per-card detail drawer (future). */
export const getTier = query({
	args: { key: v.string() },
	handler: async (ctx, args) => {
		await requirePlatformOwner(ctx);
		return ctx.db
			.query("platformTiers")
			.withIndex("by_key", (q) => q.eq("key", args.key as PlanTier))
			.unique();
	},
});

/**
 * Internal-only DB-first limits lookup. Returns the `limits` object for
 * a given tier, falling back to the in-code `PLAN_LIMITS` constants when
 * the DB row is missing.
 *
 * Why this exists separate from `getPlanLimitsFromDb` (the in-process
 * helper exported from `_platform/limits.ts`):
 *   - `getPlanLimitsFromDb` requires a `QueryCtx` / `MutationCtx`.
 *   - Action handlers (e.g. `convex/ai/orchestrator/run.ts` →
 *     `quotaGate.ts`) have an `ActionCtx` with only `runQuery` access
 *     and CANNOT call `ctx.db.query(...)` directly.
 *   - This `internalQuery` lets actions fetch the DB-authoritative
 *     limits via `ctx.runQuery(internal._platform.tiers.queries.getLimitsInternal, { tier })`.
 *
 * NOT auth-gated by `requirePlatformOwner` — these limits are not
 * sensitive data (they're shown to every user on the billing page) and
 * the function is `internalQuery` so it cannot be called from the
 * client. Only trusted internal callers (Convex actions + scheduled
 * functions) can invoke it.
 *
 * Spec: PLATFORM-OWNER-PANEL.md §10 stage 4-D — migrate enforcement
 * consumers from sync `getPlanLimits` to DB-aware lookup.
 */
export const getLimitsInternal = internalQuery({
	args: { tier: orgPlanValidator },
	handler: async (ctx, args) => {
		const row = await ctx.db
			.query("platformTiers")
			.withIndex("by_key", (q) => q.eq("key", args.tier))
			.unique();
		if (row?.limits) return row.limits;
		return PLAN_LIMITS[args.tier];
	},
});
