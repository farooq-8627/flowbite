"use node";

/**
 * convex/ai/insights/explainDealScore.ts
 *
 * Stage 5 (`/DASHBOARD-V2-PLAN.md`, locked decision #12) — hybrid layer 2.
 *
 * On-demand LLM-generated narrative explaining a deal's deterministic
 * score. The deterministic layer (`dealScoring.ts`) ships every
 * dashboard score; this action runs ONLY when the user clicks the score
 * dot's "Why?" button. Cost: 1 generateText call per click.
 *
 * Permission: `ai.briefingRefresh` — same gate as the weekly briefing
 * manual refresh.
 *
 * `"use node"` because we call into `@ai-sdk/*` SDK + `generateText`,
 * both of which require Node. Persists the narrative back to the
 * dealScores row via `setExplanationInternal` (V8 mutation).
 *
 * Returns the explanation text so the AI tool's commit can echo it
 * inline in chat without a second round-trip.
 */

import { generateText } from "ai";
import { v } from "convex/values";
import { internal } from "../../_generated/api";
import { internalAction } from "../../_generated/server";
import { pickBriefingModel } from "../briefingsActions";

export const run = internalAction({
	args: {
		orgId: v.id("orgs"),
		userId: v.id("users"),
		dealId: v.id("deals"),
	},
	handler: async (ctx, args) => {
		// 1. Membership + permission gate via the same internal helper
		// the weekly briefing uses. We do this through a query because
		// "use node" actions can't import authenticated helpers
		// directly.
		const membership = (await ctx.runQuery(
			internal.ai.insights.explainDealScoreInternal.requireBriefingRefreshAccess,
			{ orgId: args.orgId, userId: args.userId },
		)) as { ok: true } | { ok: false; error: string };
		if (!membership.ok) {
			return { ok: false as const, error: membership.error };
		}

		// 2. Read deal + score row.
		const data = (await ctx.runQuery(
			internal.ai.insights.explainDealScoreInternal.loadDealAndScore,
			{ orgId: args.orgId, dealId: args.dealId },
		)) as
			| {
					ok: true;
					deal: {
						dealCode: string;
						title: string;
						value?: number;
						currency?: string;
						pipelineName: string;
						stageName: string;
						stageEnteredAt: number;
						ownerName: string;
					};
					score: {
						score: number;
						confidence: "high" | "medium" | "low";
						components: {
							recency: number;
							stageAge: number;
							value: number;
							ownerVelocity: number;
							activityCount: number;
						};
					};
			  }
			| { ok: false; error: string };
		if (!data.ok) {
			return { ok: false as const, error: data.error };
		}

		// 3. Resolve a usable model.
		const choice = await pickBriefingModel(ctx, args.orgId, args.userId);
		if (!choice) {
			return {
				ok: false as const,
				error: "No AI key is available to explain the score. Add a BYOK key in Settings → AI.",
			};
		}

		// 4. Build the prompt.
		const stageAgeDays = Math.round(
			(Date.now() - data.deal.stageEnteredAt) / (24 * 60 * 60 * 1000),
		);
		const valueLine =
			typeof data.deal.value === "number" && data.deal.value > 0
				? `Value: ${data.deal.value.toLocaleString("en-US")} ${data.deal.currency ?? ""}`.trim()
				: "Value: not set";

		const prompt = `You are a CRM coach. A deal in this pipeline scored ${Math.round(data.score.score)}/100 (confidence: ${data.score.confidence}).

Deal facts:
- Code: ${data.deal.dealCode}
- Title: ${data.deal.title}
- Pipeline: ${data.deal.pipelineName}
- Stage: ${data.deal.stageName} (${stageAgeDays} days)
- Owner: ${data.deal.ownerName}
- ${valueLine}

Score breakdown (each axis 0-100, weighted into the final score):
- Recency: ${data.score.components.recency}
- Stage age: ${data.score.components.stageAge}
- Value: ${data.score.components.value}
- Owner velocity: ${data.score.components.ownerVelocity}
- Activity count: ${data.score.components.activityCount}

Write 2-3 short sentences in plain professional language that explain WHY this deal scored this way. Identify the strongest signal (the highest component) and the weakest. End with one concrete next-step suggestion (e.g. "Schedule a call this week to break the stage stall"). Do NOT use bullet points or repeat the raw numbers.`;

		// 5. Generate.
		try {
			const result = await generateText({
				model: choice.model as Parameters<typeof generateText>[0]["model"],
				prompt,
				temperature: 0.4,
				maxOutputTokens: 200,
			});

			// 6. Persist.
			await ctx.runMutation(internal.ai.insights.dealScores.setExplanationInternal, {
				orgId: args.orgId,
				dealId: args.dealId,
				text: result.text,
				modelUsed: `${choice.source}:${choice.modelKey}`,
				byUserId: args.userId,
			});

			return {
				ok: true as const,
				text: result.text,
				modelUsed: `${choice.source}:${choice.modelKey}`,
				inputTokens: result.usage?.inputTokens,
				outputTokens: result.usage?.outputTokens,
			};
		} catch (err) {
			console.error("[explainDealScore] failed:", err);
			return {
				ok: false as const,
				error: `LLM call failed: ${String(err).slice(0, 200)}`,
			};
		}
	},
});
