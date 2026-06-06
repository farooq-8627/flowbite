/**
 * S12 — token report.
 *
 * Reads `aiToolEvents` rows over a sample window and aggregates input /
 * cached-input / output token averages, plus cache-hit ratio. The §2.2
 * target (3–6k effective input per turn with caching ON) is checked
 * against `summary.avgInputTokens` (raw, pre-cache).
 *
 * Pure aggregator (`aggregateTokenSamples`) is exported for unit tests;
 * the internalQuery (`getTokenReport`) is the operator-facing surface.
 */
import { v } from "convex/values";
import type { Doc, Id } from "../../_generated/dataModel";
import { internalQuery, type QueryCtx } from "../../_generated/server";

// ─── Types ──────────────────────────────────────────────────────────────────

/** One sampled row's token shape — only the fields the aggregator needs. */
export type TokenSample = {
	inputTokens: number;
	cachedInputTokens: number;
	outputTokens: number;
};

/** Aggregated rollup over the sample window. */
export type TokenReport = {
	windowMs: number;
	windowStart: number;
	windowEnd: number;
	sampleCount: number;
	totals: {
		inputTokens: number;
		cachedInputTokens: number;
		outputTokens: number;
	};
	averages: {
		avgInputTokens: number;
		avgCachedInputTokens: number;
		avgOutputTokens: number;
	};
	/** cached / (input + cached) — between 0 and 1; 0 when no samples have cached tokens. */
	cacheHitRatio: number;
	target: {
		/** §2.2 floor + ceiling for effective billed input (3–6k). */
		minInputTokens: number;
		maxInputTokens: number;
		/** Whether the average input is inside the §2.2 band. */
		withinTarget: boolean;
	};
};

// ─── Aggregator ─────────────────────────────────────────────────────────────

/** §2.2 target band — effective billed input per turn with caching on. */
export const TOKEN_TARGET_MIN = 3000;
export const TOKEN_TARGET_MAX = 6000;

/**
 * Pure aggregator. `samples` may be empty — the report still returns a
 * valid shape with zeros and `withinTarget:false`. Caller-supplied window
 * bounds are echoed back so the report carries its own provenance.
 */
export function aggregateTokenSamples(
	samples: TokenSample[],
	bounds: { windowStart: number; windowEnd: number },
): TokenReport {
	const totals = { inputTokens: 0, cachedInputTokens: 0, outputTokens: 0 };
	for (const s of samples) {
		totals.inputTokens += s.inputTokens;
		totals.cachedInputTokens += s.cachedInputTokens;
		totals.outputTokens += s.outputTokens;
	}
	const n = samples.length;
	const avgInputTokens = n === 0 ? 0 : Math.round(totals.inputTokens / n);
	const avgCachedInputTokens = n === 0 ? 0 : Math.round(totals.cachedInputTokens / n);
	const avgOutputTokens = n === 0 ? 0 : Math.round(totals.outputTokens / n);
	const cacheHitDenom = totals.inputTokens + totals.cachedInputTokens;
	const cacheHitRatio = cacheHitDenom === 0 ? 0 : totals.cachedInputTokens / cacheHitDenom;

	return {
		windowMs: Math.max(0, bounds.windowEnd - bounds.windowStart),
		windowStart: bounds.windowStart,
		windowEnd: bounds.windowEnd,
		sampleCount: n,
		totals,
		averages: { avgInputTokens, avgCachedInputTokens, avgOutputTokens },
		cacheHitRatio,
		target: {
			minInputTokens: TOKEN_TARGET_MIN,
			maxInputTokens: TOKEN_TARGET_MAX,
			withinTarget:
				n > 0 && avgInputTokens >= TOKEN_TARGET_MIN && avgInputTokens <= TOKEN_TARGET_MAX,
		},
	};
}

/** Pull the three token fields off one row, treating undefined as 0. */
export function tokenSampleFromRow(row: Doc<"aiToolEvents">): TokenSample {
	return {
		inputTokens: row.inputTokens ?? 0,
		cachedInputTokens: row.cachedInputTokens ?? 0,
		outputTokens: row.outputTokens ?? 0,
	};
}

// ─── Query helpers ─────────────────────────────────────────────────────────

const DEFAULT_WINDOW_DAYS = 7;
const DEFAULT_TAKE = 1000;

async function readReport(
	ctx: QueryCtx,
	args: { orgId?: Id<"orgs">; windowDays?: number },
): Promise<TokenReport> {
	const windowDays = args.windowDays ?? DEFAULT_WINDOW_DAYS;
	const windowEnd = Date.now();
	const windowStart = windowEnd - windowDays * 24 * 60 * 60 * 1000;

	const query = args.orgId
		? ctx.db
				.query("aiToolEvents")
				.withIndex("by_org_and_started", (q) =>
					q.eq("orgId", args.orgId as Id<"orgs">).gte("startedAt", windowStart),
				)
		: ctx.db.query("aiToolEvents");

	// Only rows with at least one token field set are useful samples; the
	// autonomous-turn marker rows + standing-order rows that lack tokens
	// would skew the averages toward zero.
	const rows = await query.order("desc").take(DEFAULT_TAKE);
	const samples: TokenSample[] = [];
	for (const row of rows) {
		if (args.orgId === undefined && row.startedAt < windowStart) continue;
		if (row.inputTokens === undefined && row.outputTokens === undefined) continue;
		samples.push(tokenSampleFromRow(row));
	}
	return aggregateTokenSamples(samples, { windowStart, windowEnd });
}

/**
 * Internal query — returns the aggregated token report. `orgId` narrows the
 * sample to one workspace; omit to scan platform-wide. `windowDays` defaults
 * to 7 (last week).
 */
export const getTokenReport = internalQuery({
	args: {
		orgId: v.optional(v.id("orgs")),
		windowDays: v.optional(v.number()),
	},
	handler: async (ctx, args) => readReport(ctx, args),
});
