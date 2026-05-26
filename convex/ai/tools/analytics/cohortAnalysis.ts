/**
 * convex/ai/tools/analytics/cohortAnalysis.ts
 *
 * Stage 7 (`/SPRINT-PLAN.md`). The `cohort_analysis` AI tool reads the
 * latest persisted `aiCohortReports` row for a given kind. The rebuild
 * runs nightly via `internal.ai.actions.rebuildCohorts.rebuildAllOrgs`,
 * so the read path is a single indexed lookup with zero LLM cost.
 *
 * Atomic — no propose/commit. Cost class `cheap`.
 */

import { z } from "zod";
import { registerTool } from "../../toolRegistry";
import { runTool, toolQuery } from "../_shared";
import { getAnalyticsCtx } from "./_context";

registerTool({
	name: "cohort_analysis",
	layer: "analytics",
	permission: "ai.cohorts.view",
	confirmation: "none",
	costClass: "cheap",
	instruction: {
		whenToCall:
			"Use to answer 'what's our conversion rate by lead source?' / 'which industry converts best?' / 'who's converting the most leads?'. Returns the latest deterministic cohort rollup (count, conversion rate, avg deal value, total value) per cohort key for one of: leadSource, industry, owner. Cached overnight — no LLM cost.",
		whenNotToCall:
			"Don't use to find a specific record (use search_crm) or for narrative (use analyze_metric).",
		preflight: [],
		synonyms: ["conversion rate", "by source", "by industry", "by owner", "cohort"],
		goodExample: {
			description: "User asks 'which lead source converts best?'",
			args: { kind: "leadSource" },
		},
	},
	description: "Stub — overridden by buildToolDescription via instruction.",
	runbook: {
		onSuccess:
			"Lead with the top cohort (highest conversionRate or totalValue, depending on what the user asked). Mention the next 1-2 for context. Round percentages to whole numbers; format currency in the org's defaultCurrency.",
		onEmpty:
			"Tell the user the cohort report hasn't been generated yet — it rebuilds nightly. Offer to run analyze_metric for an on-demand insight instead.",
	},
	example: { kind: "leadSource" },
	schema: z.object({
		kind: z.enum(["leadSource", "industry", "owner"]),
	}),
	execute: async ({ kind }) =>
		runTool(async () => {
			const tc = getAnalyticsCtx();
			const result = (await toolQuery(tc, "ai/queries/cohorts:getLatestCohort", {
				orgId: tc.orgId,
				kind,
			})) as {
				kind: string;
				rows: Array<{
					key: string;
					label?: string;
					count: number;
					convertedCount: number;
					conversionRate: number;
					avgDealValue: number;
					totalValue: number;
				}>;
				generatedAt: number | null;
			} | null;

			const safe = result ?? { kind, rows: [], generatedAt: null };

			if (safe.rows.length === 0) {
				return {
					ok: true as const,
					data: safe,
					display: {
						kind: "text" as const,
						text:
							safe.generatedAt === null
								? "No cohort report yet — the nightly rebuild hasn't run for this workspace. Try analyze_metric for an on-demand pass."
								: `Cohort report for ${kind} is empty.`,
					},
				};
			}

			return {
				ok: true as const,
				data: safe,
				display: {
					kind: "text" as const,
					text: `${safe.rows.length} cohort(s) for ${kind}.`,
				},
			};
		}),
});
