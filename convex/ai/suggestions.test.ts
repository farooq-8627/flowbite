/**
 * convex/ai/suggestions.test.ts
 *
 * Pure-function tests for the suggestions ranking + days-ago helpers.
 * The Convex query handler is exercised end-to-end via the dashboard
 * mounting; this file covers the deterministic inputs.
 *
 * Phase 4 Part 1 P1.14 (`PHASE-3-AI-AUDIT.md §5`).
 */
import { describe, expect, it } from "vitest";
import { __test } from "./suggestions";

const {
	rank,
	severityRank,
	daysAgo,
	STALE_LEAD_DAYS,
	STUCK_DEAL_DAYS,
	LAST_CONTACT_DAYS,
	MAX_SUGGESTIONS_PER_SCOPE,
} = __test;

describe("suggestions — caps & helpers", () => {
	it("exposes the documented caps", () => {
		expect(MAX_SUGGESTIONS_PER_SCOPE).toBe(5);
		expect(STALE_LEAD_DAYS).toBe(7);
		expect(STUCK_DEAL_DAYS).toBe(21);
		expect(LAST_CONTACT_DAYS).toBe(14);
	});

	it("severityRank: critical < warning < info", () => {
		expect(severityRank("critical")).toBeLessThan(severityRank("warning"));
		expect(severityRank("warning")).toBeLessThan(severityRank("info"));
	});

	it("rank sorts critical first, info last", () => {
		const list = [
			{ id: "a", kind: "x", headline: "", body: "", intent: "", severity: "info" as const },
			{
				id: "b",
				kind: "x",
				headline: "",
				body: "",
				intent: "",
				severity: "critical" as const,
			},
			{
				id: "c",
				kind: "x",
				headline: "",
				body: "",
				intent: "",
				severity: "warning" as const,
			},
		];
		const sorted = [...list].sort(rank);
		expect(sorted.map((s) => s.id)).toEqual(["b", "c", "a"]);
	});

	it("daysAgo returns 0 for now and positive integers in the past", () => {
		expect(daysAgo(Date.now())).toBe(0);
		const threeDaysAgo = Date.now() - 3 * 86_400_000;
		expect(daysAgo(threeDaysAgo)).toBe(3);
	});

	it("daysAgo floors fractional days", () => {
		const eighteenHoursAgo = Date.now() - 18 * 60 * 60 * 1000;
		expect(daysAgo(eighteenHoursAgo)).toBe(0);
	});
});
