/**
 * convex/ai/tools/dashboard/explainDealScore.ts
 *
 * Stage 5 — explain_deal_score tool. Invokes the `"use node"` LLM
 * action `ai/insights/explainDealScore:run`, which writes the
 * narrative back to the dealScores row + returns it.
 *
 * costClass: expensive — 1 LLM call per invocation.
 * Permission: ai.briefingRefresh.
 */

import { z } from "zod";
import { internal } from "../../../_generated/api";
import type { Id } from "../../../_generated/dataModel";
import { registerTool } from "../../toolRegistry";
import { requirePermission, runTool } from "../_shared";
import { getDashboardCtx } from "./_context";

registerTool({
	name: "explain_deal_score",
	layer: "dashboard",
	permission: "ai.briefingRefresh",
	confirmation: "none",
	costClass: "expensive",
	description:
		"Generate a 2-3 sentence LLM narrative explaining why a deal scored the way it did. Costs 1 LLM call.",
	instruction: {
		whenToCall:
			"Use when the user asks 'why did D-007 score 42?', 'explain the score', 'what's behind this deal's score'. Calls a small generative model on top of the deterministic component breakdown to surface a concrete next-step.",
		whenNotToCall:
			"the user just wants the raw score (use score_deal — atomic, no LLM cost) OR the user has not run score_deal yet on this deal.",
		preflight: ["score_deal"],
		requiredClarifications: ["dealCode"],
		synonyms: ["explain the score", "why this score", "what's behind", "diagnose"],
		goodExample: {
			description: "User: 'Explain why D-007 scored 42.'",
			args: { dealCode: "D-007" },
		},
	},
	runbook: {
		onSuccess:
			"Reply with the narrative verbatim — it's already 2-3 sentences. Don't restate the raw score.",
		onValidationError: "Call ask_user_input ONCE for missing dealCode.",
		onPermissionDenied:
			"Tell the user they need ai.briefingRefresh permission to use the LLM explainer.",
		suggestNext: "annotate_widget",
	},
	schema: z.object({
		dealCode: z.string().min(1).describe("Deal code (e.g. D-007)."),
	}),
	execute: async (args) =>
		runTool(async () => {
			const tc = getDashboardCtx();
			requirePermission(tc.permissions, "ai.briefingRefresh");

			const deal = (await tc.ctx.runQuery(
				"crm/entities/deals/queries:getByDealCodeForAI" as never,
				{
					orgId: tc.orgId,
					userId: tc.userId,
					dealCode: args.dealCode,
				} as never,
			)) as { _id: Id<"deals"> } | null;
			if (!deal) {
				return {
					ok: false as const,
					error: `No deal with code '${args.dealCode}' exists.`,
				};
			}

			const result = (await tc.ctx.runAction(internal.ai.insights.explainDealScore.run, {
				orgId: tc.orgId,
				userId: tc.userId,
				dealId: deal._id,
			})) as { ok: true; text: string; modelUsed: string } | { ok: false; error: string };

			if (!result.ok) {
				return { ok: false as const, error: result.error };
			}
			return {
				ok: true as const,
				data: { text: result.text, modelUsed: result.modelUsed, dealCode: args.dealCode },
				summary: {
					headline: `Explanation for ${args.dealCode}`,
					table: [{ label: "Why this score", value: result.text }],
				},
			};
		}),
});
