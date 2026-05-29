/// <reference types="vite/client" />
/**
 * Tests for Stage 2 of /DASHBOARD-V2-PLAN.md — pipeline forecast helpers.
 *
 * Pure-function coverage (no DB) for:
 *   1. `derivedWinProbability` — final / default / linear-ramp branches.
 *   2. `forecastCategory` — HubSpot threshold routing (≥75 / 50–74 / <50).
 *   3. `buildWeeklyWonSparkline` — 12 ordered buckets, in-window only.
 *   4. `computeForecastFromDeals` — happy path with mixed open / won / lost
 *      deals + currency formatting + coverage-ratio math.
 *
 * No convex-test harness needed — every export under
 * `pipelineForecast.__test` is a pure function. Vitest runs them
 * in isolation.
 */

import { describe, expect, it } from "vitest";
import type { Doc } from "./_generated/dataModel";
import { __test } from "./crm/entities/deals/pipelineForecast";

const {
	derivedWinProbability,
	forecastCategory,
	buildWeeklyWonSparkline,
	computeForecastFromDeals,
	FORECAST_THRESHOLDS,
	DEFAULT_COVERAGE_BANDS,
	WINDOW_MS,
	ONE_WEEK_MS,
	SPARKLINE_WEEKS,
} = __test;

// ─── derivedWinProbability ──────────────────────────────────────────────

describe("derivedWinProbability", () => {
	const stages = [
		{ id: "s0", order: 0, isDefaultStage: true },
		{ id: "s1", order: 1 },
		{ id: "s2", order: 2 },
		{ id: "s3", order: 3 },
		{ id: "s4", order: 4 },
		{ id: "won", order: 99, isFinal: true, finalType: "positive" as const },
		{ id: "lost", order: 100, isFinal: true, finalType: "negative" as const },
		{ id: "neutral", order: 101, isFinal: true, finalType: "neutral" as const },
	];

	it("default stage is always 0", () => {
		expect(derivedWinProbability(stages[0], stages)).toBe(0);
	});

	it("final positive is 100", () => {
		expect(derivedWinProbability(stages[5], stages)).toBe(100);
	});

	it("final negative is 0", () => {
		expect(derivedWinProbability(stages[6], stages)).toBe(0);
	});

	it("final neutral is 50", () => {
		expect(derivedWinProbability(stages[7], stages)).toBe(50);
	});

	it("ramps linearly with 4 non-default-non-final stages: 20/40/60/80", () => {
		expect(derivedWinProbability(stages[1], stages)).toBe(20);
		expect(derivedWinProbability(stages[2], stages)).toBe(40);
		expect(derivedWinProbability(stages[3], stages)).toBe(60);
		expect(derivedWinProbability(stages[4], stages)).toBe(80);
	});

	it("ramps linearly with 3 non-default-non-final stages: 25/50/75", () => {
		const small = [
			{ id: "d", order: 0, isDefaultStage: true },
			{ id: "a", order: 1 },
			{ id: "b", order: 2 },
			{ id: "c", order: 3 },
			{ id: "won", order: 9, isFinal: true, finalType: "positive" as const },
		];
		expect(derivedWinProbability(small[1], small)).toBe(25);
		expect(derivedWinProbability(small[2], small)).toBe(50);
		expect(derivedWinProbability(small[3], small)).toBe(75);
	});

	it("falls back to 0 when stage is unknown to ladder", () => {
		const orphan = { id: "orphan", order: 5 };
		expect(derivedWinProbability(orphan, stages)).toBe(0);
	});
});

// ─── forecastCategory ───────────────────────────────────────────────────

describe("forecastCategory", () => {
	it("≥75 routes to commit (HubSpot default)", () => {
		expect(forecastCategory(75)).toBe("commit");
		expect(forecastCategory(99)).toBe("commit");
		expect(forecastCategory(100)).toBe("commit");
	});
	it("50–74 routes to bestCase", () => {
		expect(forecastCategory(50)).toBe("bestCase");
		expect(forecastCategory(60)).toBe("bestCase");
		expect(forecastCategory(74)).toBe("bestCase");
	});
	it("<50 routes to pipeline", () => {
		expect(forecastCategory(0)).toBe("pipeline");
		expect(forecastCategory(25)).toBe("pipeline");
		expect(forecastCategory(49)).toBe("pipeline");
	});
	it("threshold constants are the locked HubSpot defaults", () => {
		expect(FORECAST_THRESHOLDS.commit).toBe(75);
		expect(FORECAST_THRESHOLDS.bestCase).toBe(50);
	});
});

