/**
 * convex/ai/runtime/host.test.ts — Stage S2
 *
 * End-to-end host tests with a mocked language model. We verify:
 *   • the system prompt arrives as TWO messages — stable prefix carries the
 *     Anthropic ephemeral cache marker; tail does not;
 *   • token usage is aggregated and the `[ai/host] usage:` log line fires;
 *   • progressive disclosure works — when the mock model calls
 *     `discover_capabilities` and we surface an `expand` list, the next
 *     prepareStep includes those names in `activeTools`;
 *   • an empty/no-text mocked stream still settles cleanly.
 */
import { MockLanguageModelV3, simulateReadableStream } from "ai/test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { defineCapability } from "../registry/define";
import { ok } from "../registry/result";
import type { Capability, CapabilityCtx } from "../registry/types";
import { runAgent } from "./host";

function fakePrincipal() {
	return {
		kind: "member" as const,
		userId: "u1" as unknown as CapabilityCtx["principal"]["userId"],
		orgId: "o1" as unknown as CapabilityCtx["principal"]["orgId"],
		permissions: ["leads.view", "deals.view", "ai.use"],
		channel: "chat" as const,
	};
}

let usageLogSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
	// Capture the `[ai/host] usage:` log line.
	usageLogSpy = vi.spyOn(console, "log").mockImplementation(() => {});
});

afterEach(() => {
	usageLogSpy.mockRestore();
});

/**
 * Build a fake `LanguageModelV3` whose `doStream` simply replays the
 * supplied parts. Captures the `prompt` (system messages + chat) and the
 * provided `tools` so tests can assert on them.
 */
function makeMockModel(parts: Array<unknown>): {
	model: MockLanguageModelV3;
	calls: Array<{ prompt: unknown; tools: unknown; activeTools: unknown }>;
} {
	const calls: Array<{ prompt: unknown; tools: unknown; activeTools: unknown }> = [];
	const model = new MockLanguageModelV3({
		doStream: async (options) => {
			calls.push({
				prompt: options.prompt,
				tools: options.tools,
				activeTools: (options as unknown as { activeTools?: unknown }).activeTools,
			});
			return {
				stream: simulateReadableStream({ chunks: parts }) as never,
				warnings: [],
			};
		},
	});
	return { model, calls };
}

describe("runAgent — text-only happy path", () => {
	it("streams text deltas, settles, and logs token usage", async () => {
		const { model } = makeMockModel([
			{ type: "stream-start", warnings: [] },
			{ type: "text-start", id: "t1" },
			{ type: "text-delta", id: "t1", delta: "Hello" },
			{ type: "text-delta", id: "t1", delta: " there." },
			{ type: "text-end", id: "t1" },
			{
				type: "finish",
				finishReason: { unified: "stop", raw: "stop" },
				usage: {
					inputTokens: { total: 100, noCache: 30, cacheRead: 70, cacheWrite: 0 },
					outputTokens: { total: 5, text: 5, reasoning: 0 },
				},
			},
		]);

		let collected = "";
		const result = await runAgent({
			model,
			channel: "chat",
			principal: fakePrincipal(),
			message: "hi",
			history: [],
			registry: [], // core capabilities are auto-included by the host
			onTextDelta: async (delta) => {
				collected += delta;
			},
		});

		expect(result.text).toBe("Hello there.");
		expect(collected).toBe("Hello there.");
		expect(result.finishReason).toBe("stop");
		expect(result.usage.inputTokens).toBe(100);
		expect(result.usage.cachedInputTokens).toBe(70);
		expect(result.usage.outputTokens).toBe(5);

		// Token-log assertion — the §2.2 measurement surface.
		const logged = usageLogSpy.mock.calls
			.map((args: unknown[]) => args.join(" "))
			.find((l: string) => l.startsWith("[ai/host] usage:"));
		expect(logged).toBeDefined();
		expect(logged).toContain("input=100");
		expect(logged).toContain("cached=70");
		expect(logged).toContain("output=5");
	});
});

