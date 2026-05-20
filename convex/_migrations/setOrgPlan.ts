/**
 * One-shot internal mutation — patch `org.plan` for testing purposes.
 *
 * Why
 * ───
 * The plan ladder gates feature limits (number of pipelines, member seats,
 * etc.). During development we sometimes need to flip an org from `free`
 * to `enterprise` to exercise the multi-pipeline UI. Production billing
 * will own this transition; this file is a manual override available to
 * the developer via `convex run`.
 *
 * Usage
 * ─────
 *   npx convex run _migrations/setOrgPlan:run \
 *     '{"orgId":"<id>","plan":"enterprise"}'
 */

import { ConvexError, v } from "convex/values";
import { internalMutation } from "../_generated/server";

const PLANS = ["free", "starter", "pro", "enterprise"] as const;
type Plan = (typeof PLANS)[number];

export const run = internalMutation({
	args: {
		orgId: v.id("orgs"),
		plan: v.union(
			v.literal("free"),
			v.literal("starter"),
			v.literal("pro"),
			v.literal("enterprise"),
		),
	},
	handler: async (ctx, args) => {
		const org = await ctx.db.get(args.orgId);
		if (!org) throw new ConvexError({ code: "NOT_FOUND", message: "Org not found" });
		if (!PLANS.includes(args.plan as Plan)) {
			throw new ConvexError({
				code: "INVALID_PLAN",
				message: `Plan must be one of: ${PLANS.join(", ")}`,
			});
		}
		const before = org.plan;
		await ctx.db.patch(args.orgId, { plan: args.plan, updatedAt: Date.now() });
		return { orgId: args.orgId, before, after: args.plan };
	},
});
