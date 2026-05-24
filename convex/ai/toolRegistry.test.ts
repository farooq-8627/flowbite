/**
 * convex/ai/toolRegistry.test.ts
 *
 * Pure-function tests for {@link buildToolDescription} (P1.4). The
 * registry itself can't be unit-tested without a Convex context — those
 * paths are covered by `agentScorer.test.ts`.
 */
import { describe, expect, it } from "vitest";
import { buildToolDescription, type ToolInstruction } from "./toolRegistry";

describe("buildToolDescription", () => {
	it("emits whenToCall verbatim when nothing else is set", () => {
		const out = buildToolDescription({ whenToCall: "Use to add a new lead." });
		expect(out).toBe("Use to add a new lead.");
	});

	it("appends 'Do NOT call when' guidance", () => {
		const out = buildToolDescription({
			whenToCall: "Use to add a new lead.",
			whenNotToCall: "the user wants to convert a lead — call convert_lead instead.",
		});
		expect(out).toContain("Use to add a new lead.");
		expect(out).toContain("Do NOT call when:");
		expect(out).toContain("convert_lead instead");
	});

	it("formats preflight as backticked tool list", () => {
		const out = buildToolDescription({
			whenToCall: "x",
			preflight: ["search_crm", "list_entity_fields"],
		});
		expect(out).toContain("Preflight (call FIRST in the same turn):");
		expect(out).toContain("`search_crm`");
		expect(out).toContain("`list_entity_fields`");
	});

	it("formats requiredClarifications with ask_user_input hint", () => {
		const out = buildToolDescription({
			whenToCall: "x",
			requiredClarifications: ["full name", "email"],
		});
		expect(out).toContain("ask_user_input");
		expect(out).toContain("`full name`");
		expect(out).toContain("`email`");
	});

	it("lists synonyms in quotes", () => {
		const out = buildToolDescription({
			whenToCall: "x",
			synonyms: ["prospect", "potential customer"],
		});
		expect(out).toContain('"prospect"');
		expect(out).toContain('"potential customer"');
	});

	it("renders good and bad examples as JSON code blocks", () => {
		const instr: ToolInstruction = {
			whenToCall: "x",
			goodExample: {
				description: "user said 'add Sarah Khan as a lead'",
				args: { displayName: "Sarah Khan", source: "manual" },
			},
			badExample: {
				description: "user said 'add a lead'",
				args: { displayName: "" },
				whyBad: "displayName is required",
			},
		};
		const out = buildToolDescription(instr);
		expect(out).toContain("Good example:");
		expect(out).toContain('"displayName": "Sarah Khan"');
		expect(out).toContain("Bad example (do NOT do this):");
		expect(out).toContain('"displayName": ""');
		expect(out).toContain("Why bad: displayName is required");
	});

	it("orders sections deterministically: when, when-not, preflight, clarifications, synonyms, good, bad", () => {
		const out = buildToolDescription({
			whenToCall: "WHEN",
			whenNotToCall: "WHENNOT",
			preflight: ["pre"],
			requiredClarifications: ["clar"],
			synonyms: ["syn"],
			goodExample: { description: "gd", args: {} },
			badExample: { description: "bd", args: {} },
		});
		const idx = (s: string) => out.indexOf(s);
		expect(idx("WHEN")).toBeLessThan(idx("WHENNOT"));
		expect(idx("WHENNOT")).toBeLessThan(idx("Preflight"));
		expect(idx("Preflight")).toBeLessThan(idx("ask_user_input"));
		expect(idx("ask_user_input")).toBeLessThan(idx("Synonyms"));
		expect(idx("Synonyms")).toBeLessThan(idx("Good example"));
		expect(idx("Good example")).toBeLessThan(idx("Bad example"));
	});
});