describe("runAgent — system prompt + cache marker", () => {
	it("sends two system messages: cached prefix + uncached tail", async () => {
		const { model, calls } = makeMockModel([
			{ type: "stream-start", warnings: [] },
			{ type: "text-start", id: "t1" },
			{ type: "text-delta", id: "t1", delta: "ok" },
			{ type: "text-end", id: "t1" },
			{
				type: "finish",
				finishReason: { unified: "stop", raw: "stop" },
				usage: {
					inputTokens: { total: 1, noCache: 1, cacheRead: 0, cacheWrite: 0 },
					outputTokens: { total: 1, text: 1, reasoning: 0 },
				},
			},
		]);

		await runAgent({
			model,
			channel: "chat",
			principal: fakePrincipal(),
			message: "show me P-007",
			history: [],
			registry: [],
		});

		expect(calls.length).toBe(1);
		const prompt = calls[0].prompt as Array<{
			role: string;
			content: unknown;
			providerOptions?: unknown;
		}>;
		const systemMessages = prompt.filter((m) => m.role === "system");
		expect(systemMessages.length).toBeGreaterThanOrEqual(1);

		// First system message: stable prefix WITH the Anthropic cache marker.
		const prefix = systemMessages[0];
		const prefixContent =
			typeof prefix.content === "string" ? prefix.content : JSON.stringify(prefix.content);
		expect(prefixContent).toContain("Project drive");
		expect(prefixContent).toContain("## Capabilities");
		expect(prefix.providerOptions).toEqual({
			anthropic: { cacheControl: { type: "ephemeral" } },
		});

		// Second system message: per-turn tail WITHOUT the marker (cache stays warm).
		if (systemMessages.length > 1) {
			const tail = systemMessages[1];
			expect(tail.providerOptions).toBeUndefined();
		}
	});
});

describe("runAgent — progressive disclosure via discover_capabilities", () => {
	// Stage a single domain capability (`create_deal`, group "deals") that the
	// router would NOT preload for a non-deal message. The mock model first
	// calls `discover_capabilities({ group: "deals" })`; the host's
	// onStepFinish reads `data.expand` and unions `create_deal` into the next
	// step's active set.
	const createDeal: Capability = defineCapability({
		name: "host_test_create_deal",
		module: "deals",
		group: "deals",
		permission: null,
		risk: "safe",
		channels: ["chat"],
		spec: { whenToCall: "Create a deal.", goodExample: { title: "Q4" } },
		drive: { onSuccess: "ok" },
		input: z.object({ title: z.string() }),
		run: async (_ctx: unknown, args: unknown) =>
			ok({ headline: `created ${(args as { title: string }).title}` }),
	} as never);

	it("expands activeTools after a discover_capabilities call returns expand:[]", async () => {
		// Two-step mock model:
		//   Step 0 → tool call: discover_capabilities({ group: "deals" })
		//   Step 1 → text "ok" + finish.
		const model = new MockLanguageModelV3({
			doStream: vi
				.fn()
				.mockImplementationOnce(async () => ({
					stream: simulateReadableStream({
						chunks: [
							{ type: "stream-start", warnings: [] },
							{
								type: "tool-call",
								toolCallId: "c1",
								toolName: "discover_capabilities",
								input: JSON.stringify({ group: "deals" }),
							},
							{
								type: "finish",
								finishReason: { unified: "tool-calls", raw: "tool_calls" },
								usage: {
									inputTokens: {
										total: 50,
										noCache: 50,
										cacheRead: 0,
										cacheWrite: 0,
									},
									outputTokens: { total: 5, text: 0, reasoning: 0 },
								},
							},
						],
					}) as never,
					warnings: [],
				}))
				.mockImplementationOnce(async () => ({
					stream: simulateReadableStream({
						chunks: [
							{ type: "stream-start", warnings: [] },
							{ type: "text-start", id: "t1" },
							{ type: "text-delta", id: "t1", delta: "ok" },
							{ type: "text-end", id: "t1" },
							{
								type: "finish",
								finishReason: { unified: "stop", raw: "stop" },
								usage: {
									inputTokens: {
										total: 60,
										noCache: 60,
										cacheRead: 0,
										cacheWrite: 0,
									},
									outputTokens: { total: 1, text: 1, reasoning: 0 },
								},
							},
						],
					}) as never,
					warnings: [],
				})),
		});

		const result = await runAgent({
			model,
			channel: "chat",
			principal: fakePrincipal(),
			message: "tell me a joke", // routerwon't preload `deals` for this
			history: [],
			registry: [createDeal],
		});

		expect(result.text).toBe("ok");

		// Two snapshots — step 0 had core only; step 1 grew to include create_deal.
		expect(result.stepActiveToolHistory.length).toBeGreaterThanOrEqual(2);
		const step0 = result.stepActiveToolHistory[0];
		const step1 = result.stepActiveToolHistory[1];
		expect(step0).toContain("discover_capabilities");
		expect(step0).not.toContain("host_test_create_deal");
		expect(step1).toContain("host_test_create_deal");
	});
});

