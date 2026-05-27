/**
 * convex/ai/tools/proactive.ts
 *
 * Stage 6 of /SPRINT-PLAN.md (Proactive layer). Three always-on read
 * tools that surface the heuristic ranker + anomaly detector + stale
 * detector to the model in chat. No expand_tools needed — these are
 * the proactive surface and must be visible by default.
 *
 * Tools (all `layer: "always"`, `confirmation: "none"`):
 *
 *   - list_next_actions       — top-N ranked next actions for the user.
 *   - list_stale_records      — leads the user hasn't touched in ≥ N days.
 *   - list_pipeline_anomalies — week-over-week anomalies on pipelineValue,
 *                               new leads, deals won.
 *
 * Each tool calls a `*ForAI` internal twin (per AGENTS.md non-negotiable
 * rule). The twins live next to the public queries in
 * `convex/ai/queries/nextActions.ts` and `convex/ai/queries/anomalies.ts`.
 *
 * Permissions:
 *   - list_next_actions / list_stale_records: gated on `leads.view` (the
 *     same low bar as the AISuggestionsPanel + briefings).
 *   - list_pipeline_anomalies: gated on `deals.view` (it surfaces deal
 *     value movements which contacts-only roles shouldn't see).
 */

import { z } from "zod";
import { registerTool } from "../toolRegistry";
import { runTool, type ToolContext, toolQuery } from "./_shared";

let _ctx: ToolContext | null = null;
export function setProactiveContext(c: ToolContext): void {
	_ctx = c;
}
function getCtx(): ToolContext {
	if (!_ctx) throw new Error("proactive ctx not bound");
	return _ctx;
}

// ─── list_next_actions ───────────────────────────────────────────────────

registerTool({
	name: "list_next_actions",
	layer: "always",
	permission: "leads.view",
	confirmation: "none",
	instruction: {
		whenToCall:
			"Use to answer 'what should I do next?' / 'which records need my attention?' / 'show me my top priorities'. Reads the materialised proactive ranker (rebuilt reactively on every lead/deal/task change) so cost is constant per call regardless of workspace size.",
		whenNotToCall:
			"Don't use to find a specific person or deal — use search_crm. Don't use to list every reminder — use list_tasks.",
		preflight: ["list_my_permissions"],
		synonyms: ["what should I do", "my priorities", "top tasks", "focus list", "what's next"],
		goodExample: {
			description: "User asks 'what should I do today?'",
			args: { limit: 5 },
		},
		badExample: {
			description: "User asks 'show me Acme Corp' — that's a search, not a ranked list.",
			args: { limit: 5 },
			whyBad: "Use search_crm with name='Acme Corp' instead.",
		},
	},
	description: "Stub — overridden by buildToolDescription via instruction.",
	runbook: {
		onSuccess:
			"Group by confidence (high → medium → low). For each row, mention the recordCode, headline reason, and a one-line suggested move. Don't dump raw JSON.",
		onEmpty:
			"Tell the user there are no urgent next actions right now and offer to scan stale leads (list_stale_records) or pipeline anomalies (list_pipeline_anomalies).",
	},
	example: { limit: 10 },
	schema: z.object({
		limit: z.number().int().min(1).max(50).optional(),
	}),
	execute: async ({ limit }) =>
		runTool(async () => {
			const tc = getCtx();
			const result = (await toolQuery(tc, "ai/queries/nextActions:listForUser", {
				orgId: tc.orgId,
				limit,
			})) as {
				count: number;
				generatedAt: number | null;
				rows: Array<{
					id: string;
					recordKind: string;
					recordCode: string;
					score: number;
					confidence: "high" | "medium" | "low";
					reasonCode: string;
					reasonText: string;
					suggestedIntent: string;
					dueAt?: number;
					snoozedUntil?: number;
					createdAt: number;
				}>;
			};

			return {
				ok: true as const,
				data: {
					count: result.count,
					generatedAt: result.generatedAt,
					rows: result.rows.map((r) => ({
						recordKind: r.recordKind,
						recordCode: r.recordCode,
						score: r.score,
						confidence: r.confidence,
						reasonCode: r.reasonCode,
						reasonText: r.reasonText,
						suggestedIntent: r.suggestedIntent,
						dueAt: r.dueAt,
					})),
				},
				display: {
					kind: "text" as const,
					text:
						result.count === 0
							? "No urgent next actions right now."
							: `Top ${result.count} next actions ranked by urgency.`,
				},
			};
		}),
});

// ─── list_stale_records ──────────────────────────────────────────────────

