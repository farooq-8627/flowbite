/**
 * convex/ai/personaContext.test.ts
 *
 * Pure-function tests for the persona-context cap + delta helpers.
 * The Convex internalMutation wrapper is exercised end-to-end by the
 * agent scorer suite; this file covers the deterministic inputs.
 *
 * Phase 4 Part 1 P1.12 — `PHASE-3-AI-AUDIT.md §5`.
 */
import { describe, expect, it } from "vitest";
import { __test } from "./personaContext";

const { PERSONA_CAPS, applyFactDelta, assertWithinCaps, computeByteCount } = __test;

describe("personaContext — caps & helpers", () => {
	it("PERSONA_CAPS exposes the documented limits", () => {
		expect(PERSONA_CAPS.summaryMaxChars).toBe(600);
		expect(PERSONA_CAPS.keyFactsMax).toBe(30);
		expect(PERSONA_CAPS.byteCountMax).toBe(4_096);
		expect(PERSONA_CAPS.keyFactMaxChars).toBe(240);
	});

	it("applyFactDelta de-duplicates new facts (case-insensitive trim)", () => {
		const after = applyFactDelta(["Already known"], {
			addFacts: ["already known", "  ALREADY KNOWN  ", "New fact"],
		});
		expect(after).toEqual(["Already known", "New fact"]);
	});

	it("applyFactDelta removes facts case-insensitively", () => {
		const after = applyFactDelta(["Calls leads opportunities", "Default deal: $5K"], {
			removeFacts: ["CALLS LEADS OPPORTUNITIES"],
		});
		expect(after).toEqual(["Default deal: $5K"]);
	});

	it("applyFactDelta drops empty / whitespace-only facts", () => {
		const after = applyFactDelta([], { addFacts: ["", "   ", "real"] });
		expect(after).toEqual(["real"]);
	});

	it("applyFactDelta drops facts longer than the per-fact cap", () => {
		const huge = "x".repeat(PERSONA_CAPS.keyFactMaxChars + 1);
		const after = applyFactDelta([], { addFacts: [huge, "ok"] });
		expect(after).toEqual(["ok"]);
	});

	it("applyFactDelta order: existing first, then appended new ones", () => {
		const after = applyFactDelta(["A", "B"], { addFacts: ["C", "D"] });
		expect(after).toEqual(["A", "B", "C", "D"]);
	});

	it("computeByteCount is monotonic — more facts = more bytes", () => {
		const a = computeByteCount({ summary: "short", keyFacts: [] });
		const b = computeByteCount({ summary: "short", keyFacts: ["one fact"] });
		const c = computeByteCount({
			summary: "short",
			keyFacts: ["one fact", "another"],
		});
		expect(a).toBeLessThan(b);
		expect(b).toBeLessThan(c);
	});

	it("assertWithinCaps passes a small payload", () => {
		const r = assertWithinCaps({ summary: "Short summary.", keyFacts: ["A", "B"] });
		expect(r.byteCount).toBeGreaterThan(0);
		expect(r.byteCount).toBeLessThan(PERSONA_CAPS.byteCountMax);
	});

	it("assertWithinCaps throws when summary exceeds 600 chars", () => {
		expect(() => assertWithinCaps({ summary: "x".repeat(601), keyFacts: [] })).toThrow(
			/summary too long/i,
		);
	});

	it("assertWithinCaps throws when keyFacts exceeds 30 entries", () => {
		const tooMany = Array.from({ length: 31 }, (_, i) => `Fact ${i}`);
		expect(() => assertWithinCaps({ summary: "ok", keyFacts: tooMany })).toThrow(
			/too many key facts/i,
		);
	});

	it("assertWithinCaps throws when total byteCount exceeds 4 KB", () => {
		// A summary of ~600 chars + 30 facts each ~240 chars exceeds 4 KB.
		const longFacts = Array.from({ length: 30 }, () => "y".repeat(220));
		expect(() => assertWithinCaps({ summary: "z".repeat(600), keyFacts: longFacts })).toThrow(
			/persona context too large/i,
		);
	});

	it("computeByteCount includes preferences in the budget", () => {
		const without = computeByteCount({ summary: "s", keyFacts: ["f"] });
		const withPrefs = computeByteCount({
			summary: "s",
			keyFacts: ["f"],
			preferences: { calls_leads: "opportunities", default_currency: "AED" },
		});
		expect(withPrefs).toBeGreaterThan(without);
	});
});
