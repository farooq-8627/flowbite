/**
 * Billing queries — Phase 3A.
 *
 * `getCurrentPlan` returns the org's plan tier, LemonSqueezy
 * subscription status, period end, and the resolved plan limits — one
 * call drives the entire billing UI.
 */

import { v } from "convex/values";
import { orgQuery } from "../_functions/authenticated";
import { getPlanLabel, getPlanLimitsFromDb, type PlanTier } from "../_platform/limits";

export const getCurrentPlan = orgQuery({
	args: { orgId: v.id("orgs") },
	handler: async (ctx, args) => {
		const org = await ctx.db.get(args.orgId);
		if (!org) return null;
		const tier = (org.plan as PlanTier) ?? "free";
		return {
			plan: tier,
			planLabel: getPlanLabel(tier),
			limits: await getPlanLimitsFromDb(ctx, tier),
			lemonSqueezy: {
				customerId: org.lemonSqueezyCustomerId,
				subscriptionId: org.lemonSqueezySubscriptionId,
				variantId: org.lemonSqueezyVariantId,
				status: org.lemonSqueezySubscriptionStatus,
				currentPeriodEnd: org.lemonSqueezyCurrentPeriodEnd,
			},
		};
	},
});
