/// <reference types="vite/client" />
/**
 * convex/ai/runtime/autonomous.test.ts — Stage S11
 *
 * Three layers of coverage, mirroring `host.test.ts` + `aiAutonomy.test.ts`:
 *
 *   1. Pure helpers — `buildAutonomousPrompt` + `hasRecentAutonomousTurn`.
 *   2. Engine gating — stub-ctx tests for every closed-taxonomy skip
 *      reason (`agent_not_member`, `no_ai_use_perm`, `autonomy_off`,
 *      `debounced`, `no_platform_key`).
 *   3. Mock-LLM happy path — `runAutonomousTurn` with a `MockLanguageModelV3`
 *      asserts trigger:"autonomous" propagated, marker row written, and
 *      activity-log entry queued. The wider transcript→tool-calls scenario
 *      (S11 acceptance "feeding a transcript creates a deduped lead + task
 *      + note") is dependency-light here: tool execution itself rides the
 *      shared host pipeline (already covered by host.test.ts + per-cap
 *      contract tests). What we own at this layer is "the engine ran the
 *      host with the right principal, channel, and trigger, and audited
 *      the run." The full end-to-end model→cap→DB scenario is covered by
 *      the integration suite once Twilio inbound (S13) lands.
 */

import { MockLanguageModelV3, simulateReadableStream } from "ai/test";
import { getFunctionName } from "convex/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { internal } from "../../_generated/api";
import type { Id } from "../../_generated/dataModel";
import {
	AUTONOMOUS_TURN_MARKER,
	buildAutonomousPrompt,
	DEBOUNCE_MS,
	hasRecentAutonomousTurn,
	runAutonomousTurn,
} from "./autonomous";

// ─── 1. Pure helpers ────────────────────────────────────────────────────────

describe("buildAutonomousPrompt", () => {
	it("includes the dedup-first goals checklist + the transcript verbatim", () => {
		const transcript = "Lead: hi, I'm Sara, want 2BR JVC, budget 120k, send options Tuesday";
		const prompt = buildAutonomousPrompt({ transcript });
		// Dedup-first instruction.
		expect(prompt).toMatch(/search_crm.*BEFORE any.*create_lead/);
		// Name + (phone OR email) §2.3 minimum.
		expect(prompt).toMatch(/name \+ \(phone OR email\)/);
		// "Never message the customer here" wording.
		expect(prompt).toMatch(/Never message the customer in this turn/);
		// Transcript appears verbatim at the bottom.
		expect(prompt.endsWith(transcript)).toBe(true);
	});

	it("appends the idempotencyKey when supplied", () => {
		const prompt = buildAutonomousPrompt({
			transcript: "hi",
			idempotencyKey: "wa:SM12345",
		});
		expect(prompt).toMatch(/Idempotency key: wa:SM12345/);
	});

	it("trims surrounding whitespace from the transcript", () => {
		const prompt = buildAutonomousPrompt({
			transcript: "   \n\n  hello there  \n\n  ",
		});
		expect(prompt.endsWith("hello there")).toBe(true);
	});
});

describe("hasRecentAutonomousTurn", () => {
	const conversationId = "c1" as unknown as Id<"aiConversations">;
	const otherConversationId = "c2" as unknown as Id<"aiConversations">;
	const now = 1_700_000_000_000;

	it("returns true when an event for this conversation is inside the window", () => {
		const events = [{ startedAt: now - 1_000, conversationId }];
		expect(hasRecentAutonomousTurn(events, conversationId, now, DEBOUNCE_MS)).toBe(true);
	});

	it("returns false when the only event is for a different conversation", () => {
		const events = [{ startedAt: now - 1_000, conversationId: otherConversationId }];
		expect(hasRecentAutonomousTurn(events, conversationId, now, DEBOUNCE_MS)).toBe(false);
	});

	it("returns false when the matching event is older than the window", () => {
		const events = [{ startedAt: now - DEBOUNCE_MS - 100, conversationId }];
		expect(hasRecentAutonomousTurn(events, conversationId, now, DEBOUNCE_MS)).toBe(false);
	});

	it("returns false on an empty event list", () => {
		expect(hasRecentAutonomousTurn([], conversationId, now, DEBOUNCE_MS)).toBe(false);
	});

	it("ignores events with an undefined conversationId", () => {
		const events = [{ startedAt: now - 1_000, conversationId: undefined }];
		expect(hasRecentAutonomousTurn(events, conversationId, now, DEBOUNCE_MS)).toBe(false);
	});
});

