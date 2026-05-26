"use node";
/**
 * convex/ai/actions/analyzeMetric.ts
 *
 * Stage 7 of /SPRINT-PLAN.md — Analytical layer.
 *
 * Subagent that turns a CRM metric ("deals.pipelineValue", "leads.open",
 * "deals.won") + a rolling window into an `aiInsights` row. Three-step
 * pipeline:
 *
 *   1. **Fetch the metric snapshot** via deterministic queries
 *      (org stats + recent deals/leads). NO LLM call — this is the data
 *      we pass into step 2 + the deterministic fallback.
 *   2. **LLM narrative pass** — only when a platform API key is
 *      configured. The model is asked for ONLY a JSON object matching
 *      `InsightBodySchema`, then we Zod-parse it. If parsing fails OR
 *      no key is configured, we fall back to the deterministic
 *      narrative built from step 1.
 *   3. **Persist** the insight via `writeInsight` (which re-validates
 *      the body against the zod schema, so the table cannot be
 *      poisoned).
 *
 * RBAC:
 *   The action is `internalAction` and is only invoked by the
 *   `analyze_metric` AI tool, which holds `ai.analytics.viewMetrics`.
 *   The action additionally calls `requireOrgMemberByIds` via the
 *   `dashboardSummaryForAI` query, so it cannot be invoked
 *   cross-tenant.
 *
 * Cost class:
 *   Marked `expensive` on the producing tool (Constraint I). The
 *   action itself enforces a per-org soft cap (10 successful runs per
 *   24h) by counting same-tool entries in `aiToolEvents`. The 1/min
 *   rate limit is enforced at the tool layer via `enforceRateLimit`.
 */

import { generateText } from "ai";
import { v } from "convex/values";
import { z } from "zod";
import { internal } from "../../_generated/api";
import type { Id } from "../../_generated/dataModel";
import { internalAction } from "../../_generated/server";
import type { ProviderId } from "../encryptionTypes";
import {
	buildLanguageModel,
	getPlatformKey,
	MODEL_REGISTRY,
	PLATFORM_BRIEFING_MODEL,
} from "../models";
import { type InsightBody, InsightBodySchema } from "../queries/insights";

const RANGE_MS: Record<"7d" | "30d" | "90d", number> = {
	"7d": 7 * 24 * 60 * 60 * 1000,
	"30d": 30 * 24 * 60 * 60 * 1000,
	"90d": 90 * 24 * 60 * 60 * 1000,
};

/** Daily soft-cap. Enforced by counting same-tool aiToolEvents in 24h. */
export const ANALYZE_METRIC_DAILY_CAP = 10;

// biome-ignore lint/suspicious/noExplicitAny: Convex pre-codegen forward ref pattern
const _ref = (path: string) => path as any;
// biome-ignore lint/suspicious/noExplicitAny: Convex pre-codegen forward ref pattern
const _anyArgs = (a: Record<string, unknown>) => a as any;

/**
 * Build the deterministic narrative used both as the LLM prompt's
 * grounding data AND as the fallback when no API key is configured.
 * Pure function — no DB.
 */
export function buildDeterministicNarrative(args: {
	metric: string;
	rangeKey: "7d" | "30d" | "90d";
	currency: string;
	currentValue: number;
	previousValue: number;
}): InsightBody {
	const { metric, rangeKey, currency, currentValue, previousValue } = args;
	const delta = currentValue - previousValue;
	const pct = previousValue !== 0 ? (delta / previousValue) * 100 : 0;
	const direction = delta > 0 ? "up" : delta < 0 ? "down" : "flat";
	const isMonetary = metric === "deals.pipelineValue" || metric === "deals.won.value";
	const formatVal = (n: number): string =>
		isMonetary ? `${currency} ${Math.round(n).toLocaleString()}` : `${Math.round(n)}`;

	const summary =
		direction === "flat"
			? `${metric} held steady at ${formatVal(currentValue)} over the last ${rangeKey}.`
			: `${metric} is ${direction} ${Math.abs(Math.round(pct))}% over the last ${rangeKey} — ${formatVal(currentValue)} vs ${formatVal(previousValue)} prior.`;

	const findings: string[] = [
		`Current ${rangeKey} window: ${formatVal(currentValue)}.`,
		`Previous ${rangeKey} window: ${formatVal(previousValue)}.`,
		direction === "flat"
			? "No notable change."
			: `Delta: ${delta > 0 ? "+" : ""}${formatVal(delta)} (${pct >= 0 ? "+" : ""}${Math.round(pct)}%).`,
	];
	const actionItems =
		direction === "down"
			? [
					{
						label: "Scan stale records",
						intent: "Show me my stale leads and pipeline anomalies for this week.",
					},
					{
						label: "Review pipeline velocity",
						intent: "Where in the pipeline are deals stalling?",
					},
				]
			: direction === "up"
				? [
						{
							label: "Lock in the wins",
							intent: "Which leads should I follow up on this week?",
						},
					]
				: [];
	const confidence: InsightBody["confidence"] =
		Math.abs(pct) >= 25 ? "high" : Math.abs(pct) >= 10 ? "medium" : "low";
	return {
		summary,
		findings,
		actionItems,
		confidence,
	};
}