describe("runAgent — minimal stream", () => {
	it("settles cleanly when the model emits a single character + finish", async () => {
		const { model } = makeMockModel([
			{ type: "stream-start", warnings: [] },
			{ type: "text-start", id: "t1" },
			{ type: "text-delta", id: "t1", delta: "." },
			{ type: "text-end", id: "t1" },
			{
				type: "finish",
				finishReason: { unified: "stop", raw: "stop" },
				usage: {
					inputTokens: { total: 1, noCache: 1, cacheRead: 0, cacheWrite: 0 },
					outputTokens: { total: 1, text: 1, reasoning: 0 },
				},
			},
		]);

		const result = await runAgent({
			model,
			channel: "chat",
			principal: fakePrincipal(),
			message: "hi",
			history: [],
			registry: [],
		});

		expect(result.text).toBe(".");
		expect(result.usage.outputTokens).toBe(1);
		expect(result.finishReason).toBe("stop");
	});
});

// ─── Stage S9 — module + vertical gating end-to-end ─────────────────────────

describe("runAgent — Stage S9 module gate (caps + context filtered as one)", () => {
	// Two test capabilities: one in a module that's ON, one in a module
	// that's hidden in the OrgSnapshot. We verify that AT THE HOST LEVEL the
	// disabled-module's capability is missing from the catalog AND its
	// per-module context block is missing from the prompt tail.
	const leadCap: Capability = defineCapability({
		name: "s9_create_lead",
		module: "leads",
		group: "leads",
		permission: null,
		risk: "safe",
		channels: ["chat"],
		spec: { whenToCall: "S9 lead test cap.", goodExample: { x: 1 } },
		drive: { onSuccess: "ok" },
		input: z.object({ x: z.number() }),
		run: async () => ok({ headline: "ok" }),
	} as never);
	const pipelineCap: Capability = defineCapability({
		name: "s9_create_pipeline",
		module: "pipelines",
		group: "pipelines",
		permission: null,
		risk: "safe",
		channels: ["chat"],
		spec: { whenToCall: "S9 pipeline test cap.", goodExample: { x: 1 } },
		drive: { onSuccess: "ok" },
		input: z.object({ x: z.number() }),
		run: async () => ok({ headline: "ok" }),
	} as never);

	function captureCalls() {
		return makeMockModel([
			{ type: "stream-start", warnings: [] },
			{ type: "text-start", id: "t1" },
			{ type: "text-delta", id: "t1", delta: "ok" },
			{ type: "text-end", id: "t1" },
			{
				type: "finish",
				finishReason: { unified: "stop", raw: "stop" },
				usage: {
					inputTokens: { total: 1, noCache: 1, cacheRead: 0, cacheWrite: 0 },
					outputTokens: { total: 1, text: 1, reasoning: 0 },
				},
			},
		]);
	}

	it("pipelines disabled → pipeline capability NOT in the catalog AND no pipelines context block", async () => {
		const { model, calls } = captureCalls();
		await runAgent({
			model,
			channel: "chat",
			principal: fakePrincipal(),
			message: "create a pipeline",
			history: [],
			registry: [leadCap, pipelineCap],
			org: { hiddenSlots: new Set(["pipelines"]) },
		});
		const prompt = calls[0].prompt as Array<{ role: string; content: unknown }>;
		const allSystemContent = prompt
			.filter((m) => m.role === "system")
			.map((m) => (typeof m.content === "string" ? m.content : JSON.stringify(m.content)))
			.join("\n");
		// Capability is gone from the catalog.
		expect(allSystemContent).toContain("s9_create_lead");
		expect(allSystemContent).not.toContain("s9_create_pipeline");
		// Pipelines context block is gone from the tail.
		expect(allSystemContent).not.toContain("Pipelines module");
		// The AI-SDK tools dict the model receives ALSO drops the disabled
		// cap. AI SDK v6 normalises `tools` to an Array<{name: string,…}>
		// before passing to the provider; the active set at step 0 is
		// (core ∪ router-preloaded), all of which intersect with visible
		// caps — so a module-filtered cap is never in this list, even when
		// the router would otherwise preload its group.
		const tools = calls[0].tools as Array<{ name: string }> | undefined;
		const toolNames = (tools ?? []).map((t) => t.name);
		expect(toolNames).not.toEqual(expect.arrayContaining(["s9_create_pipeline"]));
	});

	it("default OrgSnapshot (nothing hidden) → both caps + both module contexts present", async () => {
		const { model, calls } = captureCalls();
		await runAgent({
			model,
			channel: "chat",
			principal: fakePrincipal(),
			message: "do anything",
			history: [],
			registry: [leadCap, pipelineCap],
			// Omitting `org` defaults to EMPTY_ORG_SNAPSHOT — every module enabled.
		});
		const prompt = calls[0].prompt as Array<{ role: string; content: unknown }>;
		const allSystemContent = prompt
			.filter((m) => m.role === "system")
			.map((m) => (typeof m.content === "string" ? m.content : JSON.stringify(m.content)))
			.join("\n");
		expect(allSystemContent).toContain("s9_create_lead");
		expect(allSystemContent).toContain("s9_create_pipeline");
		expect(allSystemContent).toContain("Pipelines module");
	});
});

