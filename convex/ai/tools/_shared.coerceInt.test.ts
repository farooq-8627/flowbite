/**
 * convex/ai/tools/_shared.coerceInt.test.ts
 *
 * Locks the bug fix from 2026-05-24 — small open models (NVIDIA NIM
 * Llama-3.3, OpenRouter free Llama, Mistral Small) routinely emit
 * stringly-typed numbers (`limit: "100"` instead of `100`). The plain
 * `z.number()` chain rejects them with "expected number, received
 * string" and the AI loop ping-pongs on the error or gives up. Every
 * tool that needs a number from the model uses `coerceInt`, which
 * coerces strings to numbers before validation.
 */
import { describe, expect, it } from "vitest";
import { coerceInt } from "./_shared";

describe("coerceInt", () => {
	it("accepts a normal number", () => {
		const schema = coerceInt((n) => n.min(1).max(20));
		expect(schema.parse(10)).toBe(10);
	});

	it("coerces a stringly-typed number from small open models", () => {
		const schema = coerceInt((n) => n.min(1).max(20));
		expect(schema.parse("10")).toBe(10);
	});

	it("respects min/max constraints after coercion", () => {
		const schema = coerceInt((n) => n.min(1).max(20));
		expect(() => schema.parse("100")).toThrow();
		expect(() => schema.parse("0")).toThrow();
	});

	it("supports .catch() for graceful clamping", () => {
		const schema = coerceInt((n) => n.min(1).max(20).default(10).catch(20));
		expect(schema.parse("100")).toBe(20);
		expect(schema.parse("0")).toBe(20);
	});

	it("supports .default() when undefined", () => {
		const schema = coerceInt((n) => n.min(1).max(20).default(10));
		expect(schema.parse(undefined)).toBe(10);
	});

	it("trims whitespace before coercion", () => {
		const schema = coerceInt((n) => n.int());
		expect(schema.parse("  42  ")).toBe(42);
	});

	it("preserves NaN-producing strings as-is so Zod can reject", () => {
		const schema = coerceInt((n) => n.min(1));
		expect(() => schema.parse("not a number")).toThrow();
	});

	it("handles booleans (true → 1, false → 0)", () => {
		const schema = coerceInt((n) => n.min(0));
		expect(schema.parse(true)).toBe(1);
		expect(schema.parse(false)).toBe(0);
	});

	it("supports .int() chaining", () => {
		const schema = coerceInt((n) => n.int().min(1).max(10));
		expect(schema.parse("5")).toBe(5);
		// Float strings still rejected by .int()
		expect(() => schema.parse("3.5")).toThrow();
	});

	it("default builder gives a plain number schema when no builder is provided", () => {
		const schema = coerceInt();
		expect(schema.parse("42")).toBe(42);
		expect(schema.parse(42)).toBe(42);
	});
});
