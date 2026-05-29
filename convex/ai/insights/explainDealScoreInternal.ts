/**
 * convex/ai/insights/explainDealScoreInternal.ts
 *
 * V8 helpers for the `"use node"` action `explainDealScore.ts`.
 * Convex forbids `internalQuery` / `internalMutation` in `"use node"`
 * files, so the read paths live here. Same-folder, no public surface.
 */

import { v } from "convex/values";
import { requireOrgMemberByIds } from "../../_functions/authenticated";
import type { Id } from "../../_generated/dataModel";
import { internalQuery } from "../../_generated/server";
import { requireRole } from "../../_shared/permissions/helpers";

/**
 * Membership + ai.briefingRefresh gate. Returns ok / not-ok so the
 * caller can map to a user-facing error string.
 */
export const requireBriefingRefreshAccess = internalQuery({
	args: { orgId: v.id("orgs"), userId: v.id("users") },
	handler: async (ctx, args) => {
		try {
			const { member } = await requireOrgMemberByIds(ctx, args.orgId, args.userId);
			requireRole(member.permissions, "ai.briefingRefresh");
			return { ok: true as const };
		} catch (err) {
			return {
				ok: false as const,
				error: err instanceof Error ? err.message : "Permission denied.",
			};
		}
	},
});

/**
 * Load deal + matching score row. Resolves pipeline name + stage name
 * + owner name so the LLM prompt has full context. Returns null when
 * the deal is missing, soft-deleted, or does not belong to the org.
 */
export const loadDealAndScore = internalQuery({
	args: { orgId: v.id("orgs"), dealId: v.id("deals") },
	handler: async (ctx, args) => {
		const deal = await ctx.db.get(args.dealId);
		if (!deal || deal.deletedAt || deal.orgId !== args.orgId) {
			return { ok: false as const, error: "Deal not found." };
		}
		const score = await ctx.db
			.query("dealScores")
			.withIndex("by_org_and_deal", (q) =>
				q.eq("orgId", args.orgId).eq("dealId", args.dealId),
			)
			.unique();
		if (!score) {
			return {
				ok: false as const,
				error: "No score row yet — call score_deal first to generate one.",
			};
		}

		const pipeline = await ctx.db.get(deal.pipelineId);
		const pipelineName = pipeline?.name ?? "Unknown pipeline";
		const stageName =
			(pipeline?.stages as Array<{ id: string; name: string }> | undefined)?.find(
				(s) => s.id === deal.currentStageId,
			)?.name ?? "Unknown stage";

		let ownerName = "Unassigned";
		if (deal.assignedTo) {
			const owner = await ctx.db.get(deal.assignedTo as Id<"users">);
			ownerName = owner?.name ?? owner?.email ?? "Unassigned";
		}

		return {
			ok: true as const,
			deal: {
				dealCode: deal.dealCode,
				title: deal.title,
				value: typeof deal.value === "number" ? deal.value : undefined,
				currency: deal.currency ?? undefined,
				pipelineName,
				stageName,
				stageEnteredAt: deal.stageEnteredAt ?? deal.createdAt ?? Date.now(),
				ownerName,
			},
			score: {
				score: score.score,
				confidence: score.confidence,
				components: score.components,
			},
		};
	},
});
