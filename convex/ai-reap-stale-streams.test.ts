/// <reference types="vite/client" />
/**
 * convex/ai-reap-stale-streams.test.ts
 *
 * Contract coverage for `reapStaleStreams` — the stale-stream reaper cron
 * (registered in `convex/crons.ts`, every 1 min). If `runChatTurn` crashes
 * mid-turn the assistant `aiMessages` row is stranded in a non-terminal
 * `thinkingState` forever; the reaper flips any such row older than 5 minutes
 * to a terminal `done` + `aborted: true` with a `[stalled]` marker — the same
 * shape `cancelStream` produces, so the UI renders it with zero extra work.
 *
 * These tests freeze the contract:
 *   - rows past the 5-min threshold in EVERY non-terminal state are flipped;
 *   - fresh rows (within the window) are untouched;
 *   - already-terminal rows (`done` / `error`) are untouched;
 *   - the `[stalled]` marker is appended to existing content (or stands alone
 *     when the row never streamed any text);
 *   - the reaper is idempotent — a second run re-flips nothing and never
 *     double-stamps the marker.
 *
 * Lives at the `convex/` root (not `convex/ai/`) to match the prefix-stripping
 * convention every other Convex test in the repo uses (see the note in
 * `ai-messages-snapshot.test.ts`).
 */
import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");

const STALE_THRESHOLD_MS = 5 * 60 * 1000;
const STALL_MARKER = "_[stalled — please retry]_";
const EMPTY_STALL_MARKER = "_[stalled — no response received, please retry]_";

type ThinkingState = "thinking" | "calling_tool" | "streaming" | "done" | "error";

// ─── seeders ──────────────────────────────────────────────────────────