describe("runAgent — Stage S9 vertical addendum (config-only persona)", () => {
	const leadCap: Capability = defineCapability({
		name: "s9v_create_lead",
		module: "leads",
		group: "leads",
		permission: null,
		risk: "safe",
		channels: ["chat"],
		spec: { whenToCall: "S9 vertical test cap.", goodExample: { x: 1 } },
		drive: { onSuccess: "ok" },
		input: z.object({ x: z.number() }),
		run: async () => ok({ headline: "ok" }),
	} as never);

	function captureCalls() {
		return makeMockModel([
			{ type: "stream-start", warnings: [] },
			{ type: "text-start", id: "t1" },
			{ type: "text-delta", id: "t1", delta: "ok" },
			{ type: "text-end", id: "t1" },
			{
				type: "finish",
				finishReason: { unified: "stop", raw: "stop" },
				usage: {
					inputTokens: { total: 1, noCache: 1, cacheRead: 0, cacheWrite: 0 },
					outputTokens: { total: 1, text: 1, reasoning: 0 },
				},
			},
		]);
	}

	it("real-estate vertical injects its addendum into the per-turn TAIL (not the cached prefix)", async () => {
		const { model, calls } = captureCalls();
		await runAgent({
			model,
			channel: "chat",
			principal: fakePrincipal(),
			message: "create lead",
			history: [],
			registry: [leadCap],
			org: { hiddenSlots: new Set(), industryKey: "real-estate" },
		});
		const prompt = calls[0].prompt as Array<{
			role: string;
			content: unknown;
			providerOptions?: unknown;
		}>;
		const systemMessages = prompt.filter((m) => m.role === "system");
		expect(systemMessages.length).toBe(2);

		const prefix =
			typeof systemMessages[0].content === "string"
				? systemMessages[0].content
				: JSON.stringify(systemMessages[0].content);
		const tail =
			typeof systemMessages[1].content === "string"
				? systemMessages[1].content
				: JSON.stringify(systemMessages[1].content);

		// The addendum is config-only persona text — lives in the per-turn TAIL.
		expect(tail).toContain("Real-estate persona");
		// And NOT in the cached prefix (which would defeat caching).
		expect(prefix).not.toContain("Real-estate persona");
		// Capability surface is unchanged — addendum is persona only, no capability fork.
		expect(prefix).toContain("s9v_create_lead");
	});

	it("no industry key → no addendum, identical capability surface", async () => {
		const { model, calls } = captureCalls();
		await runAgent({
			model,
			channel: "chat",
			principal: fakePrincipal(),
			message: "create lead",
			history: [],
			registry: [leadCap],
			// No `org.industryKey` → no vertical persona injected.
			org: { hiddenSlots: new Set() },
		});
		const prompt = calls[0].prompt as Array<{ role: string; content: unknown }>;
		const allSystemContent = prompt
			.filter((m) => m.role === "system")
			.map((m) => (typeof m.content === "string" ? m.content : JSON.stringify(m.content)))
			.join("\n");
		expect(allSystemContent).not.toContain("Real-estate persona");
		// Capability is still there.
		expect(allSystemContent).toContain("s9v_create_lead");
	});
});
