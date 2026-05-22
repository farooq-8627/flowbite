/**
 * `enforcePlanLimit` — gate a creation/upgrade against plan limits.
 *
 * Usage inside a mutation:
 *
 *   await enforcePlanLimit(ctx, {
 *     orgId: args.orgId,
 *     limitKey: "maxDeals",
 *     currentCount: await countDeals(ctx, args.orgId),
 *   });
 *
 * Reads the org's current plan, looks up the limit from
 * `_platform/limits.ts`, and throws a `ConvexError` with a user-friendly
 * upgrade message when the limit is reached. `-1` means unlimited.
 */

import { ConvexError } from "convex/values";
import type { Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import { getPlanLabel, getPlanLimits, type PlanLimits, type PlanTier } from "../_platform/limits";

export type PlanLimitKey = keyof PlanLimits;

export async function enforcePlanLimit(
	ctx: MutationCtx | QueryCtx,
	args: {
		orgId: Id<"orgs">;
		limitKey: PlanLimitKey;
		currentCount: number;
	},
): Promise<void> {
	const org = await ctx.db.get(args.orgId);
	if (!org) {
		throw new ConvexError({ code: "ORG_NOT_FOUND", message: "Workspace not found." });
	}
	const tier = (org.plan as PlanTier) ?? "free";
	const limits = getPlanLimits(tier);
	const limit = limits[args.limitKey];

	if (limit === -1) return; // unlimited
	if (args.currentCount < limit) return;

	throw new ConvexError({
		code: "PLAN_LIMIT_REACHED",
		message: `You're at the ${args.limitKey} limit for the ${getPlanLabel(tier)} plan (${limit}). Upgrade to add more.`,
		limitKey: args.limitKey,
		limit,
		plan: tier,
	});
}