// ─── buildWeeklyWonSparkline ────────────────────────────────────────────

describe("buildWeeklyWonSparkline", () => {
	it("returns 12 ordered buckets even on empty input", () => {
		const now = Date.now();
		const buckets = buildWeeklyWonSparkline([], now);
		expect(buckets).toHaveLength(SPARKLINE_WEEKS);
		expect(buckets.every((b) => b.value === 0)).toBe(true);
		// Oldest bucket first; newest = now
		expect(buckets[0].t).toBeLessThan(buckets[SPARKLINE_WEEKS - 1].t);
		expect(buckets[SPARKLINE_WEEKS - 1].t).toBe(now);
	});

	it("places a recent won deal in the latest bucket", () => {
		const now = Date.now();
		const buckets = buildWeeklyWonSparkline([{ wonAt: now - 1000, value: 500 }], now);
		expect(buckets[SPARKLINE_WEEKS - 1].value).toBe(500);
		expect(buckets.slice(0, -1).every((b) => b.value === 0)).toBe(true);
	});

	it("ignores deals beyond the 12-week window", () => {
		const now = Date.now();
		const stale = now - 13 * ONE_WEEK_MS;
		const buckets = buildWeeklyWonSparkline([{ wonAt: stale, value: 9999 }], now);
		expect(buckets.every((b) => b.value === 0)).toBe(true);
	});

	it("places a 4-week-old deal in the correct bucket", () => {
		const now = Date.now();
		const fourWeeksAgo = now - 4 * ONE_WEEK_MS + 1000; // tiny safety margin
		const buckets = buildWeeklyWonSparkline([{ wonAt: fourWeeksAgo, value: 1000 }], now);
		// Age = 3 weeks (floor((4w-1s)/1w) = 3) → bucketIdx = 12-1-3 = 8
		expect(buckets[8].value).toBe(1000);
	});

	it("aggregates multiple deals in the same bucket", () => {
		const now = Date.now();
		const buckets = buildWeeklyWonSparkline(
			[
				{ wonAt: now - 1000, value: 100 },
				{ wonAt: now - 2000, value: 250 },
			],
			now,
		);
		expect(buckets[SPARKLINE_WEEKS - 1].value).toBe(350);
	});
});

// ─── computeForecastFromDeals ───────────────────────────────────────────

