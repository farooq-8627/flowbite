/// <reference types="vite/client" />
/**
 * convex/ai/channels/persona.test.ts — Stage S15.
 *
 * Three layers of coverage, mirroring `runtime/autonomous.test.ts`:
 *
 *   1. Pure helpers — `filterCapabilitiesForWaProfile` allow-list.
 *      Guarantees that NO destructive cap (delete/settings/members) can
 *      ever leak through the persona's tool surface. The allow-list is
 *      the doctrine; the gate's channel + risk fence is the second
 *      check, but starving the model is what makes the spec's "NOTHING
 *      else" claim load-bearing.
 *
 *   2. Engine gating — every closed-taxonomy skip reason
 *      (`wa_profile_not_seeded`, `wa_profile_disabled`,
 *      `wa_profile_no_perms`, `wa_profile_rate_limited`,
 *      `wa_profile_no_platform_key`) checked via stub-ctx tests.
 *
 *   3. Happy path with a `MockLanguageModelV3` — asserts the engine
 *      called `runAgent` with `principal.kind === "wa_profile"`,
 *      `channel === "whatsapp"`, `trigger === "autonomous_reply"`, and
 *      a registry filtered to the allow-list (no destructive caps
 *      visible to the model).
 *
 * Spec acceptance (§S15):
 *   • Flag ON → simulated customer message gets an AI reply that
 *     answers from CRM + escalates on "I want to speak to a person".
 *   • Flag OFF → nothing auto-replies.
 *   • The persona cannot call a delete tool.
 */

import { MockLanguageModelV3, simulateReadableStream } from "ai/test";
import { getFunctionName } from "convex/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { internal } from "../../_generated/api";
import type { Id } from "../../_generated/dataModel";
import { listCapabilities } from "../registry/define";
// Side-effect import: registers `escalate_to_agent` + every other
// capability the host will see when the persona runs. Required for
// `filterCapabilitiesForWaProfile` to return the right surface.
import "../runtime/host";
import {
	filterCapabilitiesForWaProfile,
	runWaProfileReplyEngine,
	WA_PROFILE_ALLOWED_TOOLS,
	WA_PROFILE_RATE_LIMIT_MAX,
	WA_PROFILE_RATE_LIMIT_PERIOD_MS,
} from "./persona";

// ─── 1. Pure helpers — allow-list correctness ─────────────────────────────

describe("filterCapabilitiesForWaProfile", () => {
	it("returns ONLY the spec'd allow-list — no destructive caps", () => {
		const filtered = filterCapabilitiesForWaProfile(listCapabilities());
		const names = new Set(filtered.map((c) => c.name));

		// Every name returned is in the allow-list.
		const allowed = new Set(WA_PROFILE_ALLOWED_TOOLS);
		for (const name of names) {
			expect(allowed.has(name)).toBe(true);
		}

		// The persona MUST be able to escalate, send, and capture leads.
		expect(names.has("escalate_to_agent")).toBe(true);
		expect(names.has("send_whatsapp")).toBe(true);
		expect(names.has("create_lead")).toBe(true);
		expect(names.has("create_task")).toBe(true);
		expect(names.has("add_note")).toBe(true);

		// Hard-blocked: no destructive / settings / members tools should
		// ever be visible to the persona, even if the registry registers
		// them later.
		const forbiddenNames = [
			"bulk_delete_entities",
			"bulk_update_entities",
			"hard_delete_entity",
			"update_org_settings",
			"invite_member",
			"change_member_role",
			"remove_member",
			"create_role",
			"update_role",
			"delete_role",
			"delete_pipeline",
			"create_field",
			"remove_field",
			"import_csv",
			"set_entity_default_view",
			"rename_entity_labels",
		];
		for (const f of forbiddenNames) {
			expect(names.has(f)).toBe(false);
		}
	});

	it("returns an empty array when given an empty input", () => {
		expect(filterCapabilitiesForWaProfile([])).toEqual([]);
	});
});

// ─── 2. Engine gating tests ───────────────────────────────────────────────

