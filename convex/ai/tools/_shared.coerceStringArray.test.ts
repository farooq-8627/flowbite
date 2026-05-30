/**
 * convex/ai/tools/_shared.coerceStringArray.test.ts
 *
 * Locks the bug fix from 2026-05-30 — Llama-3.3-70B routinely emits
 * `entityIds: "P-001,P-002,P-003"` (a comma-separated string) or
 * `entityIds: '["P-001","P-002"]'` (a JSON-encoded array) instead of
 * a real JSON array for the bulk tools. The vanilla `z.array(z.string())`
 * chain rejects both with "expected array, received string", surfacing
 * to the user as "Approved payload is malformed" right after they hit
 * Approve. Every bulk tool's array fields go through `coerceStringArray`,
 * which normalises the input into a real array before validation.
 */
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { coerceStringArray } from "./_shared";

describe("coerceStringArray", () => {
	it("accepts a normal array unchanged", () => {
		const schema = coerceStringArray(z.array(z.string()).min(1).max(200));
		expect(schema.parse(["a", "b", "c"])).toEqual(["a", "b", "c"]);
	});

	it("splits a comma-joined string from small open models", () => {
		const schema = coerceStringArray(z.array(z.string()).min(1).max(200));
		expect(schema.parse("P-001,P-002,P-003")).toEqual(["P-001", "P-002", "P-003"]);
	});

	it("trims whitespace around comma-separated tokens", () => {
		const schema = coerceStringArray(z.array(z.string()));
		expect(schema.parse("P-001 ,  P-002 , P-003")).toEqual(["P-001", "P-002", "P-003"]);
	});

	it("parses a JSON-encoded array string", () => {
		const schema = coerceStringArray(z.array(z.string()));
		expect(schema.parse('["P-001","P-002","P-003"]')).toEqual(["P-001", "P-002", "P-003"]);
	});

	it("falls back to comma-split when JSON parse fails", () => {
		const schema = coerceStringArray(z.array(z.string()));
		// Malformed JSON-array — falls through to the comma-split branch.
		expect(schema.parse("[P-001,P-002")).toEqual(["[P-001", "P-002"]);
	});

	it("wraps a lone non-array primitive as a single-element array", () => {
		const schema = coerceStringArray(z.array(z.string()));
		// Single id with no comma → still a one-element array.
		expect(schema.parse("P-001")).toEqual(["P-001"]);
	});

	it("returns an empty array for an empty string", () => {
		const schema = coerceStringArray(z.array(z.string()));
		// Then the inner array validator decides whether to throw on min(1).
		expect(schema.parse("")).toEqual([]);
	});

	it("respects min/max from the inner schema", () => {
		const schema = coerceStringArray(z.array(z.string()).min(1).max(3));
		expect(() => schema.parse("")).toThrow(); // empty after coerce → fails min(1)
		expect(() => schema.parse("a,b,c,d")).toThrow(); // too many → fails max(3)
	});

	it("default builder gives a plain string-array schema when no builder is provided", () => {
		const schema = coerceStringArray();
		expect(schema.parse(["a", "b"])).toEqual(["a", "b"]);
		expect(schema.parse("a,b")).toEqual(["a", "b"]);
	});

	it("handles newlines and tabs as separators", () => {
		const schema = coerceStringArray(z.array(z.string()));
		expect(schema.parse("P-001\nP-002\tP-003")).toEqual(["P-001", "P-002", "P-003"]);
	});

	it("filters empty fragments from over-eager separators", () => {
		const schema = coerceStringArray(z.array(z.string()));
		expect(schema.parse("P-001,,P-002,")).toEqual(["P-001", "P-002"]);
	});

	it("forwards null/undefined unchanged so the inner validator decides", () => {
		const required = coerceStringArray(z.array(z.string()).min(1));
		expect(() => required.parse(null)).toThrow();
		expect(() => required.parse(undefined)).toThrow();
	});
});