describe("computeForecastFromDeals", () => {
	const now = Date.now();
	const pipeline = {
		_id: "pip-1",
		_creationTime: now,
		orgId: "org-1",
		name: "Sales Pipeline",
		entityType: "deal",
		isDefault: true,
		stages: [
			{ id: "default", name: "Default", code: "DEF", order: 0, isDefaultStage: true },
			{ id: "qualified", name: "Qualified", code: "QUAL", order: 1 },
			{ id: "demo", name: "Demo", code: "DEMO", order: 2 },
			{ id: "negotiation", name: "Negotiation", code: "NEGO", order: 3 },
			{
				id: "won",
				name: "Won",
				code: "WON",
				order: 4,
				isFinal: true,
				finalType: "positive" as const,
			},
			{
				id: "lost",
				name: "Lost",
				code: "LOST",
				order: 5,
				isFinal: true,
				finalType: "negative" as const,
			},
		],
		createdAt: now,
		updatedAt: now,
	} as unknown as Doc<"pipelines">;

	function makeDeal(
		id: string,
		args: {
			value: number;
			currentStageId: string;
			wonAt?: number;
			lostAt?: number;
			deletedAt?: number;
		},
	): Doc<"deals"> {
		return {
			_id: id,
			_creationTime: now,
			orgId: "org-1",
			dealCode: `D-${id}`,
			title: `Deal ${id}`,
			pipelineId: pipeline._id,
			currentStageId: args.currentStageId,
			stageEnteredAt: now,
			value: args.value,
			currency: "USD",
			source: "manual",
			wonAt: args.wonAt,
			lostAt: args.lostAt,
			deletedAt: args.deletedAt,
			createdAt: now,
			updatedAt: now,
		} as unknown as Doc<"deals">;
	}

	it("buckets open deals into commit / bestCase / pipeline by derived probability", () => {
		// 3 non-default-non-final stages → 25 / 50 / 75
		const deals = [
			makeDeal("a", { value: 1000, currentStageId: "qualified" }), // 25 → pipeline
			makeDeal("b", { value: 2000, currentStageId: "demo" }), // 50 → bestCase
			makeDeal("c", { value: 3000, currentStageId: "negotiation" }), // 75 → commit
		];
		const out = computeForecastFromDeals({ pipeline, deals, now, currency: "USD" });

		expect(out.openCount).toBe(3);
		expect(out.openValue).toBe(6000);
		// weighted = 1000*0.25 + 2000*0.5 + 3000*0.75 = 250 + 1000 + 2250 = 3500
		expect(out.weightedValue).toBe(3500);
		expect(out.commitCount).toBe(1);
		expect(out.commitValue).toBe(3000);
		expect(out.bestCaseCount).toBe(1);
		expect(out.bestCaseValue).toBe(2000);
		expect(out.pipelineBucketCount).toBe(1);
		expect(out.pipelineBucketValue).toBe(1000);
	});

	it("counts won + lost only inside the 90-day window", () => {
		const recentWon = now - 5 * 24 * 60 * 60 * 1000;
		const oldWon = now - 100 * 24 * 60 * 60 * 1000;
		const deals = [
			makeDeal("w1", { value: 500, currentStageId: "won", wonAt: recentWon }),
			makeDeal("w2", { value: 9999, currentStageId: "won", wonAt: oldWon }),
			makeDeal("l1", { value: 100, currentStageId: "lost", lostAt: recentWon }),
		];
		const out = computeForecastFromDeals({ pipeline, deals, now, currency: "USD" });

		expect(out.wonCount).toBe(1);
		expect(out.wonValue).toBe(500);
		expect(out.lostCount).toBe(1);
		expect(out.lostValue).toBe(100);
		// Sparkline should reflect the recent win (latest bucket = 500)
		expect(out.sparkline12w[SPARKLINE_WEEKS - 1].value).toBe(500);
	});

	it("ignores soft-deleted deals", () => {
		const deals = [makeDeal("a", { value: 1000, currentStageId: "qualified", deletedAt: now })];
		const out = computeForecastFromDeals({ pipeline, deals, now, currency: "USD" });
		expect(out.openCount).toBe(0);
		expect(out.openValue).toBe(0);
	});

	it("ignores deals with deletedAt and skips deals from another pipeline", () => {
		const otherPipelineDeal = {
			...makeDeal("x", { value: 999, currentStageId: "qualified" }),
			pipelineId: "different-pipe",
		} as unknown as Doc<"deals">;
		const out = computeForecastFromDeals({
			pipeline,
			deals: [otherPipelineDeal],
			now,
			currency: "USD",
		});
		expect(out.openCount).toBe(0);
	});

	it("coverage ratio = openValue / wonValue when wonValue > 0", () => {
		const recentWon = now - 5 * 24 * 60 * 60 * 1000;
		const deals = [
			makeDeal("a", { value: 6000, currentStageId: "demo" }),
			makeDeal("w", { value: 2000, currentStageId: "won", wonAt: recentWon }),
		];
		const out = computeForecastFromDeals({ pipeline, deals, now, currency: "USD" });
		expect(out.coverageRatio).toBe(3); // 6000 / 2000
		expect(out.coverageBands).toEqual(DEFAULT_COVERAGE_BANDS);
	});

	it("coverage ratio = 0 when no wins (avoids NaN/Infinity)", () => {
		const deals = [makeDeal("a", { value: 6000, currentStageId: "demo" })];
		const out = computeForecastFromDeals({ pipeline, deals, now, currency: "USD" });
		expect(out.coverageRatio).toBe(0);
	});

	it("honours per-pipeline coverageBands override", () => {
		const out = computeForecastFromDeals({
			pipeline,
			deals: [],
			now,
			currency: "AED",
			coverageBands: { healthy: 5, warning: 3 },
		});
		expect(out.coverageBands).toEqual({ healthy: 5, warning: 3 });
		expect(out.currency).toBe("AED");
	});

	it("window is exactly WINDOW_MS long", () => {
		const out = computeForecastFromDeals({ pipeline, deals: [], now, currency: "USD" });
		expect(out.windowEndedAt - out.windowStartedAt).toBe(WINDOW_MS);
	});
});
