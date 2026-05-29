/**
 * Owner-panel tier queries — convex/_platform/tiers/queries.ts
 *
 * Read-only access to the `platformTiers` table for the owner panel UI.
 * Falls back to the in-code constants when a row is missing so the
 * owner-panel works even before the seed migration runs (the missing row
 * is surfaced as `_id: null` so the UI can prompt to seed).
 *
 * Spec: PLATFORM-OWNER-PANEL.md §5 row 3, §10 stage 4.
 *
 * **2026-05-27 P0.1.2** — added the public `listPublicTiers` query that
 * surfaces marketing copy (display name, description, features,
 * highlight, prices, variant ids) with no auth gate so the in-app
 * `PricingCard` AND the marketing /pricing page consume the same SSOT.
 */
import { v } from "convex/values";
import { internalQuery, query } from "../../_generated/server";
import { orgPlanValidator } from "../../_shared/validators";
import { PLAN_LIMITS, type PlanTier } from "../limits";
import { requirePlatformOwner } from "../ownerAuth";

const TIER_KEYS: ReadonlyArray<PlanTier> = ["free", "starter", "pro", "enterprise"];

const TIER_FALLBACK_DEFAULTS: Record<
	PlanTier,
	{
		displayName: string;
		monthlyPriceUSD: number;
		yearlyPriceUSD: number;
		trialDays: number;
		description: string;
		features: string[];
		highlight: boolean;
	}
> = {
	free: {
		displayName: "Free",
		monthlyPriceUSD: 0,
		yearlyPriceUSD: 0,
		trialDays: 0,
		description: "Get started — bring your own AI key, or test the platform.",
		features: [
			"Up to 100 leads & 50 deals",
			"3 team members",
			"5 custom fields per entity",
			"100 MB file storage",
			"Bring-your-own AI key (unmetered)",
		],
		highlight: false,
	},
	starter: {
		displayName: "Starter",
		monthlyPriceUSD: 19,
		yearlyPriceUSD: 190,
		trialDays: 14,
		description: "For solo operators ready to scale beyond the free tier.",
		features: [
			"5,000 leads & 1,000 deals",
			"10 team members",
			"3 pipelines per entity, 20 custom fields",
			"5 GB file storage",
			"100K AI tokens / 5,000 AI messages per month",
		],
		highlight: false,
	},
	pro: {
		displayName: "Pro",
		monthlyPriceUSD: 49,
		yearlyPriceUSD: 490,
		trialDays: 14,
		description: "For growing teams that need automation + analytics.",
		features: [
			"50,000 leads & 10,000 deals",
			"50 team members",
			"10 pipelines per entity, 100 custom fields",
			"50 GB file storage",
			"1M AI tokens / 50,000 AI messages per month",
			"Premium models (Opus, GPT-4o, Gemini Pro) on platform key",
		],
		highlight: true,
	},
	enterprise: {
		displayName: "Enterprise",
		monthlyPriceUSD: 199,
		yearlyPriceUSD: 1990,
		trialDays: 30,
		description: "For agencies + large workspaces with bespoke needs.",
		features: [
			"Unlimited leads, deals, members, fields, storage",
			"Unlimited AI tokens + AI messages",
			"Premium support + onboarding",
			"Custom contract + SSO available",
		],
		highlight: false,
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
			description: string;
			features: string[];
			highlight: boolean;
			monthlyPriceUSD: number;
			yearlyPriceUSD: number;
			trialDays: number;
			lemonSqueezyVariantIdMonthly: string | null;
			lemonSqueezyVariantIdYearly: string | null;
			limits: ReturnType<typeof normaliseLimits>;
			active: boolean;
			updatedAt: number | null;
		}> = [];

		for (const key of TIER_KEYS) {
			const row = await ctx.db
				.query("platformTiers")
				.withIndex("by_key", (q) => q.eq("key", key))
				.unique();
			const defaults = TIER_FALLBACK_DEFAULTS[key];
			if (row) {
				out.push({
					key,
					seeded: true,
					displayName: row.displayName,
					description: row.description ?? defaults.description,
					features: row.features ?? defaults.features,
					highlight: row.highlight ?? defaults.highlight,
					monthlyPriceUSD: row.monthlyPriceUSD,
					yearlyPriceUSD: row.yearlyPriceUSD,
					trialDays: row.trialDays,
					lemonSqueezyVariantIdMonthly: row.lemonSqueezyVariantIdMonthly ?? null,
					lemonSqueezyVariantIdYearly: row.lemonSqueezyVariantIdYearly ?? null,
					limits: normaliseLimits(row.limits, key),
					active: row.active,
					updatedAt: row.updatedAt,
				});
			} else {
				out.push({
					key,
					seeded: false,
					displayName: defaults.displayName,
					description: defaults.description,
					features: defaults.features,
					highlight: defaults.highlight,
					monthlyPriceUSD: defaults.monthlyPriceUSD,
					yearlyPriceUSD: defaults.yearlyPriceUSD,
					trialDays: defaults.trialDays,
					lemonSqueezyVariantIdMonthly: null,
					lemonSqueezyVariantIdYearly: null,
					limits: PLAN_LIMITS[key],
					active: true,
					updatedAt: null,
				});
			}
		}

		return out;
	},
});

