/**
 * convex/ai/insights/dealScores.ts
 *
 * Stage 5 (`/DASHBOARD-V2-PLAN.md`, locked decision #12) — deal-score
 * cron + on-demand single-deal scorer. Built on top of `dealScoring.ts`
 * (pure helpers).
 *
 * Two entry points:
 *   - `rebuildAllOrgs` (cron, daily 06:30 UTC) — paginates active orgs,
 *     rebuilds the full per-org dealScores table.
 *   - `scoreSingleDealForAI` (ForAI twin) — called by the
 *     `score_deal` AI tool to refresh ONE row on demand.
 *
 * The hybrid layer 2 — LLM "explain this score" — lives in
 * `explainDealScore.ts` (`"use node"`).
 *
 * V8 — pure DB I/O.
 */

import { v } from "convex/values";
import { requireOrgMemberByIds } from "../../_functions/authenticated";
import { internal } from "../../_generated/api";
import type { Id } from "../../_generated/dataModel";
import {
	type ActionCtx,
	internalAction,
	internalMutation,
	internalQuery,
	type MutationCtx,
} from "../../_generated/server";
import { requireRole } from "../../_shared/permissions/helpers";
import { buildOwnerVelocityMap, type ScoreComponents, scoreDealForOrg } from "./dealScoring";

/** A score row's TTL — longer than the daily cron so soft-deleted deals reap eventually. */
const SCORE_TTL_MS = 14 * 24 * 60 * 60 * 1000;

// ─── Internal query: scannable orgs ───────────────────────────────────────────

export const listScorableOrgsQuery = internalQuery({
	args: {},
	handler: async (ctx) => {
		const orgs = await ctx.db.query("orgs").collect();
		return orgs
			.filter(
				(o) =>
					!o.deletedAt &&
					(o.plan === "starter" || o.plan === "pro" || o.plan === "enterprise"),
			)
			.map((o) => ({ orgId: o._id }));
	},
});

// ─── Per-org rebuild ──────────────────────────────────────────────────────────

/**
 * Rebuild scores for ONE org. Idempotent — upserts (score row exists =
 * patch, doesn't = insert). Soft-deleted deals are skipped; their score
 * rows reap via the daily TTL sweep.
 *
 * Reads bounded by org size. For very large orgs (10k+ deals) this
 * could hit per-mutation read caps; in that case the cron action would
 * page over deals via cursor-based pagination. v1 ships the simple
 * collect-all path; chunking is a future improvement.
 */
export const rebuildScoresForOrg = internalMutation({
	args: { orgId: v.id("orgs") },
	handler: async (ctx, args) => {
		const now = Date.now();
		const org = await ctx.db.get(args.orgId);
		if (!org || org.deletedAt) return { processed: 0, skipped: "deleted-or-missing" };

		const { ownerVelocityById, medianValue } = await buildOwnerVelocityMap(ctx, {
			orgId: args.orgId,
			now,
		});

		const allDeals = await ctx.db
			.query("deals")
			.withIndex("by_org", (q) => q.eq("orgId", args.orgId))
			.collect();
		const liveOpenDeals = allDeals.filter((d) => !d.deletedAt && !d.wonAt && !d.lostAt);

		let processed = 0;
		for (const deal of liveOpenDeals) {
			const result = await scoreDealForOrg(ctx, {
				orgId: args.orgId,
				dealId: deal._id,
				now,
				orgMedianValue: medianValue,
				ownerVelocityById,
			});
			await upsertScore(ctx, {
				orgId: args.orgId,
				dealId: deal._id,
				score: result.score,
				confidence: result.confidence,
				components: result.components,
				now,
			});
			processed += 1;
		}
		return { processed };
	},
});

/**
 * Cron entry point: paginate every org and schedule the per-org
 * rebuild. Same pattern as anomalies.ts.
 */
export const rebuildAllOrgs = internalAction({
	args: {},
	handler: async (ctx: ActionCtx) => {
		const orgs = (await ctx.runQuery(
			internal.ai.insights.dealScores.listScorableOrgsQuery,
			{},
		)) as Array<{ orgId: Id<"orgs"> }>;
		let processed = 0;
		for (const { orgId } of orgs) {
			try {
				await ctx.runMutation(internal.ai.insights.dealScores.rebuildScoresForOrg, {
					orgId,
				});
				processed += 1;
			} catch (err) {
				console.error("[dealScores] rebuild failed for org", String(orgId), err);
			}
		}
		return { processed };
	},
});

// ─── On-demand single-deal scorer (AI tool surface) ──────────────────────────

/**
 * AI-callable: refresh a single deal's score. Permission gate
 * `deals.view` — every member who can see the deal can refresh its
 * score. Returns the score + component breakdown so the AI tool can
 * surface the result inline in chat.
 */
