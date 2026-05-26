/**
 * convex/ai/tools/analytics/memberPerformance.ts
 *
 * Stage 7 (`/SPRINT-PLAN.md`). Manager-gated read tool — returns
 * per-member close rate / deals won / pipeline value over a 7d/30d/90d
 * window. Atomic, cheap.
 */

import { z } from "zod";
import { registerTool } from "../../toolRegistry";
import { runTool, toolQuery } from "../_shared";
import { getAnalyticsCtx } from "./_context";

registerTool({
	name: "member_performance",
	layer: "analytics",
	permission: "members.viewPerformance",
	confirmation: "none",
	costClass: "cheap",
	instruction: {
		whenToCall:
			"Use to answer 'how is Sara performing?' / 'who closed the most deals this month?' / 'show me the team's leaderboard'. Returns per-member close rate, deals won, deals lost, open-pipeline value, and activity count over a 7d/30d/90d window. Pure deterministic — no LLM cost.",
		whenNotToCall:
			"Don't use for non-managers — the tool requires `members.viewPerformance` and will refuse otherwise. Don't use to find a specific member's profile (use list_members instead).",
		preflight: ["list_members"],
		synonyms: ["leaderboard", "team performance", "who closed", "rep performance"],
		goodExample: {
			description: "Manager asks 'who closed the most deals this month?'",
			args: { range: "30d" },
		},
	},
	description: "Stub — overridden by buildToolDescription via instruction.",
	runbook: {
		onSuccess:
			"Lead with the top performer by deals won. Mention the next 1-2 for context. Format currency in the org's defaultCurrency. Don't surface emails unless the user asks.",
		onPermissionDenied:
			"Tell the user this tool is gated on the `members.viewPerformance` permission — only managers see per-member numbers.",
		onEmpty:
			"Tell the user no members have closed deals in the requested window. Offer to widen the range to 90d.",
	},
	example: { range: "30d" },
	schema: z.object({
		range: z.enum(["7d", "30d", "90d"]).default("30d"),
	}),
	execute: async ({ range }) =>
		runTool(async () => {
			const tc = getAnalyticsCtx();
			const result = (await toolQuery(
				tc,
				"ai/queries/memberPerformance:getMemberPerformance",
				{
					orgId: tc.orgId,
					range,
				},
			)) as {
				rangeKey: string;
				count: number;
				rows: Array<{
					name: string;
					dealsWon: number;
					dealsLost: number;
					closeRate: number;
					pipelineValueOpen: number;
					pipelineValueWon: number;
					activityCount: number;
				}>;
			} | null;

			if (!result) {
				return {
					ok: false as const,
					error: "You don't have permission to view member performance. The workspace owner controls this via the `members.viewPerformance` role permission.",
					code: "AI_TOOL_UNAUTHORIZED",
				};
			}

			return {
				ok: true as const,
				data: result,
				display: {
					kind: "text" as const,
					text:
						result.count === 0
							? `No member activity in the ${result.rangeKey} window.`
							: `Performance for ${result.count} member(s) over ${result.rangeKey}.`,
				},
			};
		}),
});
