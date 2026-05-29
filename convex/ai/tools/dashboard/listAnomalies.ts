/**
 * convex/ai/tools/dashboard/listAnomalies.ts
 *
 * Stage 5 — list_anomalies tool. Read-only by default; when called
 * with `refresh: true` the user must hold `ai.briefingRefresh`, which
 * triggers a fresh per-org cron-equivalent scan.
 */

import { z } from "zod";
import { internal } from "../../../_generated/api";
import type { Doc } from "../../../_generated/dataModel";
import { registerTool } from "../../toolRegistry";
import { requirePermission, runTool, toolQuery } from "../_shared";
import { getDashboardCtx } from "./_context";

registerTool({
	name: "list_anomalies",
	layer: "dashboard",
	permission: "ai.use",
	confirmation: "none",
	description:
		"List dashboard anomaly chips visible to the calling user (sorted critical first, then by recency). Optionally refresh on-demand.",
	instruction: {
		whenToCall:
			"Use when the user asks 'what anomalies are flagged?', 'show me the AI Pulse alerts', 'what's wrong this week?'. Set refresh:true ONLY when the user explicitly asks to refresh ('rerun the anomaly scan').",
		whenNotToCall:
			"the user wants per-deal scoring (use score_deal) OR a full briefing (use get_briefing).",
		preflight: [],
		requiredClarifications: [],
		synonyms: ["AI Pulse", "anomaly chips", "what's flagged", "warnings"],
		goodExample: { description: "User: 'What anomalies are flagged?'", args: {} },
	},
	runbook: {
		onSuccess:
			"Group by severity in your reply. Highlight criticals first. Don't dump every chip — surface the top 3-5.",
		onEmpty:
			"Tell the user the dashboard has no current anomaly chips and the cron runs daily at 06:00 UTC.",
	},
	schema: z.object({
		refresh: z
			.boolean()
			.default(false)
			.describe("If true, trigger an on-demand re-scan. Requires ai.briefingRefresh."),
		widget: z
			.string()
			.optional()
			.describe("Optional widget filter (e.g. pipeline.salesPanel)."),
	}),
	execute: async (args) =>
		runTool(async () => {
			const tc = getDashboardCtx();
			requirePermission(tc.permissions, "ai.use");

			if (args.refresh) {
				requirePermission(tc.permissions, "ai.briefingRefresh");
				await tc.ctx.runMutation(internal.ai.insights.anomalies.refreshForOrgForAI, {
					orgId: tc.orgId,
					userId: tc.userId,
				});
			}

			const rows = (await toolQuery(tc, "dashboard/annotations/queries:listForOrg", {
				orgId: tc.orgId,
				widgetKey: args.widget,
				limit: 25,
			})) as Doc<"dashboardAnnotations">[];

			return {
				ok: true as const,
				data: {
					count: rows.length,
					anomalies: rows.map((r) => ({
						id: r._id,
						severity: r.severity,
						widgetKey: r.widgetKey || null,
						note: r.note,
						facts: r.facts,
						suggestedIntent: r.suggestedIntent,
						source: r.source,
					})),
				},
				summary: {
					headline:
						rows.length === 0
							? "No anomaly chips on the dashboard right now."
							: `${rows.length} anomaly chip${rows.length === 1 ? "" : "s"} surfaced (${rows.filter((r) => r.severity === "critical").length} critical).`,
					table: rows.slice(0, 5).map((r) => ({
						label: r.severity.toUpperCase(),
						value: r.note,
					})),
				},
			};
		}),
});