export const scoreSingleDealForAI = internalMutation({
	args: {
		orgId: v.id("orgs"),
		userId: v.id("users"),
		dealId: v.id("deals"),
	},
	handler: async (ctx, args) => {
		const { member } = await requireOrgMemberByIds(ctx, args.orgId, args.userId);
		requireRole(member.permissions, "deals.view");

		const deal = await ctx.db.get(args.dealId);
		if (!deal || deal.deletedAt || deal.orgId !== args.orgId) {
			return null;
		}
		const now = Date.now();
		const { ownerVelocityById, medianValue } = await buildOwnerVelocityMap(ctx, {
			orgId: args.orgId,
			now,
		});
		const result = await scoreDealForOrg(ctx, {
			orgId: args.orgId,
			dealId: args.dealId,
			now,
			orgMedianValue: medianValue,
			ownerVelocityById,
		});
		await upsertScore(ctx, {
			orgId: args.orgId,
			dealId: args.dealId,
			score: result.score,
			confidence: result.confidence,
			components: result.components,
			now,
		});
		return {
			score: Math.round(result.score),
			confidence: result.confidence,
			components: roundComponents(result.components),
			dealCode: deal.dealCode,
			title: deal.title,
		};
	},
});

// ─── Persisting LLM explanation (called by explainDealScore action) ───────────

/**
 * Internal: stamp the LLM-generated narrative onto an existing score
 * row. Called by `explainDealScore.ts` (a `"use node"` action). The
 * action runs the LLM call then invokes this mutation to persist.
 */
export const setExplanationInternal = internalMutation({
	args: {
		orgId: v.id("orgs"),
		dealId: v.id("deals"),
		text: v.string(),
		modelUsed: v.optional(v.string()),
		byUserId: v.optional(v.id("users")),
	},
	handler: async (ctx, args) => {
		const row = await ctx.db
			.query("dealScores")
			.withIndex("by_org_and_deal", (q) =>
				q.eq("orgId", args.orgId).eq("dealId", args.dealId),
			)
			.unique();
		if (!row) {
			throw new Error("score row missing — score the deal first");
		}
		await ctx.db.patch(row._id, {
			explanation: {
				text: args.text.slice(0, 2000),
				generatedAt: Date.now(),
				byUserId: args.byUserId,
				modelUsed: args.modelUsed,
			},
		});
	},
});

// ─── Internal upsert helper ───────────────────────────────────────────────────

async function upsertScore(
	ctx: MutationCtx,
	args: {
		orgId: Id<"orgs">;
		dealId: Id<"deals">;
		score: number;
		confidence: "high" | "medium" | "low";
		components: ScoreComponents;
		now: number;
	},
): Promise<Id<"dealScores">> {
	const existing = await ctx.db
		.query("dealScores")
		.withIndex("by_org_and_deal", (q) => q.eq("orgId", args.orgId).eq("dealId", args.dealId))
		.unique();
	const patch = {
		score: args.score,
		confidence: args.confidence,
		components: args.components,
		computedAt: args.now,
		expiresAt: args.now + SCORE_TTL_MS,
	};
	if (existing) {
		await ctx.db.patch(existing._id, patch);
		return existing._id;
	}
	return ctx.db.insert("dealScores", {
		orgId: args.orgId,
		dealId: args.dealId,
		...patch,
	});
}

function roundComponents(c: ScoreComponents): ScoreComponents {
	return {
		recency: Math.round(c.recency),
		stageAge: Math.round(c.stageAge),
		value: Math.round(c.value),
		ownerVelocity: Math.round(c.ownerVelocity),
		activityCount: Math.round(c.activityCount),
	};
}

// ─── TTL purge for ephemeralDashboardCells ────────────────────────────────────
//
// Co-located here because the `purgeExpiredEphemeralCells` cron sweeps
// rows on the same daily cadence as the score rebuild. Sweeping
// expired score rows alongside avoids a third near-identical mutation.

export const purgeExpiredCellsAndScores = internalMutation({
	args: {},
	handler: async (ctx) => {
		const now = Date.now();
		const expiredCells = await ctx.db
			.query("ephemeralDashboardCells")
			.withIndex("by_expires", (q) => q.lte("expiresAt", now))
			.collect();
		for (const row of expiredCells) {
			await ctx.db.delete(row._id);
		}
		const expiredScores = await ctx.db
			.query("dealScores")
			.withIndex("by_expires", (q) => q.lte("expiresAt", now))
			.collect();
		for (const row of expiredScores) {
			await ctx.db.delete(row._id);
		}
		const expiredAnnotations = await ctx.db
			.query("dashboardAnnotations")
			.withIndex("by_expires", (q) =>
				q.gt("expiresAt", undefined as never).lte("expiresAt", now),
			)
			.collect();
		for (const row of expiredAnnotations) {
			await ctx.db.delete(row._id);
		}
		return {
			cells: expiredCells.length,
			scores: expiredScores.length,
			annotations: expiredAnnotations.length,
		};
	},
});
