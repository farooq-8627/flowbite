/**
 * convex/crm/entities/deals/pipelineForecast.ts
 *
 * Stage 2 of /DASHBOARD-V2-PLAN.md (2026-05-29) — feeds the new
 * `<SalesPipelinePanel>`'s Forecast tab. Pure deterministic rollup; no
 * LLM. Inspired by Coefficient / HubSpot's weighted-pipeline template:
 * https://coefficient.io/dashboard-examples/weighted-pipeline-hubspot
 *
 * What this file owns
 * ───────────────────
 * 1. **Win-probability derivation.** Pipeline stages don't carry an
 *    explicit `winProbability` (no schema field). We derive one from
 *    `finalType` + sorted order so the forecast bucket maths can run
 *    today on any pipeline, without a migration that asks every org
 *    owner to fill in numbers.
 * 2. **Forecast category routing.** HubSpot's three buckets — Commit
 *    (≥75% probability), Best Case (50–74%), Pipeline (<50%) — codified
 *    here so every consumer (this query, the panel, future AI tools)
 *    reads the same constants.
 * 3. **Aggregation.** `computeForecastFromDeals` walks an OPEN-deal set
 *    + last-90-days won/lost log + a 12-week cumulative-won sparkline
 *    and returns a per-pipeline envelope ready for paint.
 * 4. **Public + AI twins.** `getPipelineForecast` (orgQuery) +
 *    `getPipelineForecastForAI` (internalQuery) — same `*Impl`
 *    helper, locked-in by AGENTS.md "AI tools call *ForAI internal
 *    twins" non-negotiable.
 *
 * Why a 90-day won/lost window: matches `activityLogs.archiveOld`
 * retention + the existing `pipelineVelocity` Velocity-tab rollup, so
 * the user sees consistent windows across the panel's three tabs.
 *
 * Why a 12-week sparkline: long enough to surface a quarterly trend,
 * short enough to read in 16-px-wide cells. Each bucket = 7 days.
 */

import { v } from "convex/values";
import {
	orgQuery,
	requireOrgMember,
	requireOrgMemberByIds,
} from "../../../_functions/authenticated";
import type { Doc, Id } from "../../../_generated/dataModel";
import { internalQuery, type QueryCtx } from "../../../_generated/server";

// ─── Constants ──────────────────────────────────────────────────────────

const ONE_DAY_MS = 24 * 60 * 60 * 1000;
const WINDOW_DAYS = 90;
const WINDOW_MS = WINDOW_DAYS * ONE_DAY_MS;
const SPARKLINE_WEEKS = 12;
const ONE_WEEK_MS = 7 * ONE_DAY_MS;

/**
 * HubSpot weighted-pipeline default thresholds. Locked by
 * DASHBOARD-V2-PLAN.md §5 decision #3 (2026-05-28). Per-template
 * override (Stage 4) will land later under
 * `dashboardLayout.forecast.thresholds` — until then every org reads
 * these constants.
 */
export const FORECAST_THRESHOLDS = {
	/** Probability ≥ this → Commit bucket. */
	commit: 75,
	/** Probability ≥ this → Best Case bucket (when below `commit`). */
	bestCase: 50,
} as const;

/**
 * Default coverage-ratio bands. `coverageRatio = openValue / wonValue`
 * across the trailing 90 days. <warning ⇒ red, <healthy ⇒ amber,
 * ≥healthy ⇒ green. Per-template override is Stage 4 scope.
 */
export const DEFAULT_COVERAGE_BANDS = {
	healthy: 3,
	warning: 2,
} as const;

export type ForecastCategory = "commit" | "bestCase" | "pipeline";

// ─── Pure helpers (testable in isolation) ───────────────────────────────

type StageInput = {
	id: string;
	order: number;
	isFinal?: boolean;
	finalType?: "positive" | "negative" | "neutral";
	isDefaultStage?: boolean;
};

/**
 * Probability that an OPEN deal in this stage will close-won. Pure
 * function — no DB access.
 *
 * - Final positive ⇒ 100 (even though final stages don't sit in the
 *   open set, callers may pass them in by accident; the answer is
 *   defined.)
 * - Final negative ⇒ 0.
 * - Final neutral ⇒ 50 (HubSpot treats "no decision" parity).
 * - The pipeline's Default stage ⇒ 0 — this is the entry slot, no
 *   commitment yet.
 * - Every other non-default non-final stage ⇒ linear ramp computed
 *   from sorted-order index `i` over `N` peers:
 *      `prob = round((i + 1) / (N + 1) * 100)`
 *
 *   With 4 non-default-non-final stages: 20 / 40 / 60 / 80.
 *   With 3 stages: 25 / 50 / 75.
 *
 * The `+1` denominator floors the first stage above 0 and ceilings the
 * last stage below 100 — both endpoints already belong to Default and
 * Final-positive respectively, so non-final stages should never
 * collide with them.
 */
