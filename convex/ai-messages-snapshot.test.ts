/// <reference types="vite/client" />
/**
 * convex/ai-messages-snapshot.test.ts
 *
 * Contract coverage for `patchAssistantSnapshot` — the coalesced
 * mutation introduced in Stage 0 of `DASHBOARD-V2-PLAN.md` to halve the
 * streamLoop's per-chunk write rate. The streamLoop now drives a
 * 200-ms wall-clock throttle on top of this mutation; if the mutation
 * surface drifts (e.g. content stops being a replace, or reasoning
 * truncation forgets the head-cap), every live chat turn writes the
 * wrong shape. These tests freeze the contract:
 *
 *   - `content` REPLACES the body (not append).
 *   - `reasoningAppend` APPENDS to existing reasoning with the same
 *     head-cap behaviour as `patchThinkingState` (`appendReasoningWithCap`
 *     is the SSOT helper both mutations share).
 *   - `thinkingState` / `activeTool` flip the live status flags.
 *   - Bailout is silent when the message has been deleted between
 *     scheduling and execution (matches `patchAssistantBody`).
 *   - All-undefined args is a safe no-op (the streamLoop's empty-flush
 *     guard relies on this).
 *
 * Why the file lives at `convex/` root rather than `convex/ai/`. The
 * `convex-test` runtime resolves modules by stripping a single common
 * prefix from `import.meta.glob` keys; the depth-1 root location
 * matches the pattern used by every other Convex test in the repo
 * (`crm-hardening.test.ts`, `tasks-hardening.test.ts`, etc.) and
 * avoids the prefix-mismatch failure depth-2 test files hit. The
 * streamLoop integration test (Stage 0 plan §0 — assert ≤35 mutations
 * per 2 000-char turn) is deferred to a later session: it requires a
 * full `streamText` mock and is out of scope for the Stage 0 hot-fix
 * wave.
 */
import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";
import { internal } from "./_generated/api";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");

const REASONING_HARD_CAP = 8_000;
const REASONING_TRUNCATION_MARKER =
	"\n… [reasoning truncated — too many steps, see chat for outcome] …";

// ─── seeders ──────────────────────────────────────────────────────────

async function seedAssistantPlaceholder(t: ReturnType<typeof convexTest>) {
	return await t.run(async (ctx) => {
		const now = Date.now();
		const userId = await ctx.db.insert("users", {
			tokenIdentifier: `password|snap-${Math.random().toString(36).slice(2, 8)}@example.com`,
			email: `snap-${Math.random().toString(36).slice(2, 8)}@example.com`,
			name: "Snap Tester",
			onboardingCompleted: true,
			createdAt: now,
			updatedAt: now,
		});
		const orgId = await ctx.db.insert("orgs", {
			name: "Snapshot Test Org",
			slug: `snapshot-${Math.random().toString(36).slice(2, 8)}`,
			plan: "free",
			platformOrgId: "ORB-SNAP",
			settings: {},
			createdAt: now,
			updatedAt: now,
		});
		const conversationId = await ctx.db.insert("aiConversations", {
			orgId,
			userId,
			status: "active",
			lastMessageAt: now,
			createdAt: now,
			updatedAt: now,
		});
		const messageId = await ctx.db.insert("aiMessages", {
			orgId,
			conversationId,
			role: "assistant",
			content: "",
			thinkingState: "thinking",
			createdAt: now,
		});
		return { orgId, conversationId, messageId };
	});
}

// ─── tests ─────────────────────────────────────────────────────────────

