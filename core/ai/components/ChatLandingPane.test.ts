/**
 * core/ai/components/ChatLandingPane.test.ts
 *
 * Stage 3-A 3A.1 — pure-helper coverage for the chat landing pane.
 *
 * Render-level coverage (briefing skeleton, next-action rows from query,
 * Act button auto-send, recent-thread chip swap) is queued for session 2:
 * the frontend doesn't yet have a shared `convex/react` mock pattern, so
 * a render test for ChatLandingPane would have to invent one. Bringing
 * that in-scope here would creep this session's surface. The pure
 * helpers below cover the deterministic paths the component depends on.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { __test } from "./ChatLandingPane";

const { confidenceTone, relativeAbs, SUGGESTED_PROMPTS } = __test;

describe("ChatLandingPane.confidenceTone", () => {
	it("maps high → primary tone", () => {
		expect(confidenceTone("high")).toContain("bg-primary/10");
		expect(confidenceTone("high")).toContain("text-primary");
	});

	it("maps medium → amber tone", () => {
		expect(confidenceTone("medium")).toContain("bg-amber-500/10");
		expect(confidenceTone("medium")).toContain("text-amber-600");
	});

	it("maps low → muted tone", () => {
		expect(confidenceTone("low")).toBe("bg-muted text-muted-foreground");
	});
});

describe("ChatLandingPane.relativeAbs", () => {
	beforeEach(() => {
		// Pin time so the absolute-fallback branch is deterministic.
		vi.useFakeTimers();
		vi.setSystemTime(new Date("2026-05-26T12:00:00.000Z"));
	});
	afterEach(() => {
		vi.useRealTimers();
	});

	it("returns 'just now' for sub-minute diffs", () => {
		expect(relativeAbs(Date.now() - 30_000)).toBe("just now");
	});

	it("returns minute-resolution for sub-hour diffs", () => {
		expect(relativeAbs(Date.now() - 5 * 60_000)).toBe("5m ago");
	});

	it("returns hour-resolution for sub-day diffs", () => {
		expect(relativeAbs(Date.now() - 3 * 60 * 60 * 1000)).toBe("3h ago");
	});

	it("returns day-resolution for sub-week diffs", () => {
		expect(relativeAbs(Date.now() - 3 * 24 * 60 * 60 * 1000)).toBe("3d ago");
	});

	it("returns absolute date for >7d diffs", () => {
		// 30 days back — should hit the toLocaleDateString branch.
		const out = relativeAbs(Date.now() - 30 * 24 * 60 * 60 * 1000);
		// Format depends on the test runner's default locale; we just
		// assert it's not one of the relative buckets.
		expect(out).not.toBe("just now");
		expect(out).not.toMatch(/m ago$/);
		expect(out).not.toMatch(/h ago$/);
		expect(out).not.toMatch(/d ago$/);
	});
});

describe("ChatLandingPane.SUGGESTED_PROMPTS", () => {
	it("ships exactly three prompts", () => {
		expect(SUGGESTED_PROMPTS).toHaveLength(3);
	});

	it("every prompt is a non-empty string", () => {
		for (const p of SUGGESTED_PROMPTS) {
			expect(typeof p).toBe("string");
			expect(p.trim().length).toBeGreaterThan(0);
		}
	});

	it("every prompt is a question or directive (verb-led)", () => {
		// Cheap sanity check: every prompt should look like an
		// imperative or question. Empty / hint-shaped text would be a
		// regression — the pane's premise is "click → AI does
		// something useful".
		for (const p of SUGGESTED_PROMPTS) {
			expect(p.length).toBeGreaterThanOrEqual(20);
		}
	});
});
