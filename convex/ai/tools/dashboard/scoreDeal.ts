/**
 * convex/ai/tools/dashboard/scoreDeal.ts
 *
 * Stage 5 — score_deal tool. Refreshes the deterministic score for a
 * single deal on demand. Atomic (read + write to dealScores in a single
 * step). Permission: deals.view.
 *
 * Calls `ai/insights/dealScores:scoreSingleDealForAI` directly — that
 * mutation runs requireOrgMemberByIds + requireRole(deals.view) +
 * scoreDealForOrg + upsertScore.
 */

import { z } from "zod";
import { internal } from "../../../_generated/api";
import type { Id } from "../../../_generated/dataModel";
import { registerTool } from "../../toolRegistry";
import { requirePermission, runTool } from "../_shared";
import { getDashboardCtx } from "./_context";

registerTool({
	name: "score_deal",
	layer: "dashboard",
	permission: "deals.view",
	confirmation: "none",
	description:
		"Recompute the predictive score (0–100) for a single deal. Cheap deterministic heuristic; no LLM call.",
	instruction: {
		whenToCall:
			"Use when the user asks 'how's deal D-007 doing?', 'score this deal', 'what's the health of D-012?'. Returns score + component breakdown + confidence label so the user can see WHY it scored that way.",
		whenNotToCall:
			"the user wants a written explanation of the score (use explain_deal_score — that calls an LLM and costs 1 quota credit) OR a list of at-risk deals (use list_at_risk_deals if implemented; otherwise list_anomalies for proactive surfacing).",
		preflight: [],
		requiredClarifications: ["dealCode"],
		synonyms: ["score this deal", "how's the deal", "deal health", "rate this deal"],
		goodExample: {
			description: "User: 'Score D-007.'",
			args: { dealCode: "D-007" },
		},
	},
	runbook: {
		onSuccess:
			"Quote the score + confidence in one sentence. Highlight the strongest + weakest component. Don't dump the raw component object.",
		onValidationError:
			"Pass the dealCode the user gave verbatim. Refusing on a missing code → call ask_user_input.",
		onPermissionDenied: "Tell the user they need deals.view permission.",
		suggestNext: "explain_deal_score",
	},
	schema: z.object({
		dealCode: z.string().min(1).describe("Deal code (e.g. D-007)."),
	}),
	execute: async (args) =>
		runTool(async () => {
			const tc = getDashboardCtx();
			requirePermission(tc.permissions, "deals.view");

			// Resolve dealCode → dealId.
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
					error: `No deal with code '${args.dealCode}' exists in this workspace.`,
				};
			}

			const result = (await tc.ctx.runMutation(
				internal.ai.insights.dealScores.scoreSingleDealForAI,
				{
					orgId: tc.orgId,
					userId: tc.userId,
					dealId: deal._id,
				},
			)) as {
				score: number;
				confidence: "high" | "medium" | "low";
				components: {
					recency: number;
					stageAge: number;
					value: number;
					ownerVelocity: number;
					activityCount: number;
				};
				dealCode: string;
				title: string;
			} | null;

			if (!result) {
				return {
					ok: false as const,
					error: `Couldn't score ${args.dealCode} — the deal is missing or soft-deleted.`,
				};
			}

			return {
				ok: true as const,
				data: result,
				summary: {
					headline: `${result.dealCode} scored ${result.score}/100 (${result.confidence} confidence).`,
					table: [
						{ label: "Deal", value: `${result.dealCode} — ${result.title}` },
						{ label: "Score", value: `${result.score}/100` },
						{ label: "Confidence", value: result.confidence },
						{ label: "Recency", value: String(result.components.recency) },
						{ label: "Stage age", value: String(result.components.stageAge) },
						{ label: "Value", value: String(result.components.value) },
						{ label: "Owner velocity", value: String(result.components.ownerVelocity) },
						{ label: "Activity", value: String(result.components.activityCount) },
					],
					suggestedNext: [
						{
							label: "Explain this score",
							intent: `Explain why ${result.dealCode} scored ${result.score}.`,
						},
					],
				},
			};
		}),
});