describe("ai/messages — patchAssistantSnapshot (Stage 0 of DASHBOARD-V2-PLAN.md)", () => {
	it("contract 1 — writes body content + appends reasoning + flips state in one call", async () => {
		const t = convexTest(schema, modules);
		const { messageId } = await seedAssistantPlaceholder(t);

		await t.mutation(internal.ai.messages.patchAssistantSnapshot, {
			messageId,
			content: "Hello, world.",
			reasoningAppend: "→ Calling search_crm",
			thinkingState: "calling_tool",
			activeTool: "search_crm",
		});

		const after = await t.run((ctx) => ctx.db.get(messageId));
		expect(after?.content).toBe("Hello, world.");
		expect(after?.reasoning).toBe("→ Calling search_crm");
		expect(after?.thinkingState).toBe("calling_tool");
		expect(after?.activeTool).toBe("search_crm");
	});

	it("contract 2 — content REPLACES, reasoning APPENDS (semantic split)", async () => {
		const t = convexTest(schema, modules);
		const { messageId } = await seedAssistantPlaceholder(t);

		// First flush: settle a partial body + initial reasoning.
		await t.mutation(internal.ai.messages.patchAssistantSnapshot, {
			messageId,
			content: "Hel",
			reasoningAppend: "thinking step 1",
		});
		// Second flush: replace body with the running accumulated text,
		// append a new reasoning chunk.
		await t.mutation(internal.ai.messages.patchAssistantSnapshot, {
			messageId,
			content: "Hello, world.",
			reasoningAppend: "thinking step 2",
		});

		const after = await t.run((ctx) => ctx.db.get(messageId));
		// content was REPLACED — only the latest call's value persists.
		expect(after?.content).toBe("Hello, world.");
		// reasoning was APPENDED — both chunks persist, separated by "\n".
		expect(after?.reasoning).toBe("thinking step 1\nthinking step 2");
	});

	it("contract 3 — settle pass writes model/provider/usage/tokens in one call", async () => {
		const t = convexTest(schema, modules);
		const { messageId } = await seedAssistantPlaceholder(t);

		await t.mutation(internal.ai.messages.patchAssistantSnapshot, {
			messageId,
			content: "Final answer.",
			thinkingState: "done",
			model: "claude-sonnet-4-5",
			provider: "anthropic",
			usageMode: "platform",
			inputTokens: 1234,
			outputTokens: 567,
		});

		const after = await t.run((ctx) => ctx.db.get(messageId));
		expect(after?.content).toBe("Final answer.");
		expect(after?.thinkingState).toBe("done");
		expect(after?.model).toBe("claude-sonnet-4-5");
		expect(after?.provider).toBe("anthropic");
		expect(after?.usageMode).toBe("platform");
		expect(after?.inputTokens).toBe(1234);
		expect(after?.outputTokens).toBe(567);
	});

	it("contract 4 — reasoning head-cap kicks in once 8 000-byte threshold is exceeded", async () => {
		const t = convexTest(schema, modules);
		const { messageId } = await seedAssistantPlaceholder(t);

		// Seed a 9 000-char reasoning prefix so the very next append both
		// crosses the cap AND saturates the head-cap output to ~CAP bytes
		// (room = CAP - markerLen ≈ 7 936; slicing 9 000 chars yields the
		// full room). With a smaller prefix the slice would fall short of
		// `room` and there'd still be slack for follow-up appends — the
		// idempotency check below relies on the row being full.
		const prefix = "x".repeat(9_000);
		await t.run(async (ctx) => {
			await ctx.db.patch(messageId, { reasoning: prefix });
		});

		await t.mutation(internal.ai.messages.patchAssistantSnapshot, {
			messageId,
			reasoningAppend: "y".repeat(2_000),
		});

		const after = await t.run((ctx) => ctx.db.get(messageId));
		expect(after?.reasoning).toBeDefined();
		// Truncation marker present on a single, predictable position.
		expect(after?.reasoning?.endsWith(REASONING_TRUNCATION_MARKER)).toBe(true);
		// Total length never exceeds the hard cap.
		expect(after?.reasoning?.length).toBeLessThanOrEqual(REASONING_HARD_CAP);
		// Head preserved — the user can still see what the model planned.
		expect(after?.reasoning?.startsWith("x")).toBe(true);

		// Subsequent appends after a marker is already present are dropped
		// silently — the row stays at the cap, no double-marker.
		await t.mutation(internal.ai.messages.patchAssistantSnapshot, {
			messageId,
			reasoningAppend: "z".repeat(500),
		});
		const after2 = await t.run((ctx) => ctx.db.get(messageId));
		expect(after2?.reasoning).toBe(after?.reasoning);
	});

	it("contract 5 — silent bailout when the message has been deleted", async () => {
		const t = convexTest(schema, modules);
		const { messageId } = await seedAssistantPlaceholder(t);
		await t.run(async (ctx) => {
			await ctx.db.delete(messageId);
		});

		// Must not throw — the streamLoop relies on this being a no-op
		// when the user purged the conversation between two chunks.
		await expect(
			t.mutation(internal.ai.messages.patchAssistantSnapshot, {
				messageId,
				content: "ghost write",
			}),
		).resolves.not.toThrow();
	});

	it("contract 6 — passing only thinkingState leaves content untouched", async () => {
		const t = convexTest(schema, modules);
		const { messageId } = await seedAssistantPlaceholder(t);
		await t.run(async (ctx) => {
			await ctx.db.patch(messageId, { content: "preserved" });
		});

		await t.mutation(internal.ai.messages.patchAssistantSnapshot, {
			messageId,
			thinkingState: "streaming",
		});

		const after = await t.run((ctx) => ctx.db.get(messageId));
		expect(after?.content).toBe("preserved");
		expect(after?.thinkingState).toBe("streaming");
	});
});