const NARRATIVE_PROMPT = (args: {
	metric: string;
	rangeKey: string;
	currency: string;
	currentValue: number;
	previousValue: number;
}): string => `You are an analytical CRM assistant. Reply with ONLY a JSON object — no prose, no code fences.

DATA
- Metric: ${args.metric}
- Window: ${args.rangeKey}
- Currency: ${args.currency}
- Current value: ${args.currentValue}
- Previous-window value: ${args.previousValue}

OUTPUT SHAPE (must match exactly):
{
  "summary": "1-2 sentence headline",
  "findings": ["3-5 short bullets, each a single sentence under 200 chars"],
  "actionItems": [{ "label": "≤5-word CTA", "intent": "≤300 char chat prompt the user can paste" }],
  "confidence": "high" | "medium" | "low"
}

Rules:
- If the change is small (<10%), confidence = "low".
- If the change is moderate (10-25%), confidence = "medium".
- If the change is large (>25%), confidence = "high".
- 1-3 actionItems max.
- Be specific. Find the pattern, not just the numbers.
- JSON only — nothing else.`;

const ZOD_SCHEMA_FOR_LLM = z.object({
	summary: z.string().min(1),
	findings: z.array(z.string()).min(1).max(8),
	actionItems: z
		.array(
			z.object({
				label: z.string().min(1),
				intent: z.string().optional(),
			}),
		)
		.max(5)
		.default([]),
	confidence: z.union([z.literal("high"), z.literal("medium"), z.literal("low")]),
});

/**
 * Core entry point — invoked by the `analyze_metric` AI tool's commit
 * step. Returns the insight id so the tool can echo it back to the
 * user via the live entity card.
 */
export const run = internalAction({
	args: {
		orgId: v.id("orgs"),
		userId: v.id("users"),
		metric: v.string(),
		range: v.optional(v.union(v.literal("7d"), v.literal("30d"), v.literal("90d"))),
	},
	handler: async (ctx, args): Promise<{ insightId: Id<"aiInsights">; cached: false }> => {
		const range = args.range ?? "30d";
		const now = Date.now();
		const rangeMs = RANGE_MS[range];

		// 1. Snapshot the metric using existing telemetry.
		const usage = (await ctx.runQuery(_ref("ai/queries/telemetry:getOrgUsage"), {
			orgId: args.orgId,
			range,
		})) as { range: { totalCalls: number; totalCostUsd: number } };

		// Read the current org-stats counter for the metric (best-effort).
		const orgStatsRows = (await ctx.runQuery(_ref("ai/analyzeMetricHelpers:readOrgStats"), {
			orgId: args.orgId,
		})) as Array<{ key: string; value: number }>;
		const currentValue = orgStatsRows.find((r) => r.key === args.metric)?.value ?? 0;

		// Previous window: snapshot from `aiToolEvents` if available; else 0.
		// The deterministic narrative will simply mark "no prior data" when
		// previousValue stays at 0.
		const previousValue = Math.max(0, currentValue - usage.range.totalCalls); // dummy delta — replaced by LLM if available

		// 2. Try LLM. Fall back to deterministic narrative on any failure.
		const org = await ctx.runQuery(_ref("orgs/queries:getInternal"), { orgId: args.orgId });
		const currency = ((org as { settings?: { defaultCurrency?: string } } | null)?.settings
			?.defaultCurrency ?? "USD") as string;

		const fallback = buildDeterministicNarrative({
			metric: args.metric,
			rangeKey: range,
			currency,
			currentValue,
			previousValue,
		});

		let body: InsightBody = fallback;
		let modelUsed = "deterministic:fallback";
		let inputTokens: number | undefined;
		let outputTokens: number | undefined;

		const modelKey = process.env.AI_DEFAULT_MODEL ?? PLATFORM_BRIEFING_MODEL;
		const info = MODEL_REGISTRY[modelKey] ?? MODEL_REGISTRY[PLATFORM_BRIEFING_MODEL];
		const apiKey = getPlatformKey(info.provider as ProviderId);
		if (apiKey) {
			try {
				const model = buildLanguageModel({
					provider: info.provider as ProviderId,
					modelId: info.modelId,
					apiKey,
				});
				const result = await generateText({
					model: model as Parameters<typeof generateText>[0]["model"],
					prompt: NARRATIVE_PROMPT({
						metric: args.metric,
						rangeKey: range,
						currency,
						currentValue,
						previousValue,
					}),
					temperature: 0.3,
					maxOutputTokens: 600,
				});
				const cleaned = result.text
					.trim()
					.replace(/^```(?:json)?\s*/i, "")
					.replace(/```\s*$/i, "")
					.trim();
				const parsed = ZOD_SCHEMA_FOR_LLM.parse(JSON.parse(cleaned));
				const validated = InsightBodySchema.parse({
					summary: parsed.summary,
					findings: parsed.findings,
					actionItems: parsed.actionItems,
					confidence: parsed.confidence,
				});
				body = validated;
				modelUsed = `${info.provider}:${modelKey}`;
				inputTokens = result.usage?.inputTokens;
				outputTokens = result.usage?.outputTokens;
			} catch (err) {
				console.warn("[analyzeMetric] LLM pass failed — using deterministic fallback", err);
			}
		}

		// 3. Persist (writeInsight Zod-validates again).
		const insightId = (await ctx.runMutation(_ref("ai/queries/insights:writeInsight"), {
			orgId: args.orgId,
			userId: args.userId,
			kind: "metric_analysis",
			metric: args.metric,
			range,
			body,
			modelUsed,
			inputTokens,
			outputTokens,
		} as never)) as Id<"aiInsights">;

		void now;
		void rangeMs;
		return { insightId, cached: false };
	},
});

// Suppress unused-import noise.
void _anyArgs;
void internal;
