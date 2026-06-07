/// <reference types="vite/client" />
/**
 * convex/ai-runResume.test.ts
 *
 * Pins the contract that `processChat.runResume` (the V1-style inline
 * approval resume action shipped 2026-06-06) can read the existing
 * assistant message back via a real Convex query. Catches the exact
 * regression we shipped on 2026-06-06 and fixed on 2026-06-07:
 *
 *   `convex/ai/orchestrator/run.ts:runResume` referenced
 *   `ai/messages:_readForTest` — a path that never existed in
 *   `convex/ai/messages.ts`. (`_readForTest` exists only in
 *   `convex/aiStepUp.ts`, takes `tokenId` not `messageId`, and is an
 *   internalMutation not a query.) The string-path `_ref()` is cast
 *   to `any`, so typecheck didn't catch it; without an action test
 *   either, the broken path shipped. Every 2FA approval ended up
 *   throwing "function not found" inside `runResume`, the throw
 *   bubbled uncaught, and the assistant message stayed stuck on
 *   `thinkingState: "thinking"` — visible to the user as
 *   "Bulk Create Entities · Awaiting confirmation" forever.
 *
 * Two tests:
 *
 *   (1) `getMessageContent` returns the right shape for an existing
 *       assistant message (the happy path runResume uses).
 *   (2) `getMessageContent` returns `null` for a missing/deleted
 *       message id (so runResume's defensive bail path works).
 *
 * Why this catches the regression class: runResume now imports
 * `internal.ai.messages.getMessageContent` via the typed reference,
 * and these tests import the same symbol. If anyone deletes the
 * query, renames it, or changes its arg validator in a
 * non-back-compat way, both these tests break and the offender sees
 * the failure before merge.
 *
 * Action-level smoke testing (run an assistant message through
 * `processChat:runResume` end-to-end) is out of scope — it requires
 * mocking the AI SDK + the model resolver + the org/quota chain.
 * The query-level pin is the surgical defence against the actual
 * shipped bug.
 */
import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";
import { internal } from "./_generated/api";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");

async function seedAssistantPlaceholder(
	t: ReturnType<typeof convexTest>,
	opts: { content?: string; thinkingState?: "thinking" | "awaiting_approval" | "done" } = {},
) {
	return await t.run(async (ctx) => {
		const now = Date.now();
		const userId = await ctx.db.insert("users", {
			tokenIdentifier: `password|resume-${Math.random().toString(36).slice(2, 8)}@example.com`,
			email: `resume-${Math.random().toString(36).slice(2, 8)}@example.com`,
			name: "Resume Tester",
			onboardingCompleted: true,
			createdAt: now,
			updatedAt: now,
		});
		const orgId = await ctx.db.insert("orgs", {
			name: "Resume Test Org",
			slug: `resume-${Math.random().toString(36).slice(2, 8)}`,
			plan: "free",
			platformOrgId: "ORB-RESUME",
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
			content: opts.content ?? "Partial response so far…",
			thinkingState: opts.thinkingState ?? "awaiting_approval",
			createdAt: now,
		});
		return { orgId, conversationId, messageId };
	});
}

describe("ai/messages — getMessageContent (runResume contract)", () => {
	it("returns content + thinkingState for an existing assistant message", async () => {
		const t = convexTest(schema, modules);
		const { messageId, orgId, conversationId } = await seedAssistantPlaceholder(t, {
			content: "Hello world",
			thinkingState: "awaiting_approval",
		});

		const out = await t.query(internal.ai.messages.getMessageContent, { messageId });

		expect(out).not.toBeNull();
		expect(out?.content).toBe("Hello world");
		expect(out?.thinkingState).toBe("awaiting_approval");
		expect(out?.orgId).toBe(orgId);
		expect(out?.conversationId).toBe(conversationId);
	});

	it("returns null for a deleted/missing message id (runResume's safe-bail path)", async () => {
		const t = convexTest(schema, modules);
		const { messageId } = await seedAssistantPlaceholder(t);

		// Delete the message between scheduling and execution — exactly
		// the race the runResume defensive bail handles.
		await t.run((ctx) => ctx.db.delete(messageId));

		const out = await t.query(internal.ai.messages.getMessageContent, { messageId });
		expect(out).toBeNull();
	});

	it("preserves an empty content body (runResume seeds resumePrefix from this)", async () => {
		// runResume passes `resumePrefix: existingContent` to runChatTurn,
		// which seeds the per-attempt `accumulated` buffer. An empty
		// existing body is a real case (the model paused before emitting
		// any prose) — the query must return the empty string, not coerce
		// it to undefined or null.
		const t = convexTest(schema, modules);
		const { messageId } = await seedAssistantPlaceholder(t, {
			content: "",
			thinkingState: "awaiting_approval",
		});

		const out = await t.query(internal.ai.messages.getMessageContent, { messageId });
		expect(out).not.toBeNull();
		expect(out?.content).toBe("");
	});
});