export function derivedWinProbability(stage: StageInput, allStages: readonly StageInput[]): number {
	if (stage.isFinal === true) {
		if (stage.finalType === "positive") return 100;
		if (stage.finalType === "negative") return 0;
		return 50;
	}
	if (stage.isDefaultStage === true) return 0;

	const ladder = allStages
		.filter((s) => s.isFinal !== true && s.isDefaultStage !== true)
		.sort((a, b) => a.order - b.order);
	const idx = ladder.findIndex((s) => s.id === stage.id);
	if (idx === -1) return 0;
	return Math.round(((idx + 1) / (ladder.length + 1)) * 100);
}

/**
 * Route a probability to its HubSpot bucket. Pure.
 */
export function forecastCategory(prob: number): ForecastCategory {
	if (prob >= FORECAST_THRESHOLDS.commit) return "commit";
	if (prob >= FORECAST_THRESHOLDS.bestCase) return "bestCase";
	return "pipeline";
}

/**
 * Build the 12-week cumulative-won sparkline buckets. Pure.
 *
 * Returns an array of length `SPARKLINE_WEEKS` ordered oldest→newest
 * with `{ t, value }`. `t` is the bucket-end timestamp (ms);
 * `value` is the sum of `wonValue` for deals whose `wonAt` falls in
 * that 7-day window.
 *
 * Empty buckets render as 0 — the chart consumer is responsible for
 * deciding whether to draw a flat line or a baseline tick.
 */
export function buildWeeklyWonSparkline(
	wonAtValuePairs: ReadonlyArray<{ wonAt: number; value: number }>,
	now: number,
): Array<{ t: number; value: number }> {
	const buckets: Array<{ t: number; value: number }> = [];
	for (let i = SPARKLINE_WEEKS - 1; i >= 0; i--) {
		const end = now - i * ONE_WEEK_MS;
		buckets.push({ t: end, value: 0 });
	}
	for (const pair of wonAtValuePairs) {
		// Map wonAt → bucket index. Floor((now - wonAt) / week)
		const ageWeeks = Math.floor((now - pair.wonAt) / ONE_WEEK_MS);
		if (ageWeeks < 0 || ageWeeks >= SPARKLINE_WEEKS) continue;
		const bucketIdx = SPARKLINE_WEEKS - 1 - ageWeeks;
		buckets[bucketIdx].value += pair.value;
	}
	return buckets;
}

/**
 * Pure forecast builder. Given a pipeline definition + the org's deals
 * + a window, return the panel-ready forecast envelope.
 *
 * Exported for the unit tests — no DB access.
 */
export function computeForecastFromDeals(args: {
	pipeline: Doc<"pipelines">;
	deals: readonly Doc<"deals">[];
	now: number;
	currency: string;
	coverageBands?: { healthy: number; warning: number };
}): PipelineForecastResult {
	const { pipeline, deals, now, currency } = args;
	const coverageBands = args.coverageBands ?? DEFAULT_COVERAGE_BANDS;
	const windowStart = now - WINDOW_MS;

	const stagesById = new Map(pipeline.stages.map((s) => [s.id, s]));
	const stageInputs: StageInput[] = pipeline.stages;

	let openCount = 0;
	let openValue = 0;
	let weightedValue = 0;
	let commitCount = 0;
	let commitValue = 0;
	let bestCaseCount = 0;
	let bestCaseValue = 0;
	let pipelineBucketCount = 0;
	let pipelineBucketValue = 0;
	let wonCount = 0;
	let wonValue = 0;
	let lostCount = 0;
	let lostValue = 0;
	const wonInWindow: Array<{ wonAt: number; value: number }> = [];

	for (const d of deals) {
		if (d.deletedAt !== undefined) continue;
		if (d.pipelineId !== pipeline._id) continue;
		const value = typeof d.value === "number" && Number.isFinite(d.value) ? d.value : 0;

		// Won bucket
		if (d.wonAt !== undefined) {
			if (d.wonAt >= windowStart && d.wonAt <= now) {
				wonCount += 1;
				wonValue += value;
				wonInWindow.push({ wonAt: d.wonAt, value });
			}
			continue;
		}
		// Lost bucket
		if (d.lostAt !== undefined) {
			if (d.lostAt >= windowStart && d.lostAt <= now) {
				lostCount += 1;
				lostValue += value;
			}
			continue;
		}
		// Open bucket — route to forecast category
		const stage = stagesById.get(d.currentStageId);
		if (!stage) continue;
		const prob = derivedWinProbability(stage, stageInputs);
		const cat = forecastCategory(prob);

		openCount += 1;
		openValue += value;
		weightedValue += (value * prob) / 100;

		if (cat === "commit") {
			commitCount += 1;
			commitValue += value;
		} else if (cat === "bestCase") {
			bestCaseCount += 1;
			bestCaseValue += value;
		} else {
			pipelineBucketCount += 1;
			pipelineBucketValue += value;
		}
	}

	const sparkline12w = buildWeeklyWonSparkline(wonInWindow, now);

	// Coverage ratio: openValue ÷ wonValue (last 90d). When wonValue = 0
	// the ratio is undefined; surface 0 so the dial paints "red" rather
	// than NaN. Consumer sees `wonValue: 0` alongside and can choose its
	// own copy.
	const coverageRatio = wonValue > 0 ? openValue / wonValue : 0;

	return {
		pipelineId: pipeline._id,
		pipelineName: pipeline.name,
		isDefault: pipeline.isDefault === true,
		openCount,
		openValue: roundCurrency(openValue),
		weightedValue: roundCurrency(weightedValue),
		commitCount,
		commitValue: roundCurrency(commitValue),
		bestCaseCount,
		bestCaseValue: roundCurrency(bestCaseValue),
		pipelineBucketCount,
		pipelineBucketValue: roundCurrency(pipelineBucketValue),
		wonCount,
		wonValue: roundCurrency(wonValue),
		lostCount,
		lostValue: roundCurrency(lostValue),
		coverageRatio: Math.round(coverageRatio * 10) / 10,
		coverageBands,
		sparkline12w,
		windowStartedAt: windowStart,
		windowEndedAt: now,
		currency,
	};
}

