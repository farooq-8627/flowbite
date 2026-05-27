/**
 * convex/ai/tools/analytics/analyzeMetric.ts
 *
 * Stage 7 (`/SPRINT-PLAN.md`). The `analyze_metric` AI tool — a twoStep
 * subagent that turns "why did pipeline value drop?" into a structured
 * `aiInsights` row.
 *
 * Flow:
 *   1. propose: returns a confirmation card describing what we'll do
 *      (no DB write yet).
 *   2. commit_analyze_metric: enforces the 1/min rate limit (via
 *      `enforceRateLimit`) + the 10/day soft cap (via the
 *      `countRecentRunsForOrg` helper), then schedules the LLM action
 *      `internal.ai.actions.analyzeMetric.run`.
 *
 * Cost class: `expensive` (Constraint I) — declared on the ToolDef so
 * the orchestrator + future per-class quota gate sees the hint.
 */

import { z } from "zod";
import { registerTool } from "../../toolRegistry";
import { propose, runTool, toolMutation, toolQuery } from "../_shared";
import { getAnalyticsCtx } from "./_context";

const METRIC_VALUES = [
	"deals.pipelineValue",
	"deals.open",
	"deals.won",
	"deals.lost",
	"leads.open",
	"contacts.active",
	"companies.active",
] as const;

const RANGE_VALUES = ["7d", "30d", "90d"] as const;

// ─── propose ─────────────────────────────────────────────────────────────

registerTool({
	name: "analyze_metric",
	layer: "analytics",
	permission: "ai.analytics.viewMetrics",
	confirmation: "twoStep",
	approvalCategory: "settings",
	costClass: "expensive",
	instruction: {
		whenToCall:
			"Use to answer 'why is X happening?' / 'explain the dip in Y' / 'what's driving Z?'. The tool computes a structured insight (summary + 3-5 findings + action items + confidence) over a 7d/30d/90d window and persists it to aiInsights so the dashboard + briefing can reference it.",
		whenNotToCall:
			"Don't use for raw stats — use search_crm or get_dashboard_summary. Don't use for cross-member comparisons — use member_performance. Don't use for cohort breakdowns — use cohort_analysis.",
		preflight: ["get_dashboard_summary"],
		synonyms: ["why", "explain", "what's driving", "dig into", "analyse", "diagnose"],
		goodExample: {
			description: "User asks 'why is pipeline value down 12% this week?'",
			args: { metric: "deals.pipelineValue", range: "7d" },
		},
		badExample: {
			description: "User asks 'how many deals are open?' — that's just a stats question.",
			args: { metric: "deals.open", range: "30d" },
			whyBad: "Use get_dashboard_summary instead — analyze_metric burns LLM budget for no narrative win.",
		},
	},
	description: "Stub — overridden by buildToolDescription via instruction.",
	runbook: {
		onSuccess:
			"Render the insight summary as the headline. Then list the findings as bullets. Surface action items as suggestedNext chips. Don't dump JSON — paraphrase.",
		onPermissionDenied:
			"Tell the user the workspace owner needs to enable AI Analytics for their role.",
	},
	example: { metric: "deals.pipelineValue", range: "30d" },
	schema: z.object({
		metric: z.enum(METRIC_VALUES),
		range: z.enum(RANGE_VALUES).default("30d"),
	}),
	execute: async ({ metric, range }) =>
		runTool(async () => {
			return propose(
				"analyze_metric",
				{ metric, range },
				{
					title: `Analyse ${metric} over ${range}`,
					fields: [
						{ label: "Metric", value: metric },
						{ label: "Window", value: range },
						{ label: "Cost class", value: "expensive (LLM call, 1/min, 10/day)" },
					],
				},
			);
		}),
});

// ─── commit_analyze_metric ───────────────────────────────────────────────

registerTool({
	name: "commit_analyze_metric",
	layer: "analytics",
	permission: "ai.analytics.viewMetrics",
	confirmation: "none",
	costClass: "expensive",
	description:
		"Commit step for analyze_metric — runs the LLM narrative pass and writes aiInsights.",
	example: { metric: "deals.pipelineValue", range: "30d" },
	schema: z.object({
		metric: z.enum(METRIC_VALUES),
		range: z.enum(RANGE_VALUES).default("30d"),
	}),
	execute: async ({ metric, range }) =>
		runTool(async () => {
			const tc = getAnalyticsCtx();

			// Soft cap — count successful runs in the last 24h.
			const recentRuns = (await toolQuery(
				tc,
				"ai/analyzeMetricHelpers:countRecentRunsForOrg",
				{ orgId: tc.orgId, toolName: "commit_analyze_metric" },
			)) as number;
			if (recentRuns >= 10) {
				return {
					ok: false as const,
					error: "This workspace has used its 10 analyze_metric calls for today. The window resets in 24h.",
					code: "AI_QUOTA_EXHAUSTED",
				};
			}

			// Schedule the action — fire-and-forget. The action persists
			// the insight via writeInsight; the user reads it via list_insights
			// or the AI Insights ribbon.
			await toolMutation(tc, "ai/queries/insights:scheduleAnalyzeMetric", {
				orgId: tc.orgId,
				userId: tc.userId,
				metric,
				range,
			});

			return {
				ok: true as const,
				data: { metric, range, scheduled: true },
				summary: {
					headline: `Analysing ${metric} over ${range}.`,
					table: [
						{ label: "Metric", value: metric, emphasis: "added" as const },
						{ label: "Window", value: range, emphasis: "added" as const },
					],
					facts: [
						"The narrative will appear in your AI Insights feed within ~30 seconds.",
						"Cached for 90 days — re-running on the same window won't double-bill.",
					],
					suggestedNext: [
						{
							label: "Show pipeline velocity",
							intent: "Show me where deals are stalling in the pipeline.",
						},
						{
							label: "Compare this vs last month",
							intent: `Analyse ${metric} but compare 30d to 90d.`,
						},
					],
				},
				display: {
					kind: "text" as const,
					text: `Analysis scheduled. The insight will appear in the AI Insights feed shortly.`,
				},
			};
		}),
});
