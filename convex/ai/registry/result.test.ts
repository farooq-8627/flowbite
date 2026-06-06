/**
 * convex/ai/registry/result.test.ts — Stage S0 acceptance tests.
 *
 * The envelope builders produce valid CapabilityResult shapes (every one has a
 * non-empty headline + the right status), and the registry registers / looks up
 * / lists capabilities and rejects duplicate names.
 */

import { describe, expect, it } from "vitest";
import { z } from "zod";
import { defineCapability, getCapability, listCapabilities, REGISTRY } from "./define";
import { ask, denied, failed, ok, partial, repair } from "./result";

describe("result builders", () => {
	it("ok carries status + headline + changes", () => {
		const r = ok({
			headline: "Created lead L-014",
			changes: [{ label: "Name", value: "Sara" }],
		});
		expect(r.status).toBe("ok");
		expect(r.headline.length).toBeGreaterThan(0);
		expect(r.changes?.[0]).toEqual({ label: "Name", value: "Sara" });
	});

	it("partial carries per-row errors", () => {
		const r = partial({
			headline: "2 of 3 updated",
			errors: [{ item: "L-3", reason: "locked" }],
		});
		expect(r.status).toBe("partial");
		expect(r.errors).toHaveLength(1);
	});

	it("failed sets the given outcome", () => {
		expect(failed("not_found", "No lead P-999").status).toBe("not_found");
		expect(failed("business_error", "Stage is closed").status).toBe("business_error");
	});

	it("repair returns a needs_repair envelope with the repair hint", () => {
		const r = repair("dueAt", "epoch ms", '"soon"', "use ISO or 'next Tuesday'", {
			dueAt: 1717577000000,
		});
		expect(r.status).toBe("needs_repair");
		expect(r.repair?.field).toBe("dueAt");
		expect(r.headline.length).toBeGreaterThan(0);
	});

	it("ask maps options to clickable suggestions", () => {
		const r = ask("Which Sara?", ["P-001", "P-002"]);
		expect(r.status).toBe("ambiguous");
		expect(r.suggestedNext).toEqual([
			{ label: "P-001", intent: "P-001" },
			{ label: "P-002", intent: "P-002" },
		]);
	});

	it("denied names the missing permission", () => {
		const r = denied("leads.delete");
		expect(r.status).toBe("denied");
		expect(r.headline).toContain("leads.delete");
	});
});

describe("registry", () => {
	const cap = defineCapability({
		name: "s0_test_capability",
		module: "test",
		group: "test",
		permission: null,
		risk: "safe",
		channels: ["chat"],
		spec: { whenToCall: "never — test only", goodExample: {} },
		drive: { onSuccess: "ok" },
		input: z.object({ q: z.string() }),
		run: async (_ctx, args) => ok({ headline: `got ${args.q}` }),
	});

	it("registers and looks up a capability", () => {
		expect(getCapability("s0_test_capability")).toBe(cap);
		expect(listCapabilities()).toContain(cap);
	});

	it("infers run args from the input schema", async () => {
		const result = await cap.run({} as never, { q: "hello" });
		expect(result.headline).toBe("got hello");
	});

	it("throws on a duplicate capability name", () => {
		expect(() =>
			defineCapability({
				name: "s0_test_capability",
				module: "test",
				group: "test",
				permission: null,
				risk: "safe",
				channels: ["chat"],
				spec: { whenToCall: "dup", goodExample: {} },
				drive: { onSuccess: "ok" },
				input: z.object({}),
				run: async () => ok({ headline: "dup" }),
			}),
		).toThrow(/Duplicate capability/);
		// Clean up so re-runs / other suites start fresh.
		REGISTRY.delete("s0_test_capability");
	});
});