async function seedOrgAndConversation(t: ReturnType<typeof convexTest>) {
	return await t.run(async (ctx) => {
		const now = Date.now();
		const rand = Math.random().toString(36).slice(2, 8);
		const userId = await ctx.db.insert("users", {
			tokenIdentifier: `password|reap-${rand}@example.com`,
			email: `reap-${rand}@example.com`,
			name: "Reap Tester",
			onboardingCompleted: true,
			createdAt: now,
			updatedAt: now,
		});
		const orgId = await ctx.db.insert("orgs", {
			name: "Reap Test Org",
			slug: `reap-${rand}`,
			plan: "free",
			platformOrgId: "ORB-REAP",
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
		return { orgId, conversationId };
	});
}

async function seedMessage(
	t: ReturnType<typeof convexTest>,
	args: {
		orgId: Id<"orgs">;
		conversationId: Id<"aiConversations">;
		thinkingState?: ThinkingState;
		createdAt: number;
		content?: string;
	},
) {
	return await t.run(async (ctx) => {
		return await ctx.db.insert("aiMessages", {
			orgId: args.orgId,
			conversationId: args.conversationId,
			role: "assistant",
			content: args.content ?? "",
			...(args.thinkingState ? { thinkingState: args.thinkingState } : {}),
			createdAt: args.createdAt,
		});
	});
}

// ─── tests ─────────────────────────────────────────────────────────────

describe("ai/messages — reapStaleStreams (stale-stream reaper cron)", () => {
	it("flips stale rows in every non-terminal state to done + aborted + marker", async () => {
		const t = convexTest(schema, modules);
		const { orgId, conversationId } = await seedOrgAndConversation(t);
		const stale = Date.now() - STALE_THRESHOLD_MS - 60_000; // 6 min ago

		const ids = await Promise.all(
			(["thinking", "calling_tool", "streaming"] as const).map((state) =>
				seedMessage(t, {
					orgId,
					conversationId,
					thinkingState: state,
					createdAt: stale,
					content: `partial from ${state}`,
				}),
			),
		);

		const result = await t.mutation(internal.ai.messages.reapStaleStreams, {});
		expect(result.reaped).toBe(3);

		for (const id of ids) {
			const row = await t.run((ctx) => ctx.db.get(id));
			expect(row?.thinkingState).toBe("done");
			expect(row?.aborted).toBe(true);
			expect(row?.content.endsWith(STALL_MARKER)).toBe(true);
		}
	});

	it("leaves fresh non-terminal rows (within the 5-min window) untouched", async () => {
		const t = convexTest(schema, modules);
		const { orgId, conversationId } = await seedOrgAndConversation(t);
		const fresh = Date.now() - 30_000; // 30 s ago — a healthy live stream

		const id = await seedMessage(t, {
			orgId,
			conversationId,
			thinkingState: "streaming",
			createdAt: fresh,
			content: "live tokens…",
		});

		const result = await t.mutation(internal.ai.messages.reapStaleStreams, {});
		expect(result.reaped).toBe(0);

		const row = await t.run((ctx) => ctx.db.get(id));
		expect(row?.thinkingState).toBe("streaming");
		expect(row?.aborted).toBeUndefined();
		expect(row?.content).toBe("live tokens…");
	});

	it("leaves already-terminal rows (done / error) untouched even when old", async () => {
		const t = convexTest(schema, modules);
		const { orgId, conversationId } = await seedOrgAndConversation(t);
		const old = Date.now() - STALE_THRESHOLD_MS - 60_000;

		const doneId = await seedMessage(t, {
			orgId,
			conversationId,
			thinkingState: "done",
			createdAt: old,
			content: "settled answer",
		});
		const errorId = await seedMessage(t, {
			orgId,
			conversationId,
			thinkingState: "error",
			createdAt: old,
			content: "provider 500",
		});
		// Legacy rows lack thinkingState entirely (UI treats undefined as done).
		const legacyId = await seedMessage(t, {
			orgId,
			conversationId,
			createdAt: old,
			content: "legacy pre-thinking-UI message",
		});

		const result = await t.mutation(internal.ai.messages.reapStaleStreams, {});
		expect(result.reaped).toBe(0);

		const done = await t.run((ctx) => ctx.db.get(doneId));
		expect(done?.content).toBe("settled answer");
		expect(done?.aborted).toBeUndefined();
		const error = await t.run((ctx) => ctx.db.get(errorId));
		expect(error?.content).toBe("provider 500");
		const legacy = await t.run((ctx) => ctx.db.get(legacyId));
		expect(legacy?.content).toBe("legacy pre-thinking-UI message");
	});

	it("uses the standalone marker when the stale row never streamed any text", async () => {
		const t = convexTest(schema, modules);
		const { orgId, conversationId } = await seedOrgAndConversation(t);
		const stale = Date.now() - STALE_THRESHOLD_MS - 60_000;

		const id = await seedMessage(t, {
			orgId,
			conversationId,
			thinkingState: "thinking",
			createdAt: stale,
			content: "", // crashed before emitting a single token
		});

		await t.mutation(internal.ai.messages.reapStaleStreams, {});

		const row = await t.run((ctx) => ctx.db.get(id));
		expect(row?.thinkingState).toBe("done");
		expect(row?.aborted).toBe(true);
		expect(row?.content).toBe(EMPTY_STALL_MARKER);
	});

	it("is idempotent — a second run re-flips nothing and never double-stamps", async () => {
		const t = convexTest(schema, modules);
		const { orgId, conversationId } = await seedOrgAndConversation(t);
		const stale = Date.now() - STALE_THRESHOLD_MS - 60_000;

		const id = await seedMessage(t, {
			orgId,
			conversationId,
			thinkingState: "streaming",
			createdAt: stale,
			content: "half a sentence",
		});

		const first = await t.mutation(internal.ai.messages.reapStaleStreams, {});
		expect(first.reaped).toBe(1);
		const afterFirst = await t.run((ctx) => ctx.db.get(id));

		const second = await t.mutation(internal.ai.messages.reapStaleStreams, {});
		expect(second.reaped).toBe(0);
		const afterSecond = await t.run((ctx) => ctx.db.get(id));

		// Row is unchanged by the second pass — single marker, still done.
		expect(afterSecond?.content).toBe(afterFirst?.content);
		expect(afterSecond?.content.endsWith(STALL_MARKER)).toBe(true);
		expect(afterSecond?.content.indexOf(STALL_MARKER)).toBe(
			afterSecond?.content.lastIndexOf(STALL_MARKER),
		);
	});

	it("respects the per-state batch cap and drains a backlog over successive ticks", async () => {
		const t = convexTest(schema, modules);
		const { orgId, conversationId } = await seedOrgAndConversation(t);
		const stale = Date.now() - STALE_THRESHOLD_MS - 60_000;

		// 101 stale rows in one state → first tick caps at 100, second tick
		// reaps the remainder.
		await Promise.all(
			Array.from({ length: 101 }).map(() =>
				seedMessage(t, {
					orgId,
					conversationId,
					thinkingState: "streaming",
					createdAt: stale,
					content: "x",
				}),
			),
		);

		const first = await t.mutation(internal.ai.messages.reapStaleStreams, {});
		expect(first.reaped).toBe(100);
		const second = await t.mutation(internal.ai.messages.reapStaleStreams, {});
		expect(second.reaped).toBe(1);
		const third = await t.mutation(internal.ai.messages.reapStaleStreams, {});
		expect(third.reaped).toBe(0);
	});
});
