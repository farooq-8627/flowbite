/**
 * convex/ai/queries/telemetry.ts
 *
 * Public read API for the AI Usage dashboard + the BillingGroup
 * "Plan limits" section. One query — `getOrgUsage` — drives both
 * surfaces so the numbers always agree.
 *
 * Aggregates from `aiToolEvents` over a configurable time range
 * (7d / 30d / 90d). Results include:
 *   - Calendar-month totals (used for the plan-limit gauge)
 *   - Range totals (calls, cost, tokens, error rate)
 *   - Per-tool top-N breakdown
 *   - Per-model breakdown (provider + model + cost)
 *   - Daily timeseries for the sparkline
 *
 * Indexed reads only — no full-table scans. The `by_org_and_started`
 * index narrows to events for this org since the range start.
 */

import { v } from "convex/values";
import { orgQuery } from "../../_functions/authenticated";
import { getPlanLimits, type PlanTier } from "../../_platform/limits";
import { startOfMonth } from "../telemetry";

const RANGE_MS: Record<"7d" | "30d" | "90d", number> = {
	"7d": 7 * 24 * 60 * 60 * 1000,
	"30d": 30 * 24 * 60 * 60 * 1000,
	"90d": 90 * 24 * 60 * 60 * 1000,
};

const ONE_DAY_MS = 24 * 60 * 60 * 1000;

/** Reserved synthetic-event toolName written once per chat turn. */
const TURN_TOOL_NAME = "_chat_turn";