/**
 * Public, no-auth-gate query consumed by the in-app `PricingCard` and the
 * marketing /pricing page. Returns ONLY active tiers, sorted ascending by
 * `monthlyPriceUSD`. Falls back to in-code defaults when no DB row
 * exists yet — so the marketing site renders correctly on a fresh
 * deployment before an operator has touched the owner panel.
 *
 * Returns ONLY public-safe fields: never `updatedBy`, never internal
 * numeric ids, never the full row's `_id`. The intent is for this query
 * to be safe to call from an unauthenticated visitor on the marketing
 * site.
 */
export const listPublicTiers = query({
	args: {},
	handler: async (ctx) => {
		const out: Array<{
			key: PlanTier;
			displayName: string;
			description: string;
			features: string[];
			highlight: boolean;
			monthlyPriceUSD: number;
			yearlyPriceUSD: number;
			trialDays: number;
			lemonSqueezyVariantIdMonthly: string | null;
			lemonSqueezyVariantIdYearly: string | null;
			limits: ReturnType<typeof normaliseLimits>;
		}> = [];
		for (const key of TIER_KEYS) {
			const row = await ctx.db
				.query("platformTiers")
				.withIndex("by_key", (q) => q.eq("key", key))
				.unique();
			const defaults = TIER_FALLBACK_DEFAULTS[key];
			// Skip tiers the operator has explicitly disabled. A missing row
			// is treated as `active: true` so a fresh deployment shows every
			// tier without requiring a seed step.
			if (row && row.active === false) continue;
			out.push({
				key,
				displayName: row?.displayName ?? defaults.displayName,
				description: row?.description ?? defaults.description,
				features: row?.features ?? defaults.features,
				highlight: row?.highlight ?? defaults.highlight,
				monthlyPriceUSD: row?.monthlyPriceUSD ?? defaults.monthlyPriceUSD,
				yearlyPriceUSD: row?.yearlyPriceUSD ?? defaults.yearlyPriceUSD,
				trialDays: row?.trialDays ?? defaults.trialDays,
				lemonSqueezyVariantIdMonthly: row?.lemonSqueezyVariantIdMonthly ?? null,
				lemonSqueezyVariantIdYearly: row?.lemonSqueezyVariantIdYearly ?? null,
				limits: row?.limits ? normaliseLimits(row.limits, key) : PLAN_LIMITS[key],
			});
		}
		// Stable display order by ascending monthly price (free first, enterprise last).
		out.sort((a, b) => a.monthlyPriceUSD - b.monthlyPriceUSD);
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
		if (row?.limits) return normaliseLimits(row.limits, args.tier);
		return PLAN_LIMITS[args.tier];
	},
});

/**
 * Backfill any missing optional limit keys (`maxLeads`,
 * `aiMessageCreditsPerMonth`) from the in-code defaults so the
 * read path always returns a fully-populated `PlanLimits`. Used by
 * `listTiers`, `listPublicTiers`, and `getLimitsInternal`.
 */
function normaliseLimits(
	limits: {
		maxPipelinesPerEntityType: number;
		maxDeals: number;
		maxLeads?: number;
		maxMembers: number;
		maxCustomFieldsPerEntityType: number;
		maxStorageBytes: number;
		aiTokensPerMonth: number;
		aiMessageCreditsPerMonth?: number;
	},
	tier: PlanTier,
) {
	const fallback = PLAN_LIMITS[tier];
	return {
		maxPipelinesPerEntityType: limits.maxPipelinesPerEntityType,
		maxDeals: limits.maxDeals,
		maxLeads: limits.maxLeads ?? fallback.maxLeads,
		maxMembers: limits.maxMembers,
		maxCustomFieldsPerEntityType: limits.maxCustomFieldsPerEntityType,
		maxStorageBytes: limits.maxStorageBytes,
		aiTokensPerMonth: limits.aiTokensPerMonth,
		aiMessageCreditsPerMonth:
			limits.aiMessageCreditsPerMonth ?? fallback.aiMessageCreditsPerMonth,
	};
}
