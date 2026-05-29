/// <reference types="vite/client" />
/**
 * convex/industryAnalytics.test.ts
 *
 * Stage 4 of /DASHBOARD-V2-PLAN.md (2026-05-29) — pure-function
 * coverage for the deal-aggregation helpers feeding the three new
 * industry widgets:
 *
 *   - `bucketForDays`           — invoice-aging bucket router.
 *   - `emptyAgingBuckets`       — fresh zeroed-bucket array.
 *   - `isInvoiceStage`          — stage-name + code matcher.
 *   - `monthKey`                — UTC YYYY-MM bucket key.
 *   - `buildArrCohortBuckets`   — trailing 6-month cohort skeleton.
 *   - `computePropertyFunnel`   — counts + dropoff per stage.
 *
 * Pure tests — no Convex provider, no DB. Each helper is exercised
 * with the boundary values the Stage 4 widgets feed at runtime.
 */

import { describe, expect, it } from "vitest";
import { __test } from "./crm/entities/deals/industryAnalytics";

const {
	bucketForDays,
	emptyAgingBuckets,
	isInvoiceStage,
	monthKey,
	buildArrCohortBuckets,
	computePropertyFunnel,
	AGING_BUCKETS,
	COHORT_MONTHS,
} = __test;

describe("industryAnalytics — bucketForDays", () => {
	it("0 days → 0-7", () => {
		expect(bucketForDays(0)).toBe("0-7");
	});

	it("7 days → 0-7 (inclusive boundary)", () => {
		expect(bucketForDays(7)).toBe("0-7");
	});

	it("8 days → 8-14", () => {
		expect(bucketForDays(8)).toBe("8-14");
	});

	it("14 days → 8-14 (inclusive boundary)", () => {
		expect(bucketForDays(14)).toBe("8-14");
	});

	it("15 days → 15-30", () => {
		expect(bucketForDays(15)).toBe("15-30");
	});

	it("30 days → 15-30 (inclusive boundary)", () => {
		expect(bucketForDays(30)).toBe("15-30");
	});

	it("31 days → 30+", () => {
		expect(bucketForDays(31)).toBe("30+");
	});

	it("365 days → 30+", () => {
		expect(bucketForDays(365)).toBe("30+");
	});
});

describe("industryAnalytics — emptyAgingBuckets", () => {
	it("returns one bucket per AGING_BUCKETS entry, all zeroed", () => {
		const out = emptyAgingBuckets();
		expect(out).toHaveLength(AGING_BUCKETS.length);
		for (const b of out) {
			expect(b.count).toBe(0);
			expect(b.value).toBe(0);
		}
	});

	it("returns a fresh array each call (mutating one doesn't affect another)", () => {
		const a = emptyAgingBuckets();
		const b = emptyAgingBuckets();
		a[0]!.count = 99;
		expect(b[0]!.count).toBe(0);
	});
});

describe("industryAnalytics — isInvoiceStage", () => {
	it("matches by canonical code (uppercase)", () => {
		expect(isInvoiceStage({ code: "INV", name: "Whatever" })).toBe(true);
		expect(isInvoiceStage({ code: "INVOICED", name: "Whatever" })).toBe(true);
		expect(isInvoiceStage({ code: "AWAITING_PAYMENT", name: "Whatever" })).toBe(true);
	});

	it("matches by lowercase code (case-insensitive)", () => {
		expect(isInvoiceStage({ code: "inv", name: "Whatever" })).toBe(true);
	});

	it("matches by stage name when code doesn't match", () => {
		expect(isInvoiceStage({ code: "X", name: "Invoiced" })).toBe(true);
		expect(isInvoiceStage({ code: "X", name: "Awaiting Payment" })).toBe(true);
	});

	it("rejects unrelated stages", () => {
		expect(isInvoiceStage({ code: "WIP", name: "In Progress" })).toBe(false);
		expect(isInvoiceStage({ code: "DEMO", name: "Demo Scheduled" })).toBe(false);
		expect(isInvoiceStage({ code: "WON", name: "Closed Won" })).toBe(false);
	});
});

describe("industryAnalytics — monthKey", () => {
	it("formats YYYY-MM in UTC", () => {
		// 2026-05-29 in UTC.
		const t = Date.UTC(2026, 4, 29, 12, 0, 0);
		expect(monthKey(t)).toBe("2026-05");
	});

	it("crosses month boundaries deterministically", () => {
		const tJan = Date.UTC(2026, 0, 1, 0, 0, 0);
		expect(monthKey(tJan)).toBe("2026-01");
		const tDec = Date.UTC(2026, 11, 31, 23, 0, 0);
		expect(monthKey(tDec)).toBe("2026-12");
	});
});

describe("industryAnalytics — buildArrCohortBuckets", () => {
	it("returns COHORT_MONTHS buckets oldest → newest", () => {
		const now = Date.UTC(2026, 4, 29, 12, 0, 0); // 2026-05-29
		const buckets = buildArrCohortBuckets(now);
		expect(buckets).toHaveLength(COHORT_MONTHS);
		// Last bucket should be 2026-05.
		expect(buckets[COHORT_MONTHS - 1]!.month).toBe("2026-05");
		// First bucket should be 6 months prior — 2025-12.
		expect(buckets[0]!.month).toBe("2025-12");
	});

	it("seeds every bucket with count 0 + value 0", () => {
		const buckets = buildArrCohortBuckets(Date.now());
		for (const b of buckets) {
			expect(b.count).toBe(0);
			expect(b.value).toBe(0);
		}
	});
});