export const getOrgUsage = orgQuery({
	args: {
		orgId: v.id("orgs"),
		range: v.optional(v.union(v.literal("7d"), v.literal("30d"), v.literal("90d"))),
	},
	handler: async (ctx, args) => {
		const range = args.range ?? "30d";
		const now = Date.now();
		const rangeStart = now - RANGE_MS[range];
		const monthStart = startOfMonth(now);

		const org = await ctx.db.get(args.orgId);
		const plan: PlanTier = ((org?.plan as PlanTier | undefined) ?? "free") as PlanTier;
		const limits = getPlanLimits(plan);

		// Pull the range. We also need month-to-date totals; compute
		// those from the same array if `monthStart >= rangeStart`,
		// otherwise issue a separate (smaller) read.
		const rangeEvents = await ctx.db
			.query("aiToolEvents")
			.withIndex("by_org_and_started", (q) =>
				q.eq("orgId", args.orgId).gte("startedAt", rangeStart),
			)
			.collect();

		// Accumulators.
		let totalCalls = 0;
		let toolCalls = 0;
		let errorCount = 0;
		let totalCostUsd = 0;
		let inputTokens = 0;
		let outputTokens = 0;

		const byTool = new Map<
			string,
			{ calls: number; errors: number; costUsd: number; durationMs: number }
		>();
		const byModel = new Map<
			string,
			{ provider: string; calls: number; tokens: number; costUsd: number }
		>();
		const dailyMap = new Map<string, { tokens: number; calls: number; costUsd: number }>();

		// Month-to-date totals (used for plan gauge).
		let mtdInputTokens = 0;
		let mtdOutputTokens = 0;
		let mtdCalls = 0;
		let mtdCostUsd = 0;

		for (const e of rangeEvents) {
			const isTurn = e.toolName === TURN_TOOL_NAME;
			const cost = e.costUsd ?? 0;
			totalCostUsd += cost;
			totalCalls += 1;
			if (!isTurn) toolCalls += 1;
			if (!e.ok) errorCount += 1;
			inputTokens += e.inputTokens ?? 0;
			outputTokens += e.outputTokens ?? 0;

			// Per-tool — exclude the synthetic _chat_turn rows.
			if (!isTurn) {
				const t = byTool.get(e.toolName) ?? {
					calls: 0,
					errors: 0,
					costUsd: 0,
					durationMs: 0,
				};
				t.calls += 1;
				if (!e.ok) t.errors += 1;
				t.costUsd += cost;
				t.durationMs += e.durationMs ?? 0;
				byTool.set(e.toolName, t);
			}

			// Per-model — only events that carry token counts (i.e. _chat_turn).
			if (e.model && (e.inputTokens || e.outputTokens)) {
				const m = byModel.get(e.model) ?? {
					provider: e.provider ?? "unknown",
					calls: 0,
					tokens: 0,
					costUsd: 0,
				};
				m.calls += 1;
				m.tokens += (e.inputTokens ?? 0) + (e.outputTokens ?? 0);
				m.costUsd += cost;
				byModel.set(e.model, m);
			}

			// Daily bucket (UTC midnight).
			const dayKey = formatDayKey(e.startedAt);
			const d = dailyMap.get(dayKey) ?? { tokens: 0, calls: 0, costUsd: 0 };
			d.calls += 1;
			d.tokens += (e.inputTokens ?? 0) + (e.outputTokens ?? 0);
			d.costUsd += cost;
			dailyMap.set(dayKey, d);

			if (e.startedAt >= monthStart) {
				mtdInputTokens += e.inputTokens ?? 0;
				mtdOutputTokens += e.outputTokens ?? 0;
				mtdCalls += 1;
				mtdCostUsd += cost;
			}
		}

		// If the requested range starts after the month start, we need
		// a second read for the wider month window. The 7d range case.
		if (monthStart < rangeStart) {
			const monthOnly = await ctx.db
				.query("aiToolEvents")
				.withIndex("by_org_and_started", (q) =>
					q.eq("orgId", args.orgId).gte("startedAt", monthStart),
				)
				.collect();
			mtdInputTokens = 0;
			mtdOutputTokens = 0;
			mtdCalls = 0;
			mtdCostUsd = 0;
			for (const e of monthOnly) {
				mtdInputTokens += e.inputTokens ?? 0;
				mtdOutputTokens += e.outputTokens ?? 0;
				mtdCalls += 1;
				mtdCostUsd += e.costUsd ?? 0;
			}
		}

		// Fill gaps in the daily series so the sparkline is continuous.
		const daily = buildDailySeries(rangeStart, now, dailyMap);

		const topTools = [...byTool.entries()]
			.map(([name, t]) => ({
				name,
				calls: t.calls,
				errors: t.errors,
				avgDurationMs: t.calls > 0 ? Math.round(t.durationMs / t.calls) : 0,
				costUsd: round2(t.costUsd),
			}))
			.sort((a, b) => b.calls - a.calls)
			.slice(0, 10);

		const topModels = [...byModel.entries()]
			.map(([model, m]) => ({
				model,
				provider: m.provider,
				calls: m.calls,
				tokens: m.tokens,
				costUsd: round2(m.costUsd),
			}))
			.sort((a, b) => b.tokens - a.tokens);

		const totalTokensThisMonth = mtdInputTokens + mtdOutputTokens;

		return {
			plan,
			limit: limits.aiTokensPerMonth,
			usedThisMonth: {
				inputTokens: mtdInputTokens,
				outputTokens: mtdOutputTokens,
				totalTokens: totalTokensThisMonth,
				calls: mtdCalls,
				costUsd: round2(mtdCostUsd),
			},
			range: {
				key: range,
				startedAt: rangeStart,
				endedAt: now,
				totalCalls,
				toolCalls,
				errorCount,
				errorRate: totalCalls > 0 ? errorCount / totalCalls : 0,
				totalCostUsd: round2(totalCostUsd),
				inputTokens,
				outputTokens,
				totalTokens: inputTokens + outputTokens,
			},
			topTools,
			topModels,
			daily,
		};
	},
});

function round2(n: number): number {
	return Math.round(n * 100) / 100;
}

/** YYYY-MM-DD UTC. */
function formatDayKey(ts: number): string {
	const d = new Date(ts);
	const y = d.getUTCFullYear();
	const m = String(d.getUTCMonth() + 1).padStart(2, "0");
	const dd = String(d.getUTCDate()).padStart(2, "0");
	return `${y}-${m}-${dd}`;
}

function buildDailySeries(
	rangeStart: number,
	now: number,
	dailyMap: Map<string, { tokens: number; calls: number; costUsd: number }>,
) {
	const series: Array<{ day: string; tokens: number; calls: number; costUsd: number }> = [];
	const startUtc = Date.UTC(
		new Date(rangeStart).getUTCFullYear(),
		new Date(rangeStart).getUTCMonth(),
		new Date(rangeStart).getUTCDate(),
	);
	for (let t = startUtc; t <= now; t += ONE_DAY_MS) {
		const key = formatDayKey(t);
		const v = dailyMap.get(key) ?? { tokens: 0, calls: 0, costUsd: 0 };
		series.push({ day: key, tokens: v.tokens, calls: v.calls, costUsd: round2(v.costUsd) });
	}
	return series;
}
