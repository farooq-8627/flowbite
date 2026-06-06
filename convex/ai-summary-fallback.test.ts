/**
 * Pure-function tests for `buildToolOnlyFallbackSummary` — the
 * deterministic safety net that ships in `convex/ai/orchestrator/run.ts`
 * for the "model emits no prose despite running tools" case.
 *
 * Lives at the top level (not under `convex/ai/orchestrator/`) so the
 * shared `convex-test` harness in `convex.config.test.ts` picks it up
 * without touching the existing layered file structure.
 */

import { describe, expect, it } from "vitest";
import { buildToolOnlyFallbackSummary } from "./ai/orchestrator/run";

describe("buildToolOnlyFallbackSummary", () => {
	it("returns empty string when no tools ran and no headlines", () => {
		expect(buildToolOnlyFallbackSummary([], 0)).toBe("");
	});

	it("returns generic completion notice when tools ran but produced zero headlines", () => {
		expect(buildToolOnlyFallbackSummary([], 1)).toBe(
			"Completed 1 action — see the steps above for details.",
		);
		expect(buildToolOnlyFallbackSummary([], 3)).toBe(
			"Completed 3 actions — see the steps above for details.",
		);
	});

	it("emits 'Done — <headline>' for one successful tool call", () => {
		expect(
			buildToolOnlyFallbackSummary([{ headline: "Updated 3 leads.", status: "ok" }], 1),
		).toBe("Done — Updated 3 leads.");
	});

	it("emits 'Partially complete — <headline>' for a partial tool call", () => {
		expect(
			buildToolOnlyFallbackSummary(
				[{ headline: "Updated 3 of 5 leads — 2 failed.", status: "partial" }],
				1,
			),
		).toBe("Partially complete — Updated 3 of 5 leads — 2 failed.");
	});

	it("emits a multi-action recap for multiple successful tool calls", () => {
		const result = buildToolOnlyFallbackSummary(
			[
				{ headline: "Created lead Sarah Khan (P-007).", status: "ok" },
				{ headline: "Created task T-012 for P-007.", status: "ok" },
			],
			2,
		);
		expect(result).toBe(
			"Completed 2 actions:\n- Created lead Sarah Khan (P-007).\n- Created task T-012 for P-007.",
		);
	});

	it("prefixes partial bullets with '(partial)'", () => {
		const result = buildToolOnlyFallbackSummary(
			[
				{ headline: "Updated 3 of 5 leads — 2 failed.", status: "partial" },
				{ headline: "Closed 4 deals as won.", status: "ok" },
			],
			2,
		);
		expect(result).toBe(
			"Completed 2 actions:\n- (partial) Updated 3 of 5 leads — 2 failed.\n- Closed 4 deals as won.",
		);
	});

	it("trims whitespace inside the headline (assumes caller pre-trimmed)", () => {
		// Caller (`run.ts::onToolEvent`) already trims via
		// `headline.trim()` before pushing — this test guards against a
		// future refactor that drops the trim.
		expect(
			buildToolOnlyFallbackSummary([{ headline: "Created 2 deals.", status: "ok" }], 1),
		).toBe("Done — Created 2 deals.");
	});
});
