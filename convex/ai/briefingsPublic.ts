/**
 * convex/ai/briefingsPublic.ts
 *
 * Public-facing briefing queries + manual refresh mutation.
 * Split from briefings.ts because public functions cannot live in a "use node" file.
 */
import { v } from "convex/values";
import { orgMutation, orgQuery, requireOrgMember } from "../_functions/authenticated";
import { requireRole } from "../_shared/permissions/helpers";
import { enforceRateLimit } from "../_shared/rateLimit";

/** Get the latest briefing for the calling user. */
export const getLatest = orgQuery({
	args: { orgId: v.id("orgs") },
	handler: async (ctx, args) => {
		const { userId } = await requireOrgMember(ctx, args.orgId);
		const briefing = await ctx.db
			.query("aiBriefings")
			.withIndex("by_org_and_user_and_generated", (q) =>
				q.eq("orgId", args.orgId).eq("userId", userId),
			)
			.order("desc")
			.first();
		if (!briefing) return null;
		// Filter out expired briefings
		if (briefing.expiresAt < Date.now()) return null;
		return briefing;
	},
});

/**
 * Manually trigger a fresh briefing generation.
 * Counts against the user's AI message quota when triggered manually.
 */
export const refreshNow = orgMutation({
	args: { orgId: v.id("orgs") },
	handler: async (ctx, args) => {
		const { member, userId } = await requireOrgMember(ctx, args.orgId);
		requireRole(member.permissions, "ai.briefingRefresh");

		await enforceRateLimit(ctx, {
			scope: "ai.briefing.refresh",
			key: `${userId}:${args.orgId}`,
			max: 5,
			periodMs: 60_000,
		});

		// Schedule the generate action — running it inline would deadlock the mutation
		// String-path forward ref because briefingsActions.generate is in a "use node" file
		await ctx.scheduler.runAfter(
			0,
			// biome-ignore lint/suspicious/noExplicitAny: Convex pre-codegen forward ref
			"ai/briefingsActions:generate" as any,
			{
				orgId: args.orgId,
				userId,
				trigger: "manual",
			} as never,
		);

		return { scheduled: true };
	},
});
