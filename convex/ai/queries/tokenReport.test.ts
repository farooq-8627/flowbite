/**
 * tokenReport.ts — pure aggregator tests. The internalQuery wrapper just
 * scans the table + delegates to `aggregateTokenSamples`, so the
 * aggregator covers the §2.2 target check end-to-end.
 */
import { describe, expect, it } from "vitest";
import { aggregateTokenSamples, TOKEN_TARGET_MAX, TOKEN_TARGET_MIN } from "./tokenReport";

const BOUNDS = { windowStart: 1_000, windowEnd: 2_000 };

describe("aggregateTokenSamples", () => {
	it("returns zeros + withinTarget=false for an empty sample", () => {
		const r = aggregateTokenSamples([], BOUNDS);
		expect(r.sampleCount).toBe(0);
		expect(r.totals).toEqual({ inputTokens: 0, cachedInputTokens: 0, outputTokens: 0 });
		expect(r.averages.avgInputTokens).toBe(0);
		expect(r.cacheHitRatio).toBe(0);
		expect(r.target.withinTarget).toBe(false);
	});

	it("computes integer averages + carries the window bounds", () => {
		const r = aggregateTokenSamples(
			[
				{ inputTokens: 4_000, cachedInputTokens: 0, outputTokens: 200 },
				{ inputTokens: 6_000, cachedInputTokens: 0, outputTokens: 400 },
			],
			BOUNDS,
		);
		expect(r.sampleCount).toBe(2);
		expect(r.averages.avgInputTokens).toBe(5_000);
		expect(r.averages.avgOutputTokens).toBe(300);
		expect(r.windowStart).toBe(1_000);
		expect(r.windowEnd).toBe(2_000);
		expect(r.windowMs).toBe(1_000);
	});

	it("computes cache-hit ratio as cached / (input + cached)", () => {
		const r = aggregateTokenSamples(
			[
				{ inputTokens: 1_000, cachedInputTokens: 9_000, outputTokens: 100 },
				{ inputTokens: 1_000, cachedInputTokens: 9_000, outputTokens: 100 },
			],
			BOUNDS,
		);
		// 18_000 / 20_000 = 0.9
		expect(r.cacheHitRatio).toBeCloseTo(0.9, 5);
	});

	it("flags withinTarget when avgInputTokens lands inside the §2.2 band", () => {
		const r = aggregateTokenSamples(
			[
				{ inputTokens: TOKEN_TARGET_MIN, cachedInputTokens: 0, outputTokens: 0 },
				{ inputTokens: TOKEN_TARGET_MAX, cachedInputTokens: 0, outputTokens: 0 },
			],
			BOUNDS,
		);
		// Average = 4500 — inside [3_000, 6_000].
		expect(r.target.withinTarget).toBe(true);
		expect(r.target.minInputTokens).toBe(TOKEN_TARGET_MIN);
		expect(r.target.maxInputTokens).toBe(TOKEN_TARGET_MAX);
	});

	it("flags withinTarget=false when the average is above the band", () => {
		const r = aggregateTokenSamples(
			[
				{ inputTokens: 50_000, cachedInputTokens: 0, outputTokens: 0 },
				{ inputTokens: 60_000, cachedInputTokens: 0, outputTokens: 0 },
			],
			BOUNDS,
		);
		expect(r.target.withinTarget).toBe(false);
		expect(r.averages.avgInputTokens).toBe(55_000);
	});

	it("flags withinTarget=false when the average is below the band", () => {
		const r = aggregateTokenSamples(
			[{ inputTokens: 1_000, cachedInputTokens: 0, outputTokens: 0 }],
			BOUNDS,
		);
		expect(r.target.withinTarget).toBe(false);
		expect(r.averages.avgInputTokens).toBe(1_000);
	});

	it("treats fully-cached samples as 100% cache-hit ratio", () => {
		const r = aggregateTokenSamples(
			[{ inputTokens: 0, cachedInputTokens: 5_000, outputTokens: 100 }],
			BOUNDS,
		);
		expect(r.cacheHitRatio).toBe(1);
	});
});
