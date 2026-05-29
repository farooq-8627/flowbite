/**
 * Idempotent migration — back-fill the new optional fields added to
 * `platformTiers` in the P0.1 + P0.2 wave (2026-05-27):
 *
 *   - `description` — one-line marketing tagline
 *   - `features`    — bullet list shown on PricingCard / marketing /pricing
 *   - `highlight`   — "Most popular" tile flag (Pro = true by default)
 *   - `limits.maxLeads`
 *   - `limits.aiMessageCreditsPerMonth`
 *
 * The legacy schema accepted rows WITHOUT these keys, so existing
 * deployments may have rows missing them. This mutation walks every
 * row and patches in the in-code defaults from
 * `_platform/limits.ts::PLAN_LIMITS` for the limits, plus the
 * marketing-copy defaults below for the display fields.
 *
 * Idempotency rule: a row that ALREADY has a non-undefined value for
 * the field is left alone (the operator's edit wins).
 *
 * Run from a Convex CLI shell:
 *   npx convex run _migrations/2026_05_27_seedPlanLimitsExtensions:run
 *
 * Safe to run twice — the second run is a no-op.
 */

import { internalMutation } from "../_generated/server";
import { PLAN_LIMITS, type PlanTier } from "../_platform/limits";

type TierKey = PlanTier;

const COPY_DEFAULTS: Record<
	TierKey,
	{ description: string; features: string[]; highlight: boolean }
> = {
	free: {
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

const TIERS: ReadonlyArray<TierKey> = ["free", "starter", "pro", "enterprise"];

export const run = internalMutation({
	args: {},
	handler: async (ctx) => {
		let scanned = 0;
		let patched = 0;
		const now = Date.now();

		for (const key of TIERS) {
			const row = await ctx.db
				.query("platformTiers")
				.withIndex("by_key", (q) => q.eq("key", key))
				.unique();
			if (!row) continue;
			scanned += 1;

			const fallbackLimits = PLAN_LIMITS[key];
			const copy = COPY_DEFAULTS[key];

			const patch: Record<string, unknown> = {};

			if (row.description === undefined) patch.description = copy.description;
			if (row.features === undefined) patch.features = copy.features;
			if (row.highlight === undefined) patch.highlight = copy.highlight;

			const limits = row.limits;
			if (limits.maxLeads === undefined || limits.aiMessageCreditsPerMonth === undefined) {
				patch.limits = {
					...limits,
					maxLeads: limits.maxLeads ?? fallbackLimits.maxLeads,
					aiMessageCreditsPerMonth:
						limits.aiMessageCreditsPerMonth ?? fallbackLimits.aiMessageCreditsPerMonth,
				};
			}

			if (Object.keys(patch).length === 0) continue;
			patch.updatedAt = now;
			await ctx.db.patch(row._id, patch);
			patched += 1;
		}

		return { ok: true, scanned, patched };
	},
});