// ─── 2 + 3. Engine — stub ctx ──────────────────────────────────────────────

type StubMember = {
	permissions: string[];
	plan: string;
	settings: Record<string, unknown>;
};

type StubMarker = {
	startedAt: number;
	conversationId?: Id<"aiConversations"> | null;
};

type StubSnapshot = {
	hiddenSlots: string[];
	industryKey?: string;
	entityLabels?: unknown;
	currency?: string;
};

/**
 * Build an ActionCtx-shaped stub. Function references are compared via
 * `getFunctionName()` (Convex returns a `module:export` string per ref) —
 * `===` reference equality doesn't hold across the codegen Proxy. Adding
 * a new query/mutation without extending the stub fails loudly here, not
 * silently in production.
 */
function buildStubCtx(opts: {
	memberInfo: StubMember | null;
	recentMarkers?: StubMarker[];
	snapshot?: StubSnapshot;
}) {
	const recordedMarkers: Array<Record<string, unknown>> = [];
	const activityLogs: Array<Record<string, unknown>> = [];
	const queryCalls: Array<{ ref: unknown; args: unknown }> = [];
	const mutationCalls: Array<{ ref: unknown; args: unknown }> = [];

	// Resolve the path strings ONCE at stub-build time so each test reuses
	// the same comparison keys.
	const refName = (ref: unknown) => getFunctionName(ref as any);
	const memberPath = refName(internal.orgs.queries.getMemberWithPermissions);
	const recentPath = refName(internal.ai.runtime.autonomousState.recentAutonomousTurns);
	const snapshotPath = refName(internal.orgs.queries.getOrgSnapshotForAI);
	const recordPath = refName(internal.ai.runtime.autonomousState.recordAutonomousTurn);
	const activityPath = refName(internal.ai._logAIActivityInternal.logAIActivity);

	const runQuery = vi.fn(async (ref: unknown, args: unknown) => {
		queryCalls.push({ ref, args });
		const name = refName(ref);
		if (name === memberPath) return opts.memberInfo;
		if (name === recentPath) return opts.recentMarkers ?? [];
		if (name === snapshotPath) return opts.snapshot ?? { hiddenSlots: [] };
		throw new Error(`Unexpected stub query for: ${name}`);
	});

	const runMutation = vi.fn(async (ref: unknown, args: unknown) => {
		mutationCalls.push({ ref, args });
		const name = refName(ref);
		if (name === recordPath) {
			recordedMarkers.push(args as Record<string, unknown>);
			return null;
		}
		if (name === activityPath) {
			activityLogs.push(args as Record<string, unknown>);
			return null;
		}
		throw new Error(`Unexpected stub mutation for: ${name}`);
	});

	return {
		// Cast to the loose `ActionCtx` shape `runAgent` consumes — the
		// engine only ever calls `runQuery` + `runMutation` on it; tools
		// inside the host receive the same ctx but our mock model emits
		// no tool calls in any test below.
		ctx: { runQuery, runMutation } as any,
		recordedMarkers,
		activityLogs,
		queryCalls,
		mutationCalls,
	};
}

const orgId = "o1" as unknown as Id<"orgs">;
const agentUserId = "u1" as unknown as Id<"users">;
const conversationId = "c1" as unknown as Id<"aiConversations">;

let originalAnthropicKey: string | undefined;
let originalGoogleKey: string | undefined;
let originalOpenaiKey: string | undefined;

