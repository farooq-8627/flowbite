/**
 * convex/ai/registry/drive.test.ts — Stage S2
 *
 * The system-prompt assembler is the cache-discipline boundary. We test:
 *   • the stable prefix contains PROJECT_DRIVE + the catalog (cacheable);
 *   • the tail is per-turn (uncached);
 *   • the Anthropic cache-control marker has the exact shape Anthropic expects.
 */
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { ANTHROPIC_CACHE_CONTROL_EPHEMERAL, assembleSystemPrompt, PROJECT_DRIVE } from "./drive";
import { ok } from "./result";
import type { Capability } from "./types";

function cap(name: string, group: string, whenToCall: string): Capability {
	return {
		name,
		module: group,
		group,
		permission: null,
		risk: "safe",
		channels: ["chat"],
		spec: { whenToCall, goodExample: {} },
		drive: { onSuccess: "ok" },
		input: z.object({}),
		run: async () => ok({ headline: "ok" }),
	};
}

describe("PROJECT_DRIVE", () => {
	it("contains the envelope-contract section", () => {
		expect(PROJECT_DRIVE).toContain("Tool envelope contract");
		expect(PROJECT_DRIVE).toContain("`needs_repair`");
		expect(PROJECT_DRIVE).toContain("Never invent codes");
	});
});

describe("ANTHROPIC_CACHE_CONTROL_EPHEMERAL", () => {
	it("matches the exact provider-options shape Anthropic expects", () => {
		// Per @ai-sdk/anthropic ~3.0.79: providerOptions.anthropic.cacheControl
		// = { type: "ephemeral", ttl?: "5m" | "1h" }.
		expect(ANTHROPIC_CACHE_CONTROL_EPHEMERAL).toEqual({
			anthropic: { cacheControl: { type: "ephemeral" } },
		});
	});
});

describe("assembleSystemPrompt", () => {
	const caps = [cap("create_lead", "leads", "Make a new lead.")];

	it("stablePrefix carries PROJECT_DRIVE + the catalog", () => {
		const out = assembleSystemPrompt(caps, "");
		expect(out.stablePrefix).toContain("Project drive");
		expect(out.stablePrefix).toContain("## Capabilities");
		expect(out.stablePrefix).toContain("create_lead");
		expect(out.tail).toBe("");
	});

	it("attaches the per-turn tail without polluting the prefix", () => {
		const out = assembleSystemPrompt(caps, "## Page context\nSomething.");
		expect(out.stablePrefix).not.toContain("Page context");
		expect(out.tail).toContain("Page context");
		expect(out.combined).toContain("Project drive");
		expect(out.combined).toContain("Page context");
	});

	it("is byte-identical when called with the same inputs (cache stability)", () => {
		const a = assembleSystemPrompt(caps, "tail");
		const b = assembleSystemPrompt(caps, "tail");
		expect(a.stablePrefix).toBe(b.stablePrefix);
		expect(a.tail).toBe(b.tail);
		expect(a.combined).toBe(b.combined);
	});

	it("trims leading/trailing whitespace on the tail to avoid cache thrash", () => {
		const out = assembleSystemPrompt(caps, "   tail   \n\n");
		expect(out.tail).toBe("tail");
	});
});