function roundCurrency(n: number): number {
	// Currency display only ever shows whole units; rounding here
	// avoids floating-point noise in the JSON envelope.
	return Math.round(n);
}

// ─── Result types ───────────────────────────────────────────────────────

export type PipelineForecastResult = {
	pipelineId: Id<"pipelines">;
	pipelineName: string;
	isDefault: boolean;
	openCount: number;
	openValue: number;
	weightedValue: number;
	commitCount: number;
	commitValue: number;
	bestCaseCount: number;
	bestCaseValue: number;
	pipelineBucketCount: number;
	pipelineBucketValue: number;
	wonCount: number;
	wonValue: number;
	lostCount: number;
	lostValue: number;
	coverageRatio: number;
	coverageBands: { healthy: number; warning: number };
	sparkline12w: Array<{ t: number; value: number }>;
	windowStartedAt: number;
	windowEndedAt: number;
	currency: string;
};

export type GetPipelineForecastResult = {
	pipelines: PipelineForecastResult[];
	generatedAt: number;
};

// ─── DB readers ─────────────────────────────────────────────────────────

async function readPipelineForecast(
	ctx: QueryCtx,
	args: { orgId: Id<"orgs"> },
): Promise<GetPipelineForecastResult> {
	const now = Date.now();
	const [org, pipelines, deals] = await Promise.all([
		ctx.db.get(args.orgId),
		ctx.db
			.query("pipelines")
			.withIndex("by_org", (q) => q.eq("orgId", args.orgId))
			.collect(),
		ctx.db
			.query("deals")
			.withIndex("by_org", (q) => q.eq("orgId", args.orgId))
			.collect(),
	]);

	const currency = org?.settings?.defaultCurrency ?? "USD";

	const out: PipelineForecastResult[] = [];
	for (const p of pipelines) {
		if (p.entityType !== "deal") continue;
		out.push(
			computeForecastFromDeals({
				pipeline: p,
				deals,
				now,
				currency,
			}),
		);
	}

	// Default pipeline first; alphabetical thereafter so the panel is
	// stable across renders.
	out.sort((a, b) => {
		if (a.isDefault !== b.isDefault) return a.isDefault ? -1 : 1;
		return a.pipelineName.localeCompare(b.pipelineName);
	});

	return { pipelines: out, generatedAt: now };
}

// ─── Public + ForAI ─────────────────────────────────────────────────────

export const getPipelineForecast = orgQuery({
	args: { orgId: v.id("orgs") },
	handler: async (ctx, args) => {
		const { member } = await requireOrgMember(ctx, args.orgId);
		// Same gate as `getOrgPipelineVelocity` — viewer can see the
		// forecast as long as they can read deals. Hide otherwise.
		if (!member.permissions.includes("deals.view")) {
			return { pipelines: [], generatedAt: Date.now() };
		}
		return readPipelineForecast(ctx, args);
	},
});

/** AI-callable internal twin — see `convex/ai/tools/_shared.ts`. */
export const getPipelineForecastForAI = internalQuery({
	args: { orgId: v.id("orgs"), userId: v.id("users") },
	handler: async (ctx, args) => {
		const { member } = await requireOrgMemberByIds(ctx, args.orgId, args.userId);
		if (!member.permissions.includes("deals.view")) {
			return { pipelines: [], generatedAt: Date.now() };
		}
		return readPipelineForecast(ctx, { orgId: args.orgId });
	},
});

export const __test = {
	derivedWinProbability,
	forecastCategory,
	buildWeeklyWonSparkline,
	computeForecastFromDeals,
	FORECAST_THRESHOLDS,
	DEFAULT_COVERAGE_BANDS,
	WINDOW_MS,
	SPARKLINE_WEEKS,
	ONE_WEEK_MS,
};
