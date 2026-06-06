/**
 * convex/ai/registry/catalog.test.ts — Stage S2
 *
 * The catalog is the second half of the cacheable prefix — its rendering MUST
 * be deterministic (groups alphabetised, capabilities sorted within a group)
 * so Anthropic's prompt cache stays warm across turns.
 */
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { capabilitiesInGroups, groupCapabilities, listGroupKeys, renderCatalog } from "./catalog";
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

describe("groupCapabilities", () => {
	it("alphabetises by group key, then by capability name within a group", () => {
		const caps = [
			cap("zeta", "deals", "z deals"),
			cap("alpha", "deals", "a deals"),
			cap("beta", "leads", "b leads"),
			cap("alpha2", "leads", "a leads"),
		];
		const groups = groupCapabilities(caps);
		expect(groups.map((g) => g.group)).toEqual(["deals", "leads"]);
		expect(groups[0].capabilities.map((c) => c.name)).toEqual(["alpha", "zeta"]);
		expect(groups[1].capabilities.map((c) => c.name)).toEqual(["alpha2", "beta"]);
	});

	it("collapses multi-line whenToCall into a single line", () => {
		const caps = [cap("multi", "x", "a\n   b\n  c")];
		const groups = groupCapabilities(caps);
		expect(groups[0].capabilities[0].whenToCall).toBe("a b c");
	});
});

describe("renderCatalog", () => {
	it("emits a `## Capabilities` heading with group sections + bullet lines", () => {
		const caps = [cap("create_lead", "leads", "Make a new lead.")];
		const text = renderCatalog(caps);
		expect(text).toContain("## Capabilities");
		expect(text).toContain("### Leads");
		expect(text).toContain("- `create_lead` — Make a new lead.");
	});

	it("handles the empty registry without crashing", () => {
		expect(renderCatalog([])).toContain("(none registered)");
	});

	it("is deterministic across calls (cache stability)", () => {
		const caps = [
			cap("z_one", "a", "first"),
			cap("a_two", "z", "last"),
			cap("m_mid", "m", "middle"),
		];
		const a = renderCatalog(caps);
		const b = renderCatalog(caps);
		expect(a).toBe(b);
	});
});

describe("listGroupKeys / capabilitiesInGroups", () => {
	it("listGroupKeys returns alphabetised group keys", () => {
		const caps = [cap("x", "deals", ""), cap("y", "alpha", "")];
		expect(listGroupKeys(caps)).toEqual(["alpha", "deals"]);
	});

	it("capabilitiesInGroups filters in O(1)-set time", () => {
		const caps = [cap("x", "leads", ""), cap("y", "deals", ""), cap("z", "leads", "")];
		const filtered = capabilitiesInGroups(caps, ["leads"]);
		expect(filtered.map((c) => c.name).sort()).toEqual(["x", "z"]);
	});
});
