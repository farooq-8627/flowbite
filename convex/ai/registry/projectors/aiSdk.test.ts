/**
 * convex/ai/registry/projectors/aiSdk.test.ts — Stage S2
 *
 * Verifies the permissive-schema strategy: the SDK never rejects an LLM-emitted
 * argument before our wrapper runs, so a parse failure becomes a `repair`
 * envelope the model can self-correct from on the next step (instead of an
 * unrecoverable `TypeValidationError` surfaced as a hard error).
 */
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { defineCapability } from "../define";
import { ok } from "../result";
import type { Capability, CapabilityCtx } from "../types";
import { buildDescription, projectAll, projectCapability } from "./aiSdk";

function fakeCtx(): CapabilityCtx {
	return {
		ctx: {} as CapabilityCtx["ctx"],
		principal: {
			kind: "member",
			userId: "u" as unknown as CapabilityCtx["principal"]["userId"],
			orgId: "o" as unknown as CapabilityCtx["principal"]["orgId"],
			permissions: [],
			channel: "chat",
		},
	};
}

function makeCap(name: string, run: Capability["run"], extra?: Partial<Capability>): Capability {
	return defineCapability({
		name,
		module: "test",
		group: "test",
		permission: null,
		risk: "safe",
		channels: ["chat"],
		spec: {
			whenToCall: `Test capability "${name}".`,
			goodExample: { hello: "world" },
		},
		drive: { onSuccess: "ok" },
		input: z.object({ hello: z.string() }),
		run: run as Capability["run"],
		...extra,
	} as never);
}

describe("buildDescription", () => {
	it("embeds the spec — whenToCall + goodExample + synonyms", () => {
		// Manually construct (bypass defineCapability's dedup) so we don't pollute the registry.
		const cap = {
			name: "desc_test",
			module: "test",
			group: "test",
			permission: null,
			risk: "safe" as const,
			channels: ["chat" as const],
			spec: {
				whenToCall: "Search the CRM by name.",
				whenNotToCall: "you have a code.",
				requiredClarifications: ["query"],
				synonyms: ["find", "look up"],
				goodExample: { query: "Sara" },
				badExample: { args: { query: "P-001" }, why: "It's a code." },
			},
			drive: { onSuccess: "ok" },
			input: z.object({ query: z.string() }),
			run: async () => ok({ headline: "ok" }),
		} satisfies Capability;
		const description = buildDescription(cap);
		expect(description).toContain("Search the CRM by name.");
		expect(description).toContain("Do NOT call when: you have a code.");
		expect(description).toContain("`query`");
		expect(description).toContain('"find"');
		expect(description).toContain('"Sara"');
		expect(description).toContain("Anti-example");
		expect(description).toContain("It's a code.");
	});
});

describe("projectCapability", () => {
	it("returns an AI SDK Tool with the permissive passthrough schema", () => {
		const cap = makeCap("proj_perm", async () => ok({ headline: "ok" }));
		const tool = projectCapability(cap, fakeCtx);
		expect(tool).toBeDefined();
		expect((tool as { description?: string }).description).toContain("Test capability");
		// inputSchema is the loose passthrough — any shape parses.
		const schema = (tool as { inputSchema: z.ZodType }).inputSchema;
		expect(schema.safeParse({ anything: 1, more: "stuff" }).success).toBe(true);
		expect(schema.safeParse({}).success).toBe(true);
	});

	it("execute() returns an `ok` envelope verbatim on success", async () => {
		const cap = makeCap("proj_ok", async () => ok({ headline: "all good", facts: ["a"] }));
		const tool = projectCapability(cap, fakeCtx);
		const exec = (tool as { execute: (a: unknown, opts?: unknown) => Promise<unknown> })
			.execute;
		const result = await exec({ hello: "world" }, undefined);
		expect((result as { status: string }).status).toBe("ok");
		expect((result as { headline: string }).headline).toBe("all good");
		expect((result as { facts: string[] }).facts).toEqual(["a"]);
	});

	it("execute() turns a Zod parse failure into a `needs_repair` envelope", async () => {
		const cap = makeCap("proj_repair", async () => ok({ headline: "should not run" }));
		const tool = projectCapability(cap, fakeCtx);
		const exec = (tool as { execute: (a: unknown, opts?: unknown) => Promise<unknown> })
			.execute;
		// Strict schema requires `hello: string`. Pass a number → wrapper repairs.
		const result = (await exec({ hello: 42 }, undefined)) as {
			status: string;
			repair?: { field: string };
		};
		expect(result.status).toBe("needs_repair");
		expect(result.repair?.field).toBe("hello");
	});

	it("execute() never throws — wraps unexpected runtime errors as business_error", async () => {
		const cap = makeCap("proj_throws", async () => {
			throw new Error("kaboom");
		});
		const tool = projectCapability(cap, fakeCtx);
		const exec = (tool as { execute: (a: unknown, opts?: unknown) => Promise<unknown> })
			.execute;
		const result = (await exec({ hello: "world" }, undefined)) as { status: string };
		// `runCapability` classifies bare-Error throws as `business_error` (S1
		// taxonomy). The projector forwards that envelope to the model.
		expect(result.status).toBe("business_error");
	});
});

describe("projectAll", () => {
	it("returns a {name → Tool} map keyed by capability name", () => {
		const a = makeCap("proj_all_a", async () => ok({ headline: "a" }));
		const b = makeCap("proj_all_b", async () => ok({ headline: "b" }));
		const tools = projectAll([a, b], fakeCtx);
		expect(Object.keys(tools).sort()).toEqual(["proj_all_a", "proj_all_b"]);
		expect(tools.proj_all_a).toBeDefined();
		expect(tools.proj_all_b).toBeDefined();
	});
});