describe("industryAnalytics — computePropertyFunnel", () => {
	const pipelineId = "pipe1" as unknown as Parameters<
		typeof computePropertyFunnel
	>[0]["pipeline"]["_id"];
	const samplePipeline = {
		_id: pipelineId,
		_creationTime: 0,
		orgId: "org1" as unknown as Parameters<
			typeof computePropertyFunnel
		>[0]["pipeline"]["orgId"],
		entityType: "deal",
		name: "Sales",
		isDefault: true,
		stages: [
			{ id: "s1", code: "NEW", name: "New", order: 0, isDefaultStage: true },
			{ id: "s2", code: "VIEW", name: "Viewing", order: 1 },
			{ id: "s3", code: "OFR", name: "Offer", order: 2 },
			{
				id: "s4",
				code: "WON",
				name: "Won",
				order: 3,
				isFinal: true,
				finalType: "positive" as const,
			},
			{
				id: "s5",
				code: "LOST",
				name: "Lost",
				order: 4,
				isFinal: true,
				finalType: "negative" as const,
			},
		],
		updatedAt: 0,
		createdAt: 0,
	} as unknown as Parameters<typeof computePropertyFunnel>[0]["pipeline"];

	function deal(overrides: Record<string, unknown>) {
		return {
			_id: "d" as unknown,
			pipelineId,
			currentStageId: "s1",
			value: 100,
			deletedAt: undefined,
			wonAt: undefined,
			lostAt: undefined,
			...overrides,
		} as unknown as Parameters<typeof computePropertyFunnel>[0]["openDeals"][number];
	}

	it("counts open deals by stage, drops final stages", () => {
		const result = computePropertyFunnel({
			pipeline: samplePipeline,
			openDeals: [
				deal({ currentStageId: "s1", value: 100 }),
				deal({ currentStageId: "s1", value: 200 }),
				deal({ currentStageId: "s2", value: 50 }),
			],
		});
		expect(result.stages).toHaveLength(3); // 3 non-final stages
		expect(result.stages.map((s) => s.stageId)).toEqual(["s1", "s2", "s3"]);
		expect(result.stages[0]?.count).toBe(2);
		expect(result.stages[0]?.value).toBe(300);
		expect(result.stages[1]?.count).toBe(1);
		expect(result.stages[2]?.count).toBe(0);
	});

	it("computes dropoffPct relative to the leading stage", () => {
		const result = computePropertyFunnel({
			pipeline: samplePipeline,
			openDeals: [
				deal({ currentStageId: "s1", value: 100 }),
				deal({ currentStageId: "s1", value: 100 }),
				deal({ currentStageId: "s1", value: 100 }),
				deal({ currentStageId: "s1", value: 100 }),
				deal({ currentStageId: "s2", value: 100 }),
				deal({ currentStageId: "s2", value: 100 }),
				deal({ currentStageId: "s3", value: 100 }),
			],
		});
		expect(result.stages[0]?.dropoffPct).toBe(0);
		expect(result.stages[1]?.dropoffPct).toBe(50); // 4 → 2
		expect(result.stages[2]?.dropoffPct).toBe(75); // 4 → 1
	});

	it("computes relativeWidth ∈ [0,1] off leading stage", () => {
		const result = computePropertyFunnel({
			pipeline: samplePipeline,
			openDeals: [
				deal({ currentStageId: "s1" }),
				deal({ currentStageId: "s1" }),
				deal({ currentStageId: "s2" }),
			],
		});
		expect(result.stages[0]?.relativeWidth).toBe(1);
		expect(result.stages[1]?.relativeWidth).toBe(0.5);
		expect(result.stages[2]?.relativeWidth).toBe(0);
	});

	it("ignores soft-deleted + won + lost deals", () => {
		const result = computePropertyFunnel({
			pipeline: samplePipeline,
			openDeals: [
				deal({ currentStageId: "s1", deletedAt: 999 }),
				deal({ currentStageId: "s1", wonAt: 999 }),
				deal({ currentStageId: "s1", lostAt: 999 }),
				deal({ currentStageId: "s2" }),
			],
		});
		expect(result.openCount).toBe(1);
		expect(result.stages[0]?.count).toBe(0);
		expect(result.stages[1]?.count).toBe(1);
	});

	it("ignores deals from other pipelines", () => {
		const result = computePropertyFunnel({
			pipeline: samplePipeline,
			openDeals: [
				deal({
					currentStageId: "s1",
					pipelineId: "other-pipe" as unknown,
				}),
				deal({ currentStageId: "s1" }),
			],
		});
		expect(result.openCount).toBe(1);
	});

	it("returns zeros when no open deals exist", () => {
		const result = computePropertyFunnel({ pipeline: samplePipeline, openDeals: [] });
		expect(result.openCount).toBe(0);
		expect(result.openValue).toBe(0);
		for (const s of result.stages) {
			expect(s.count).toBe(0);
			expect(s.relativeWidth).toBe(0);
			expect(s.dropoffPct).toBe(0);
		}
	});
});