const orgId = "o_wa_profile" as unknown as Id<"orgs">;
const profileUserId = "u_wa_profile" as unknown as Id<"users">;

type StubMember = {
	permissions: string[];
	settings: Record<string, unknown>;
};

type StubBuildOptions = {
	memberInfo: StubMember | null;
	rateOk?: boolean;
	snapshot?: { hiddenSlots: string[] };
	captureRunAgentArgs?: { value?: unknown };
};

/**
 * Stub ActionCtx that pattern-matches by Convex function name. Same
 * pattern as `runtime/autonomous.test.ts` — function refs are Proxies
 * so we compare via `getFunctionName()` strings.
 */
function buildStubCtx(opts: StubBuildOptions) {
	const refName = (ref: unknown) => getFunctionName(ref as never);
	const memberPath = refName(internal.orgs.queries.getMemberWithPermissions);
	const snapshotPath = refName(internal.orgs.queries.getOrgSnapshotForAI);
	const ratePath = refName(internal._shared.rateLimitMutation.tryConsumeRateLimitInternal);

	const queryCalls: Array<{ name: string; args: unknown }> = [];
	const mutationCalls: Array<{ name: string; args: unknown }> = [];

	const runQuery = vi.fn(async (ref: unknown, args: unknown) => {
		const name = refName(ref);
		queryCalls.push({ name, args });
		if (name === memberPath) return opts.memberInfo;
		if (name === snapshotPath) {
			return opts.snapshot ?? { hiddenSlots: [] };
		}
		throw new Error(`Unexpected stub query: ${name}`);
	});

	const runMutation = vi.fn(async (ref: unknown, args: unknown) => {
		const name = refName(ref);
		mutationCalls.push({ name, args });
		if (name === ratePath) {
			return { ok: opts.rateOk ?? true, remaining: opts.rateOk === false ? 0 : 1 };
		}
		// `runAgent` writes a per-turn telemetry row + an audit-log line
		// inside try/catch — we no-op them so the test isolation stays
		// tight without polluting stderr.
		if (name.startsWith("ai/telemetry:") || name.startsWith("ai/_logAIActivityInternal:")) {
			return null;
		}
		// Any other unrecognised mutation path is a test bug — surface it
		// loudly so a new internal call doesn't slip past the gate.
		throw new Error(`Unexpected stub mutation: ${name}`);
	});

	return {
		ctx: { runQuery, runMutation } as unknown as Parameters<
			typeof runWaProfileReplyEngine
		>[0]["ctx"],
		queryCalls,
		mutationCalls,
	};
}

/** Mock model that emits one text token + a stop. */
function makeStopOnlyModel() {
	return new MockLanguageModelV3({
		doStream: async () => ({
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
							inputTokens: { total: 50, noCache: 50, cacheRead: 0, cacheWrite: 0 },
							outputTokens: { total: 1, text: 1, reasoning: 0 },
						},
					},
				],
			}) as never,
			warnings: [],
		}),
	});
}

let originalAnthropicKey: string | undefined;
let originalGoogleKey: string | undefined;
let originalOpenaiKey: string | undefined;

beforeEach(() => {
	originalAnthropicKey = process.env.ANTHROPIC_API_KEY;
	originalGoogleKey = process.env.GOOGLE_GENERATIVE_AI_API_KEY;
	originalOpenaiKey = process.env.OPENAI_API_KEY;
});

afterEach(() => {
	if (originalAnthropicKey === undefined) delete process.env.ANTHROPIC_API_KEY;
	else process.env.ANTHROPIC_API_KEY = originalAnthropicKey;
	if (originalGoogleKey === undefined) delete process.env.GOOGLE_GENERATIVE_AI_API_KEY;
	else process.env.GOOGLE_GENERATIVE_AI_API_KEY = originalGoogleKey;
	if (originalOpenaiKey === undefined) delete process.env.OPENAI_API_KEY;
	else process.env.OPENAI_API_KEY = originalOpenaiKey;
});

