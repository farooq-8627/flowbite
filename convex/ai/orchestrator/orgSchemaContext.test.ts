/**
 * convex/ai/orchestrator/orgSchemaContext.test.ts
 *
 * Pure-function unit tests for the org-schema-context helper. Covers
 * the rendering helpers (escape, capitalise, options truncation) so the
 * caps + escape rules are locked in. The full DB-touching e2e is
 * covered by `agentScorer.test.ts` once it adds a fixture.
 */

import { describe, expect, it } from "vitest";
import { __test } from "./orgSchemaContext";

const { BUDGET_CAPS, renderOptions, escapeCell, capitalise } = __test;

describe("capitalise", () => {
	it("uppercases the first character", () => {
		expect(capitalise("lead")).toBe("Lead");
		expect(capitalise("contact")).toBe("Contact");
	});
	it("returns empty string unchanged", () => {
		expect(capitalise("")).toBe("");
	});
	it("preserves already-capitalised input", () => {
		expect(capitalise("Lead")).toBe("Lead");
	});
});

describe("escapeCell", () => {
	it("escapes pipes so they don't break markdown tables", () => {
		expect(escapeCell("foo|bar")).toBe("foo\\|bar");
	});
	it("collapses newlines into spaces", () => {
		expect(escapeCell("line1\nline2")).toBe("line1 line2");
	});
	it("passes plain strings through unchanged", () => {
		expect(escapeCell("Hello world")).toBe("Hello world");
	});
});

describe("renderOptions", () => {
	it("returns em-dash when no options", () => {
		const caps: string[] = [];
		expect(renderOptions(undefined, caps, "x")).toBe("—");
		expect(renderOptions([], caps, "x")).toBe("—");
		expect(caps).toEqual([]);
	});
	it("joins all options when within cap", () => {
		const caps: string[] = [];
		const out = renderOptions(["A", "B", "C"], caps, "x");
		expect(out).toBe("A, B, C");
		expect(caps).toEqual([]);
	});
	it("truncates over the cap and emits a hint", () => {
		const caps: string[] = [];
		const opts = Array.from({ length: BUDGET_CAPS.optionsPerField + 5 }, (_, i) => `O${i}`);
		const out = renderOptions(opts, caps, "industry_vertical");
		// First five options are kept; remaining count + helper hint.
		expect(out).toContain("O0, O1, O2, O3, O4,");
		expect(out).toContain("more — call");
		expect(out).toContain('list_field_options("industry_vertical")');
		// Cap was hit — recorded for diagnostics.
		expect(caps).toContain("options:industry_vertical");
	});
	it("escapes pipes inside option labels", () => {
		const caps: string[] = [];
		const out = renderOptions(["A|B", "C"], caps, "x");
		expect(out).toBe("A\\|B, C");
	});
});

describe("BUDGET_CAPS", () => {
	it("publishes cap values for telemetry verification", () => {
		expect(BUDGET_CAPS.fieldsPerEntity).toBeGreaterThanOrEqual(50);
		expect(BUDGET_CAPS.optionsPerField).toBeGreaterThan(0);
		expect(BUDGET_CAPS.tags).toBeGreaterThan(0);
		expect(BUDGET_CAPS.members).toBeGreaterThan(0);
		expect(BUDGET_CAPS.recentlyTouched).toBeGreaterThan(0);
		expect(BUDGET_CAPS.totalBytesWarn).toBeGreaterThan(0);
	});
});
