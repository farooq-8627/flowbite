/**
 * Contract-test generator self-tests. Confirms the generator produces:
 *   - exactly one "goodExample parses" case per capability
 *   - one "ISO + epoch + natural-language" case per timestamp field
 *   - one "array + CSV + JSON-string" case per codeArray field
 *   - one "canRun denies without permission" case when permission != null
 *
 * Sanity-checks the `mockCapabilityCtx` + `assertResultShape` helpers so
 * domain test files can rely on them.
 */
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { coerceStringArray, coerceTimestamp, field } from "./coerce";
import {
	assertResultShape,
	buildContractCases,
	buildCoverageReport,
	mockPrincipal,
} from "./coverage";
import { defineCapability, REGISTRY } from "./define";
import { ok, repair } from "./result";
import type { Capability } from "./types";

// Reset between tests — each test owns its capability registrations.
function clearRegistry() {
	REGISTRY.clear();
}

describe("coverage.buildContractCases", () => {
	it("produces a goodExample-parses case for every capability", () => {
		clearRegistry();
		const cap = defineCapability({
			name: "test_only",
			module: "test",
			group: "test",
			permission: null,
			risk: "safe",
			channels: ["chat"],
			spec: {
				whenToCall: "test",
				goodExample: { name: "x" },
			},
			drive: { onSuccess: "ok" },
			input: z.object({ name: z.string().min(1) }),
			run: async () => ok({ headline: "ok" }),
		});
		const cases = buildContractCases(cap);
		const parseCase = cases.find((c) => c.name.includes("goodExample"));
		expect(parseCase).toBeDefined();
		// Should not throw for a valid example.
		expect(() => parseCase?.run()).not.toThrow();
	});

	it("emits a timestamp case when a field uses field.timestamp", () => {
		clearRegistry();
		const cap = defineCapability({
			name: "test_ts",
			module: "test",
			group: "test",
			permission: null,
			risk: "safe",
			channels: ["chat"],
			spec: {
				whenToCall: "test",
				goodExample: { dueAt: "2024-06-05T09:00:00.000Z" },
			},
			drive: { onSuccess: "ok" },
			input: z.object({ dueAt: field.timestamp("UTC") }),
			run: async () => ok({ headline: "ok" }),
		});
		const cases = buildContractCases(cap);
		const tsCase = cases.find((c) => c.name.includes("dueAt: accepts ISO"));
		expect(tsCase).toBeDefined();
	});

	it("emits a codeArray case when a field uses field.codeArray", () => {
		clearRegistry();
		const cap = defineCapability({
			name: "test_arr",
			module: "test",
			group: "test",
			permission: null,
			risk: "safe",
			channels: ["chat"],
			spec: {
				whenToCall: "test",
				goodExample: { tags: ["a", "b"] },
			},
			drive: { onSuccess: "ok" },
			input: z.object({ tags: field.codeArray() }),
			run: async () => ok({ headline: "ok" }),
		});
		const cases = buildContractCases(cap);
		const arrCase = cases.find((c) => c.name.includes("tags: accepts array"));
		expect(arrCase).toBeDefined();
		// Should not throw — coercion accepts CSV.
		expect(() => arrCase?.run()).not.toThrow();
	});

	it("emits a canRun case when permission != null", () => {
		clearRegistry();
		const cap = defineCapability({
			name: "test_perm",
			module: "test",
			group: "test",
			permission: "leads.create",
			risk: "reversible",
			channels: ["chat"],
			spec: {
				whenToCall: "test",
				goodExample: { name: "x" },
			},
			drive: { onSuccess: "ok" },
			input: z.object({ name: z.string() }),
			run: async () => ok({ headline: "ok" }),
		});
		const cases = buildContractCases(cap);
		const permCase = cases.find((c) => c.name.includes("canRun denies"));
		expect(permCase).toBeDefined();
		expect(() => permCase?.run()).not.toThrow();
	});

	it("omits the canRun case when permission is null", () => {
		clearRegistry();
		const cap = defineCapability({
			name: "test_no_perm",
			module: "test",
			group: "test",
			permission: null,
			risk: "safe",
			channels: ["chat"],
			spec: {
				whenToCall: "test",
				goodExample: { name: "x" },
			},
			drive: { onSuccess: "ok" },
			input: z.object({ name: z.string() }),
			run: async () => ok({ headline: "ok" }),
		});
		const cases = buildContractCases(cap);
		const permCase = cases.find((c) => c.name.includes("canRun denies"));
		expect(permCase).toBeUndefined();
	});
});

describe("coverage.assertResultShape", () => {
	it("passes for an ok envelope", () => {
		expect(() => assertResultShape(ok({ headline: "x" }), "test")).not.toThrow();
	});
	it("passes for a repair envelope", () => {
		const env = repair("foo", "string", "number", "use a string", { foo: "x" });
		expect(() => assertResultShape(env, "test")).not.toThrow();
	});
	it("throws on empty headline", () => {
		expect(() => assertResultShape({ status: "ok", headline: "" }, "test")).toThrow();
	});
	it("throws on unknown status", () => {
		expect(() =>
			assertResultShape(
				{ status: "weird" as Capability["risk"] as never, headline: "x" },
				"test",
			),
		).toThrow();
	});
});

describe("coverage.mockPrincipal", () => {
	it("default permissions empty", () => {
		const p = mockPrincipal();
		expect(p.permissions).toEqual([]);
		expect(p.kind).toBe("member");
		expect(p.channel).toBe("chat");
	});
	it("respects supplied permissions", () => {
		const p = mockPrincipal(["a", "b"]);
		expect(p.permissions).toEqual(["a", "b"]);
	});
});

