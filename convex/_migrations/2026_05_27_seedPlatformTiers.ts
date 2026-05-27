/**
 * convex/_migrations/2026_05_27_seedPlatformTiers.ts
 *
 * Seeds the new `platformTiers` table from the code constants in
 * `convex/_platform/limits.ts`. Run once with:
 *   npx convex run _migrations/2026_05_27_seedPlatformTiers:run '{}'
 *
 * Idempotent — for each tier key, INSERTS only if no row exists. A second
 * run is a no-op. Safe to re-run after manual edits in the owner panel
 * (we never overwrite existing rows).
 *
 * Why this migration:
 *   `getPlanLimits()` is being switched from a constant-only lookup to a
 *   DB-first lookup with the constants as a fallback. Until at least the
 *   four canonical rows exist in the DB, every consumer still hits the
 *   constant fallback (no behavioural regression). After this migration
 *   runs, the DB is the authoritative source.
 *
 * Spec: PLATFORM-OWNER-PANEL.md Stage 4-C (§10 stage table).
 */
import { ConvexError } from "convex/values";
import { internalMutation } from "../_generated/server";
import { PLAN_LIMITS, type PlanTier } from "../_platform/limits";
import { ERRORS } from "../_shared/errors";

const TIER_DEFAULTS: Record<
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

const TIER_KEYS: ReadonlyArray<PlanTier> = ["free", "starter", "pro", "enterprise"];

export const run = internalMutation({
	args: {},
	handler: async (ctx) => {
		// We need an "updatedBy" foreign key — pick the first super_admin
		// user. If there isn't one yet, refuse so the seed doesn't write
		// dangling data. Operators must run `setSuperAdmin` first.
		const superAdmin = await ctx.db
			.query("users")
			.withIndex("by_email")
			.filter((q) => q.eq(q.field("platformRole"), "super_admin"))
			.first();
		if (!superAdmin) {
			throw new ConvexError(
				`${ERRORS.SUPER_ADMIN_REQUIRED} (no super_admin user found — run setSuperAdmin first)`,
			);
		}

		const now = Date.now();
		const summary: Array<{ key: PlanTier; action: "inserted" | "skipped"; id?: string }> = [];

		for (const key of TIER_KEYS) {
			const existing = await ctx.db
				.query("platformTiers")
				.withIndex("by_key", (q) => q.eq("key", key))
				.unique();

			if (existing) {
				summary.push({ key, action: "skipped", id: existing._id });
				continue;
			}

			const defaults = TIER_DEFAULTS[key];
			const id = await ctx.db.insert("platformTiers", {
				key,
				displayName: defaults.displayName,
				monthlyPriceUSD: defaults.monthlyPriceUSD,
				yearlyPriceUSD: defaults.yearlyPriceUSD,
				trialDays: defaults.trialDays,
				limits: { ...PLAN_LIMITS[key] },
				active: true,
				updatedBy: superAdmin._id,
				createdAt: now,
				updatedAt: now,
			});
			summary.push({ key, action: "inserted", id });
		}

		return { ok: true, summary };
	},
});