beforeEach(() => {
	// Snapshot any provider keys the host's model resolver might pick up
	// from `process.env`. Tests that use `modelOverride` don't care, but
	// the `no_platform_key` test deliberately runs without one — so we
	// scrub them all and restore in afterEach.
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

/** Reusable mock model that emits a one-token text reply + a stop. */
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
							inputTokens: { total: 100, noCache: 100, cacheRead: 0, cacheWrite: 0 },
							outputTokens: { total: 1, text: 1, reasoning: 0 },
						},
					},
				],
			}) as never,
			warnings: [],
		}),
	});
}

describe("runAutonomousTurn — gating", () => {
	it("returns agent_not_member when the user is not a member of the org", async () => {
		const stub = buildStubCtx({ memberInfo: null });
		const result = await runAutonomousTurn({
			ctx: stub.ctx,
			orgId,
			agentUserId,
			transcript: "hi",
		});
		expect(result).toEqual({ ok: false, reason: "agent_not_member" });
		// Nothing should have been written.
		expect(stub.recordedMarkers).toHaveLength(0);
		expect(stub.activityLogs).toHaveLength(0);
	});

	it("returns no_ai_use_perm when the member lacks `ai.use`", async () => {
		const stub = buildStubCtx({
			memberInfo: { permissions: ["leads.view"], plan: "free", settings: {} },
		});
		const result = await runAutonomousTurn({
			ctx: stub.ctx,
			orgId,
			agentUserId,
			transcript: "hi",
		});
		expect(result).toEqual({ ok: false, reason: "no_ai_use_perm" });
		expect(stub.recordedMarkers).toHaveLength(0);
	});

	it("returns autonomy_off when the org policy explicitly disabled the engine", async () => {
		const stub = buildStubCtx({
			memberInfo: {
				permissions: ["ai.use"],
				plan: "free",
				settings: {
					aiAutonomy: { autoActFromConversations: false },
				},
			},
		});
		const result = await runAutonomousTurn({
			ctx: stub.ctx,
			orgId,
			agentUserId,
			transcript: "hi",
		});
		expect(result).toEqual({ ok: false, reason: "autonomy_off" });
		// Crucially: NO marker row when autonomy is off, so the org's
		// audit feed isn't polluted by gated runs.
		expect(stub.recordedMarkers).toHaveLength(0);
	});

	it("returns debounced when a recent marker for the same conversation exists", async () => {
		const stub = buildStubCtx({
			memberInfo: {
				permissions: ["ai.use"],
				plan: "free",
				settings: { aiAutonomy: { autoActFromConversations: true } },
			},
			recentMarkers: [{ startedAt: Date.now() - 1_000, conversationId }],
		});
		const result = await runAutonomousTurn({
			ctx: stub.ctx,
			orgId,
			agentUserId,
			conversationId,
			transcript: "hi",
		});
		expect(result).toEqual({ ok: false, reason: "debounced" });
		// Debounced runs do not write a NEW marker — that would defeat
		// the debounce on the next call.
		expect(stub.recordedMarkers).toHaveLength(0);
	});

	it("returns no_platform_key when no provider key is configured AND no override is supplied", async () => {
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
				permissions: ["ai.use"],
				plan: "free",
				settings: { aiAutonomy: { autoActFromConversations: true } },
			},
		});
		const result = await runAutonomousTurn({
			ctx: stub.ctx,
			orgId,
			agentUserId,
			transcript: "hi",
		});
		expect(result).toEqual({ ok: false, reason: "no_platform_key" });
		expect(stub.recordedMarkers).toHaveLength(0);
	});
});

// ─── Mock-LLM happy path ────────────────────────────────────────────────────

