/**
 * convex/_shared/synonyms.test.ts
 *
 * Unit tests for the LLM-friendly coercion helpers:
 *   - canonicalEntityType
 *   - canonicalFieldType
 *   - normaliseCode  (P1 nice-to-have, PHASE-3-AI-AUDIT.md §6 audit row 5)
 *   - codeString     (zod wrapper)
 *
 * No I/O — pure functions. Lives under the convex test config so the
 * audit harness can pick it up alongside agentScorer.test.ts.
 */

import { describe, expect, it } from "vitest";
import {
	canonicalEntityType,
	canonicalFieldType,
	codeString,
	NEEDS_CLARIFICATION,
	normaliseCode,
} from "./synonyms";

describe("canonicalEntityType", () => {
	it("maps plurals to singular", () => {
		expect(canonicalEntityType("leads")).toBe("lead");
		expect(canonicalEntityType("contacts")).toBe("contact");
		expect(canonicalEntityType("deals")).toBe("deal");
		expect(canonicalEntityType("companies")).toBe("company");
	});

	it("maps common variants", () => {
		expect(canonicalEntityType("opportunities")).toBe("deal");
		expect(canonicalEntityType("accounts")).toBe("company");
		expect(canonicalEntityType("organizations")).toBe("company");
		expect(canonicalEntityType("organisations")).toBe("company");
	});

	it("lower-cases inputs", () => {
		expect(canonicalEntityType("LEADS")).toBe("lead");
		expect(canonicalEntityType("Deal")).toBe("deal");
	});

	it("passes unknown values through unchanged (lowercased)", () => {
		expect(canonicalEntityType("widget")).toBe("widget");
	});

	it("ignores non-string inputs", () => {
		expect(canonicalEntityType(42)).toBe(42);
		expect(canonicalEntityType(undefined)).toBe(undefined);
		expect(canonicalEntityType(null)).toBe(null);
	});
});

describe("canonicalFieldType", () => {
	it("maps select synonyms", () => {
		expect(canonicalFieldType("picklist")).toBe("select");
		expect(canonicalFieldType("dropdown")).toBe("select");
		expect(canonicalFieldType("multi-select")).toBe("multiselect");
	});

	it("returns the clarification sentinel for file-shaped intents", () => {
		expect(canonicalFieldType("file")).toBe(NEEDS_CLARIFICATION);
		expect(canonicalFieldType("attachment")).toBe(NEEDS_CLARIFICATION);
		expect(canonicalFieldType("photo")).toBe(NEEDS_CLARIFICATION);
	});

	it("maps numeric synonyms", () => {
		expect(canonicalFieldType("int")).toBe("number");
		expect(canonicalFieldType("integer")).toBe("number");
		expect(canonicalFieldType("currency")).toBe("number");
	});
});

describe("normaliseCode (P1.7)", () => {
	it("zero-pads number to width 3", () => {
		expect(normaliseCode("P-1")).toBe("P-001");
		expect(normaliseCode("P-7")).toBe("P-007");
		expect(normaliseCode("D-42")).toBe("D-042");
	});

	it("uppercases the prefix", () => {
		expect(normaliseCode("p-001")).toBe("P-001");
		expect(normaliseCode("co-7")).toBe("CO-007");
	});

	it("inserts the dash when omitted", () => {
		expect(normaliseCode("P001")).toBe("P-001");
		expect(normaliseCode("FU3")).toBe("FU-003");
	});

	it("collapses whitespace / underscores / dots between prefix and number", () => {
		expect(normaliseCode("P 001")).toBe("P-001");
		expect(normaliseCode("p_7")).toBe("P-007");
		expect(normaliseCode("D.42")).toBe("D-042");
	});

	it("preserves already-canonical codes verbatim", () => {
		expect(normaliseCode("P-001")).toBe("P-001");
		expect(normaliseCode("CO-007")).toBe("CO-007");
		expect(normaliseCode("FU-100")).toBe("FU-100");
	});

	it("trims surrounding whitespace", () => {
		expect(normaliseCode("  P-001  ")).toBe("P-001");
	});

	it("preserves widths longer than 3 digits", () => {
		expect(normaliseCode("D-1234")).toBe("D-1234");
	});

	it("returns input unchanged when unparseable", () => {
		expect(normaliseCode("widget")).toBe("widget");
		// No digits.
		expect(normaliseCode("ABC")).toBe("ABC");
		// Mixed suffix like "P-001a" — exact match required, leave alone.
		expect(normaliseCode("P-001a")).toBe("P-001a");
		// Empty.
		expect(normaliseCode("")).toBe("");
	});

	it("ignores non-string values", () => {
		expect(normaliseCode(42)).toBe(42);
		expect(normaliseCode(undefined)).toBe(undefined);
	});
});

describe("codeString zod wrapper", () => {
	it("preprocesses then validates as non-empty string", () => {
		const schema = codeString();
		expect(schema.parse("p001")).toBe("P-001");
		expect(schema.parse("D-42")).toBe("D-042");
	});

	it("rejects empty string after coercion", () => {
		const schema = codeString();
		expect(() => schema.parse("")).toThrow();
	});

	it("passes unparseable values through to the validator (still a string)", () => {
		const schema = codeString();
		// No digits: parsing returns the original string. Should still
		// pass length validation since len > 0.
		expect(schema.parse("widget")).toBe("widget");
	});
});