describe("coverage — uses the real coercers", () => {
	// Smoke test the helpers the generator depends on, in case future
	// edits break the timestamp/codeArray contract surface.
	it("coerceTimestamp accepts ISO + natural", () => {
		expect(coerceTimestamp("2024-06-05T09:00:00.000Z", "UTC")).toBeTypeOf("number");
		expect(coerceTimestamp("next Tuesday", "UTC")).toBeTypeOf("number");
	});
	it("coerceStringArray accepts CSV", () => {
		expect(coerceStringArray("a,b,c")).toEqual(["a", "b", "c"]);
	});
});

describe("coverage.buildCoverageReport", () => {
	function defineCap(over: Partial<Capability> = {}): Capability {
		return {
			name: over.name ?? "test_cap",
			module: over.module ?? "test",
			group: over.group ?? "test",
			permission: over.permission ?? null,
			risk: over.risk ?? "safe",
			channels: over.channels ?? ["chat"],
			spec: {
				whenToCall: "test",
				goodExample: { name: "x" },
				...over.spec,
			},
			drive: { onSuccess: "ok", ...over.drive },
			input: over.input ?? z.object({ name: z.string() }),
			run: over.run ?? (async () => ok({ headline: "ok" })),
		};
	}

	it("computes per-module + per-group counts + risk + channel breakdown", () => {
		const caps: Capability[] = [
			defineCap({ name: "create_lead", module: "leads", group: "leads", risk: "reversible" }),
			defineCap({ name: "update_lead", module: "leads", group: "leads", risk: "reversible" }),
			defineCap({
				name: "delete_lead",
				module: "leads",
				group: "bulk",
				risk: "irreversible",
				channels: ["chat", "mcp"],
			}),
			defineCap({
				name: "create_deal",
				module: "deals",
				group: "deals",
				channels: ["chat", "whatsapp", "rest"],
			}),
		];
		const groups = new Set(["leads", "deals", "bulk"]);
		const report = buildCoverageReport(caps, groups);

		expect(report.summary.totalCaps).toBe(4);
		expect(report.summary.totalModules).toBe(2);
		expect(report.summary.totalGroups).toBe(3);
		expect(report.summary.missingPlaybooks).toEqual([]);
		expect(report.risksByTier).toEqual({ safe: 1, reversible: 2, irreversible: 1 });
		expect(report.channelCoverage.chat).toBe(4);
		expect(report.channelCoverage.whatsapp).toBe(1);
		expect(report.channelCoverage.mcp).toBe(1);
		expect(report.channelCoverage.rest).toBe(1);

		const leads = report.perModule.find((m) => m.module === "leads");
		expect(leads?.count).toBe(3);
		expect(leads?.groups.sort()).toEqual(["bulk", "leads"]);
		expect(leads?.risksByTier).toEqual({ safe: 0, reversible: 2, irreversible: 1 });

		const deals = report.perModule.find((m) => m.module === "deals");
		expect(deals?.count).toBe(1);
	});

	it("flags caps with empty goodExample as missingExamples", () => {
		const caps: Capability[] = [
			defineCap({
				name: "needs_example",
				spec: { whenToCall: "x", goodExample: {} },
			}),
			defineCap({ name: "has_example" }),
		];
		const report = buildCoverageReport(caps, new Set(["test"]));
		expect(report.summary.missingExamples).toBe(1);
		const m = report.perModule.find((m) => m.module === "test");
		expect(m?.missingExamples).toEqual(["needs_example"]);
		expect(m?.withGoodExample).toBe(1);
	});

	it("flags groups with no registered playbook as missingPlaybooks", () => {
		const caps: Capability[] = [
			defineCap({ name: "alpha", group: "groupA" }),
			defineCap({ name: "beta", group: "groupB" }),
		];
		// Only groupA has a registered playbook.
		const report = buildCoverageReport(caps, new Set(["groupA"]));
		expect(report.summary.missingPlaybooks).toEqual(["groupB"]);
	});

	it("counts withWhenNotToCall + withBadExample + withSynonyms accurately", () => {
		const caps: Capability[] = [
			defineCap({
				name: "rich",
				spec: {
					whenToCall: "x",
					whenNotToCall: "no",
					goodExample: { name: "x" },
					badExample: { args: { name: "" }, why: "empty" },
					synonyms: ["sample"],
					requiredClarifications: ["name"],
				},
			}),
			defineCap({ name: "bare" }),
		];
		const report = buildCoverageReport(caps, new Set(["test"]));
		expect(report.summary.withBadExample).toBe(1);
		expect(report.summary.withWhenNotToCall).toBe(1);
		const m = report.perModule.find((m) => m.module === "test");
		expect(m?.withSynonyms).toBe(1);
		expect(m?.withRequiredClarifications).toBe(1);
	});

	it("produces stable alphabetical ordering of perModule + perGroup", () => {
		const caps: Capability[] = [
			defineCap({ name: "z", module: "zoo", group: "zg" }),
			defineCap({ name: "a", module: "alpha", group: "ag" }),
			defineCap({ name: "m", module: "mid", group: "mg" }),
		];
		const report = buildCoverageReport(caps, new Set(["zg", "ag", "mg"]));
		expect(report.perModule.map((m) => m.module)).toEqual(["alpha", "mid", "zoo"]);
		expect(report.perGroup.map((g) => `${g.module}:${g.group}`)).toEqual([
			"alpha:ag",
			"mid:mg",
			"zoo:zg",
		]);
	});
});