registerTool({
	name: "list_stale_records",
	layer: "always",
	permission: "leads.view",
	confirmation: "none",
	instruction: {
		whenToCall:
			"Use to answer 'which leads have I been ignoring?' / 'show me stale records' / 'who haven't I followed up with in a while?'. Returns leads (assigned to the calling user, status not Won/Lost/Converted) where `updatedAt` is older than `thresholdDays`.",
		whenNotToCall:
			"Don't use to find specific named records — use search_crm. Don't use for stale deals — for those, use list_next_actions which surfaces stuck-stage deals.",
		preflight: [],
		synonyms: ["stale leads", "forgotten leads", "who haven't I called", "untouched leads"],
		goodExample: {
			description: "User asks 'show me my stale leads from the last 14 days.'",
			args: { thresholdDays: 14, limit: 20 },
		},
	},
	description: "Stub — overridden by buildToolDescription via instruction.",
	runbook: {
		onSuccess:
			"Cluster the list — older leads first, mention the personCode + display name + days-since-last-activity. Suggest a follow-up reminder for the top 1-2.",
		onEmpty:
			"Congratulate the user — no stale leads. Offer to lower the threshold or scan a different threshold.",
	},
	example: { thresholdDays: 7 },
	schema: z.object({
		thresholdDays: z.number().int().min(1).max(180).optional(),
		limit: z.number().int().min(1).max(100).optional(),
	}),
	execute: async ({ thresholdDays, limit }) =>
		runTool(async () => {
			const tc = getCtx();
			const result = (await toolQuery(tc, "ai/queries/anomalies:listStaleLeadsForUser", {
				orgId: tc.orgId,
				thresholdDays,
				limit,
			})) as {
				thresholdDays: number;
				count: number;
				rows: Array<{
					personCode: string;
					displayName: string;
					daysSinceLastActivity: number;
					suggestedIntent: string;
				}>;
			};

			return {
				ok: true as const,
				data: result,
				display: {
					kind: "text" as const,
					text:
						result.count === 0
							? `No stale leads (${result.thresholdDays}+ day threshold).`
							: `${result.count} stale lead${result.count === 1 ? "" : "s"} (${result.thresholdDays}+ days untouched).`,
				},
			};
		}),
});

// ─── list_pipeline_anomalies ─────────────────────────────────────────────

registerTool({
	name: "list_pipeline_anomalies",
	layer: "always",
	permission: "deals.view",
	confirmation: "none",
	instruction: {
		whenToCall:
			"Use to answer 'why is my pipeline down?' / 'what changed this week?' / 'show me the deltas vs last week'. Reports week-over-week deltas on pipeline value, new leads, and deals won. Pure DB scan — no LLM cost.",
		whenNotToCall:
			"Don't use for cohort analysis or 'why' questions — those are Stage 7 (analyze_metric / cohort_analysis tools).",
		preflight: ["list_pipelines"],
		synonyms: ["week over week", "WoW", "pipeline drop", "pipeline trend", "what changed"],
		goodExample: {
			description: "User asks 'pipeline this week vs last week?'",
			args: { range: "7d" },
		},
	},
	description: "Stub — overridden by buildToolDescription via instruction.",
	runbook: {
		onSuccess:
			"Lead with the metric whose |% change| is largest. Use the headline as the lede, then quote the suggestedIntent as the recommended next move.",
		onEmpty: "Tell the user nothing crossed the 10% anomaly threshold — workspace is steady.",
	},
	example: { range: "7d" },
	schema: z.object({
		range: z.union([z.literal("7d"), z.literal("14d"), z.literal("30d")]).optional(),
	}),
	execute: async ({ range }) =>
		runTool(async () => {
			const tc = getCtx();
			const result = (await toolQuery(tc, "ai/queries/anomalies:getOrgAnomalies", {
				orgId: tc.orgId,
				range,
			})) as {
				rangeKey: "7d" | "14d" | "30d";
				currency: string;
				count: number;
				rows: Array<{
					metric: string;
					currentValue: number;
					previousValue: number;
					absoluteDelta: number;
					percentDelta: number;
					direction: "up" | "down";
					severity: "info" | "warning" | "critical";
					headline: string;
					suggestedIntent: string;
				}>;
			};

			return {
				ok: true as const,
				data: result,
				display: {
					kind: "text" as const,
					text:
						result.count === 0
							? `No anomalies over the ${result.rangeKey} window.`
							: `${result.count} anomal${result.count === 1 ? "y" : "ies"} detected over ${result.rangeKey}.`,
				},
			};
		}),
});