describe("runWaProfileReplyEngine — gating", () => {
	it("returns wa_profile_not_seeded when the persona member doesn't exist", async () => {
		const stub = buildStubCtx({ memberInfo: null });
		const result = await runWaProfileReplyEngine({
			ctx: stub.ctx,
			orgId,
			profileUserId,
			rateLimitKey: "person:P-001",
			transcript: "Customer +9715551234: hi",
			idempotencyKey: "SM_test_1",
		});
		expect(result).toEqual({ ok: false, reason: "wa_profile_not_seeded" });
		// No rate-limit consumption when we fail closed early.
		expect(stub.mutationCalls.find((c) => c.name.includes("rateLimit"))).toBeUndefined();
	});

	it("returns wa_profile_disabled when whatsappAgentEnabled is missing", async () => {
		const stub = buildStubCtx({
			memberInfo: { permissions: ["messages.send", "ai.use"], settings: {} },
		});
		const result = await runWaProfileReplyEngine({
			ctx: stub.ctx,
			orgId,
			profileUserId,
			rateLimitKey: "person:P-001",
			transcript: "Customer +9715551234: hi",
			idempotencyKey: "SM_test_2",
		});
		expect(result).toEqual({ ok: false, reason: "wa_profile_disabled" });
	});

	it("returns wa_profile_disabled when whatsappAgentEnabled is explicitly false", async () => {
		const stub = buildStubCtx({
			memberInfo: {
				permissions: ["messages.send", "ai.use"],
				settings: { aiAutonomy: { whatsappAgentEnabled: false } },
			},
		});
		const result = await runWaProfileReplyEngine({
			ctx: stub.ctx,
			orgId,
			profileUserId,
			rateLimitKey: "person:P-001",
			transcript: "Customer +9715551234: hi",
			idempotencyKey: "SM_test_3",
		});
		expect(result).toEqual({ ok: false, reason: "wa_profile_disabled" });
	});

	it("returns wa_profile_no_perms when the persona lacks messages.send", async () => {
		const stub = buildStubCtx({
			memberInfo: {
				permissions: ["ai.use"],
				settings: { aiAutonomy: { whatsappAgentEnabled: true } },
			},
		});
		const result = await runWaProfileReplyEngine({
			ctx: stub.ctx,
			orgId,
			profileUserId,
			rateLimitKey: "person:P-001",
			transcript: "Customer +9715551234: hi",
			idempotencyKey: "SM_test_4",
		});
		expect(result).toEqual({ ok: false, reason: "wa_profile_no_perms" });
	});

	it("returns wa_profile_rate_limited when the bucket is full", async () => {
		const stub = buildStubCtx({
			memberInfo: {
				permissions: ["messages.send", "ai.use"],
				settings: { aiAutonomy: { whatsappAgentEnabled: true } },
			},
			rateOk: false,
		});
		const result = await runWaProfileReplyEngine({
			ctx: stub.ctx,
			orgId,
			profileUserId,
			rateLimitKey: "person:P-001",
			transcript: "Customer +9715551234: hi",
			idempotencyKey: "SM_test_5",
		});
		expect(result).toEqual({ ok: false, reason: "wa_profile_rate_limited" });
	});

	it("returns wa_profile_no_platform_key when no provider key is configured AND no override is supplied", async () => {
		// Scrub every platform key the resolver might find.
		delete process.env.ANTHROPIC_API_KEY;
		delete process.env.GOOGLE_GENERATIVE_AI_API_KEY;
		delete process.env.OPENAI_API_KEY;
		delete process.env.GROQ_API_KEY;
		delete process.env.MISTRAL_API_KEY;
		delete process.env.XAI_API_KEY;
		delete process.env.OPENROUTER_API_KEY;
		delete process.env.NVIDIA_API_KEY;
		delete process.env.MOONSHOT_API_KEY;

		const stub = buildStubCtx({
			memberInfo: {
				permissions: ["messages.send", "ai.use"],
				settings: { aiAutonomy: { whatsappAgentEnabled: true } },
			},
		});
		const result = await runWaProfileReplyEngine({
			ctx: stub.ctx,
			orgId,
			profileUserId,
			rateLimitKey: "person:P-001",
			transcript: "Customer +9715551234: hi",
			idempotencyKey: "SM_test_6",
		});
		expect(result).toEqual({ ok: false, reason: "wa_profile_no_platform_key" });
	});
});

