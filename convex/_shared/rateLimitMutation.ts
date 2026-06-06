/**
 * Non-throwing rate-limit consumer for action callers.
 *
 * The canonical `enforceRateLimit(ctx, …)` helper THROWS
 * `ConvexError(ERRORS.RATE_LIMITED)` when the bucket is exhausted —
 * great for public mutations where the client expects an error
 * response, lousy for action-side gates that want to continue with a
 * different code path on rate-limit (e.g. "skip the autonomous reply,
 * still 200 the webhook so Twilio doesn't retry").
 *
 * `tryConsumeRateLimitInternal` is the same atomic bucket increment
 * exposed as an `internalMutation` that RETURNS `{ ok: boolean }`
 * instead of throwing. Callers that prefer the throwing variant keep
 * using `enforceRateLimit`; nothing here changes that path.
 *
 * Used by S15's `runWaProfileReply` to pace per-conversation Mode C
 * replies (default: 1 reply per 30s per (orgId, conversationId)).
 *
 * Spec: AI-TOOLING-BUILD-STAGES.md §S15 ("per-conversation rate limit").
 */
import { v } from "convex/values";
import type { Id } from "../_generated/dataModel";
import { internalMutation } from "../_generated/server";

export const tryConsumeRateLimitInternal = internalMutation({
	args: {
		scope: v.string(),
		key: v.string(),
		max: v.number(),
		periodMs: v.number(),
		orgId: v.optional(v.id("orgs")),
	},
	handler: async (ctx, args) => {
		const { scope, key, orgId } = args;
		let { max, periodMs } = args;

		// Per-tenant override (mirrors `enforceRateLimit`). Read once.
		if (orgId) {
			const org = await ctx.db.get(orgId as Id<"orgs">);
			const override = org?.settings?.rateLimits?.find((r) => r.scope === scope);
			if (override) {
				max = override.max;
				periodMs = override.periodMs;
			}
		}

		const now = Date.now();
		const existing = await ctx.db
			.query("rateLimits")
			.withIndex("by_scope_key", (q) => q.eq("scope", scope).eq("key", key))
			.unique();

		// Cold bucket — first hit. Always succeeds.
		if (!existing) {
			await ctx.db.insert("rateLimits", {
				scope,
				key,
				count: 1,
				resetAt: now + periodMs,
				updatedAt: now,
			});
			return { ok: true, remaining: Math.max(0, max - 1) };
		}

		// Window has elapsed — reset the bucket on this hit.
		if (existing.resetAt <= now) {
			await ctx.db.patch(existing._id, {
				count: 1,
				resetAt: now + periodMs,
				updatedAt: now,
			});
			return { ok: true, remaining: Math.max(0, max - 1) };
		}

		// Bucket full — refuse without throwing.
		if (existing.count >= max) {
			return { ok: false, remaining: 0, retryAtMs: existing.resetAt };
		}

		// Increment.
		await ctx.db.patch(existing._id, {
			count: existing.count + 1,
			updatedAt: now,
		});
		return { ok: true, remaining: Math.max(0, max - (existing.count + 1)) };
	},
});