describe("runAutonomousTurn — happy path with mock model", () => {
	it("runs the host with trigger:autonomous, writes a marker row + activity log, returns ok", async () => {
		const stub = buildStubCtx({
			memberInfo: {
				permissions: ["ai.use", "leads.create", "tasks.create", "notes.create"],
				plan: "free",
				settings: { aiAutonomy: { autoActFromConversations: true } },
			},
			recentMarkers: [],
		});
		const result = await runAutonomousTurn({
			ctx: stub.ctx,
			orgId,
			agentUserId,
			conversationId,
			transcript: "I'm Sara, want 2BR JVC, budget 120k, send options Tuesday",
			modelOverride: makeStopOnlyModel() as Parameters<
				typeof runAutonomousTurn
			>[0]["modelOverride"],
			triggeredBy: "autonomous:test",
		});

		expect(result.ok).toBe(true);
		if (!result.ok) throw new Error("expected ok result");
		expect(result.toolCallCount).toBe(0); // mock model emits text only
		expect(result.text).toBe("ok");

		// One marker row written.
		expect(stub.recordedMarkers).toHaveLength(1);
		const marker = stub.recordedMarkers[0];
		expect(marker.orgId).toBe(orgId);
		expect(marker.userId).toBe(agentUserId);
		expect(marker.conversationId).toBe(conversationId);
		expect(marker.ok).toBe(true);
		expect(marker.triggeredBy).toBe("autonomous:test");
		// Token count round-tripped from the mock usage shape.
		expect(marker.inputTokens).toBe(100);
		expect(marker.outputTokens).toBe(1);

		// One activity log line.
		expect(stub.activityLogs).toHaveLength(1);
		const log = stub.activityLogs[0];
		expect(log.action).toBe("ai.autonomous.turn");
		expect(log.toolName).toBe(AUTONOMOUS_TURN_MARKER);
		// orgId is forwarded as the Id<"orgs"> branded value the schema expects.
		expect(log.orgId).toBe(orgId);
	});

	it("two consecutive runs: second one is debounced when first marker is fresh", async () => {
		// First run — ok. Stub starts with no markers; we manually
		// inject the first call's marker into the recentMarkers list
		// before the second call.
		const recentMarkers: StubMarker[] = [];
		const stub = buildStubCtx({
			memberInfo: {
				permissions: ["ai.use"],
				plan: "free",
				settings: { aiAutonomy: { autoActFromConversations: true } },
			},
			recentMarkers,
		});

		// Override the mutation stub so the marker the engine writes on
		// run #1 is actually visible to run #2's recent-markers lookup.
		const originalRunMutation = stub.ctx.runMutation;
		const recordPath = getFunctionName(
			internal.ai.runtime.autonomousState.recordAutonomousTurn as any,
		);
		stub.ctx.runMutation = vi.fn(async (ref: unknown, args: unknown) => {
			if (getFunctionName(ref as any) === recordPath) {
				const marker = args as {
					startedAt: number;
					conversationId?: Id<"aiConversations">;
				};
				recentMarkers.push({
					startedAt: marker.startedAt,
					conversationId: marker.conversationId ?? null,
				});
			}
			return originalRunMutation(ref, args);
		});

		const run1 = await runAutonomousTurn({
			ctx: stub.ctx,
			orgId,
			agentUserId,
			conversationId,
			transcript: "Sara wants 2BR JVC, budget 120k",
			modelOverride: makeStopOnlyModel() as Parameters<
				typeof runAutonomousTurn
			>[0]["modelOverride"],
			triggeredBy: "autonomous:test",
		});
		expect(run1.ok).toBe(true);
		expect(stub.recordedMarkers).toHaveLength(1);

		// Run 2 — same conversation, immediately. Debounce should win.
		const run2 = await runAutonomousTurn({
			ctx: stub.ctx,
			orgId,
			agentUserId,
			conversationId,
			transcript: "Sara: hello again",
			modelOverride: makeStopOnlyModel() as Parameters<
				typeof runAutonomousTurn
			>[0]["modelOverride"],
			triggeredBy: "autonomous:test",
		});
		expect(run2).toEqual({ ok: false, reason: "debounced" });
		// No second marker row — debounce returns BEFORE the host runs.
		expect(stub.recordedMarkers).toHaveLength(1);
	});
});