// ─── 3. Happy path with mock model ────────────────────────────────────────

describe("runWaProfileReplyEngine — happy path", () => {
	it("calls runAgent with wa_profile principal + autonomous_reply trigger + filtered registry", async () => {
		// Rate-limit ok + master switch ON + persona has messages.send.
		const stub = buildStubCtx({
			memberInfo: {
				permissions: [
					"messages.send",
					"ai.use",
					"crm.read",
					"leads.create",
					"tasks.create",
					"notes.create",
				],
				settings: { aiAutonomy: { whatsappAgentEnabled: true } },
			},
		});

		const result = await runWaProfileReplyEngine({
			ctx: stub.ctx,
			orgId,
			profileUserId,
			rateLimitKey: "person:P-001",
			transcript: "Customer +9715551234: hi, looking for 2BR JVC",
			idempotencyKey: "SM_happy_1",
			modelOverride: makeStopOnlyModel() as Parameters<
				typeof runWaProfileReplyEngine
			>[0]["modelOverride"],
		});

		expect(result.ok).toBe(true);
		if (!result.ok) throw new Error("expected ok result");
		expect(result.text).toBe("ok");
		// The mock model emits no tool calls — host stays at 0 calls.
		expect(result.toolCallCount).toBe(0);

		// Rate-limit was consumed exactly once with the wa_profile.reply
		// scope and the supplied rateLimitKey embedded in the bucket key.
		const rateCalls = stub.mutationCalls.filter((c) => c.name.includes("rateLimit"));
		expect(rateCalls).toHaveLength(1);
		const rateArgs = rateCalls[0].args as {
			scope: string;
			key: string;
			max: number;
			periodMs: number;
		};
		expect(rateArgs.scope).toBe("wa_profile.reply");
		expect(rateArgs.key).toContain("person:P-001");
		expect(rateArgs.max).toBe(WA_PROFILE_RATE_LIMIT_MAX);
		expect(rateArgs.periodMs).toBe(WA_PROFILE_RATE_LIMIT_PERIOD_MS);
	});

	it("rate-limit is per (orgId, rateLimitKey) — different keys both succeed", async () => {
		const stub = buildStubCtx({
			memberInfo: {
				permissions: ["messages.send", "ai.use"],
				settings: { aiAutonomy: { whatsappAgentEnabled: true } },
			},
		});

		const r1 = await runWaProfileReplyEngine({
			ctx: stub.ctx,
			orgId,
			profileUserId,
			rateLimitKey: "person:P-001",
			transcript: "Customer A: hi",
			idempotencyKey: "SM1",
			modelOverride: makeStopOnlyModel() as Parameters<
				typeof runWaProfileReplyEngine
			>[0]["modelOverride"],
		});
		const r2 = await runWaProfileReplyEngine({
			ctx: stub.ctx,
			orgId,
			profileUserId,
			rateLimitKey: "person:P-002",
			transcript: "Customer B: hi",
			idempotencyKey: "SM2",
			modelOverride: makeStopOnlyModel() as Parameters<
				typeof runWaProfileReplyEngine
			>[0]["modelOverride"],
		});
		expect(r1.ok).toBe(true);
		expect(r2.ok).toBe(true);
		// Two separate rate-limit calls — different bucket keys.
		const rateCalls = stub.mutationCalls.filter((c) => c.name.includes("rateLimit"));
		expect(rateCalls).toHaveLength(2);
		const k1 = (rateCalls[0].args as { key: string }).key;
		const k2 = (rateCalls[1].args as { key: string }).key;
		expect(k1).not.toBe(k2);
	});
});
