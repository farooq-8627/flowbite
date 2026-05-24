/**
 * convex/ai/telemetry.ts
 *
 * Writer for `aiToolEvents` — one row per tool execution, used by the
 * AI Usage dashboard for cost / latency / per-tool error rate, and by
 * the AI quota gate to throttle free-tier abusers.
 *
 * Cost is computed from MODEL_REGISTRY pricing when token counts are
 * passed; storage is denormalised so the rollup query never has to
 * join back to the registry.
 *
 * Retention: 30 days, enforced by an `expiresAt` field + the
 * `by_expires` index. A future cron sweeps rows past their TTL.
 */

import { v } from "convex/values";
import { internalMutation, internalQuery } from "../_generated/server";
import { MODEL_REGISTRY } from "./modelRegistry";

/** 30-day retention window for telemetry rows. */
const RETENTION_MS = 30 * 24 * 60 * 60 * 1000;

/** Compute USD cost given model + token counts. Returns 0 if unknown. */
function computeCostUsd(args: {
	model?: string;
	inputTokens?: number;
	outputTokens?: number;
}): number {
	if (!args.model) return 0;
	const info = MODEL_REGISTRY[args.model];
	if (!info) return 0;
	const inTok = args.inputTokens ?? 0;
	const outTok = args.outputTokens ?? 0;
	const inCost = (inTok / 1_000_000) * info.inputCostPerMTok;
	const outCost = (outTok / 1_000_000) * info.outputCostPerMTok;
	return inCost + outCost;
}

/**
 * Insert one telemetry row. Internal-only — called from `streamLoop`
 * on `tool-result` and `tool-error`. Never throws (telemetry must
 * never break the user's chat turn).
 */
export const recordToolEvent = internalMutation({
	args: {
		orgId: v.id("orgs"),
		userId: v.id("users"),
		conversationId: v.id("aiConversations"),
		toolName: v.string(),
		layer: v.optional(v.string()),
		model: v.optional(v.string()),
		provider: v.optional(v.string()),
		startedAt: v.number(),
		durationMs: v.number(),
		ok: v.boolean(),
		errorCode: v.optional(v.string()),
		errorMessage: v.optional(v.string()),
		inputTokens: v.optional(v.number()),
		outputTokens: v.optional(v.number()),
	},
	handler: async (ctx, args) => {
		try {
			const costUsd = computeCostUsd({
				model: args.model,
				inputTokens: args.inputTokens,
				outputTokens: args.outputTokens,
			});
			const now = Date.now();
			await ctx.db.insert("aiToolEvents", {
				orgId: args.orgId,
				userId: args.userId,
				conversationId: args.conversationId,
				toolName: args.toolName,
				layer: args.layer,
				model: args.model,
				provider: args.provider,
				startedAt: args.startedAt,
				durationMs: args.durationMs,
				ok: args.ok,
				errorCode: args.errorCode,
				errorMessage: args.errorMessage?.slice(0, 500),
				inputTokens: args.inputTokens,
				outputTokens: args.outputTokens,
				costUsd: costUsd > 0 ? costUsd : undefined,
				expiresAt: now + RETENTION_MS,
			});
		} catch (err) {
			// Telemetry failures must never break the chat turn.
			console.warn("[telemetry] recordToolEvent failed:", err);
		}
	},
});

/**
 * Sum the total input + output tokens an org has consumed in the
 * current calendar month. Used by the chat-entry quota gate. Reads
 * are bounded by `by_org_and_started` + the month boundary, so the
 * scan is O(events-this-month) — small (≤ a few thousand) for any
 * realistic free-tier user.
 */
export const sumTokensThisMonth = internalQuery({
	args: { orgId: v.id("orgs") },
	handler: async (ctx, args) => {
		const start = startOfMonth(Date.now());
		const events = await ctx.db
			.query("aiToolEvents")
			.withIndex("by_org_and_started", (q) =>
				q.eq("orgId", args.orgId).gte("startedAt", start),
			)
			.collect();
		let inputTokens = 0;
		let outputTokens = 0;
		for (const e of events) {
			inputTokens += e.inputTokens ?? 0;
			outputTokens += e.outputTokens ?? 0;
		}
		return {
			inputTokens,
			outputTokens,
			totalTokens: inputTokens + outputTokens,
			eventCount: events.length,
			windowStart: start,
		};
	},
});

/** First-of-the-month timestamp (UTC) for the month containing `now`. */
export function startOfMonth(now: number): number {
	const d = new Date(now);
	return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1, 0, 0, 0, 0);
}
