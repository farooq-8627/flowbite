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

// ─── C.4 — propose/commit schema audit ──────────────────────────────────────

import { z } from "zod";
import { registerTool, runProposeCommitSchemaAudit } from "./toolRegistry";

describe("runProposeCommitSchemaAudit (C.4)", () => {
	it("flags propose-only fields the commit schema doesn't accept", () => {
		// Register a deliberately-broken pair. The audit is force-run so
		// the singleton flag from earlier tests / app boot doesn't hide
		// the result.
		registerTool({
			name: "demo_audit_lossy",
			description: "Test propose with lossy field",
			layer: "always",
			permission: null,
			confirmation: "twoStep",
			schema: z.object({
				code: z.string(),
				notes: z.string().describe("Lost on commit — the audit must catch this."),
			}),
			execute: async () => ({ ok: true as const, data: {} }),
		});
		registerTool({
			name: "commit_demo_audit_lossy",
			description: "Test commit (missing notes)",
			layer: "always",
			permission: null,
			confirmation: "none",
			schema: z.object({
				code: z.string(),
			}),
			execute: async () => ({ ok: true as const, data: {} }),
		});

		const findings = runProposeCommitSchemaAudit(true);
		const offender = findings.find((f) => f.pair.startsWith("demo_audit_lossy"));
		expect(offender).toBeDefined();
		expect(offender?.proposeOnly).toContain("notes");
		expect(offender?.commitOnly).toEqual([]);
	});

	it("does not flag a clean propose/commit pair", () => {
		registerTool({
			name: "demo_audit_clean",
			description: "Clean propose",
			layer: "always",
			permission: null,
			confirmation: "twoStep",
			schema: z.object({ code: z.string() }),
			execute: async () => ({ ok: true as const, data: {} }),
		});
		registerTool({
			name: "commit_demo_audit_clean",
			description: "Clean commit",
			layer: "always",
			permission: null,
			confirmation: "none",
			schema: z.object({ code: z.string() }),
			execute: async () => ({ ok: true as const, data: {} }),
		});

		const findings = runProposeCommitSchemaAudit(true);
		const clean = findings.find((f) => f.pair.startsWith("demo_audit_clean ↔"));
		expect(clean).toBeUndefined();
	});

	it("treats propose-only display fields as findings (agent-author triages each)", () => {
		// Mirror the real `archive_note_category` pattern — propose
		// carries `name` for the propose card, commit doesn't need it.
		// The audit warns; the agent author triages. Documented in the
		// audit function's caveats.
		registerTool({
			name: "demo_audit_display_only",
			description: "Propose with display-only field",
			layer: "always",
			permission: null,
			confirmation: "twoStep",
			schema: z.object({
				categoryId: z.string(),
				name: z.string().describe("For the propose card"),
			}),
			execute: async () => ({ ok: true as const, data: {} }),
		});
		registerTool({
			name: "commit_demo_audit_display_only",
			description: "Commit without display field",
			layer: "always",
			permission: null,
			confirmation: "none",
			schema: z.object({ categoryId: z.string() }),
			execute: async () => ({ ok: true as const, data: {} }),
		});

		const findings = runProposeCommitSchemaAudit(true);
		const offender = findings.find((f) => f.pair.startsWith("demo_audit_display_only"));
		expect(offender).toBeDefined();
		expect(offender?.proposeOnly).toEqual(["name"]);
	});
});
