/**
 * Rate limiting — convex/_shared/rateLimit.ts
 *
 * Universal token-bucket rate limiter usable from any Convex mutation. Backs
 * onto the `rateLimits` table; one row per (scope, key) pair stores a count
 * and a `resetAt` timestamp. Each check increments the count and rejects
 * with `ERRORS.RATE_LIMITED` once the configured limit is hit inside the
 * window.
 *
 * Why this approach
 * ─────────────────
 * - **No external dependency.** Convex doesn't ship a built-in rate limiter,
 *   and an in-process LRU would lose state across function instances. A row
 *   per (scope, key) is the simplest correct shape for a serverless backend.
 * - **Index-only reads.** The hot path is a single `.withIndex(by_scope_key)`
 *   point query + a `db.patch` (or `db.insert` once per window).
 * - **Soft self-cleanup.** Rows update in place; we don't write a row per
 *   event. Stale rows (`resetAt + 24h < now`) can be swept by a future cron.
 *
 * Usage
 * ─────
 *   import { enforceRateLimit, RATE_LIMITS } from "@/_shared/rateLimit";
 *
 *   // Inside any orgMutation handler:
 *   await enforceRateLimit(ctx, {
 *     scope: "tags.create",
 *     key: `${userId}:${orgId}`,
 *     ...RATE_LIMITS.write,
 *   });
 *
 * Or use a preset:
 *
 *   await enforceRateLimit(ctx, {
 *     scope: "files.record",
 *     key: `${userId}:${orgId}`,
 *     ...RATE_LIMITS.upload,
 *   });
 *
 * GENERIC IDIOM
 * ─────────────
 * The `key` is intentionally a free-form string: the caller decides which
 * principal to rate-limit. Common shapes:
 *   - User+org:    `${userId}:${orgId}`     → "this user can write N records
 *                                              per minute in this org"
 *   - Per user:    `${userId}`              → cross-org throttle
 *   - Anonymous:   `${request.ip}`          → for unauthenticated endpoints
 *
 * The helper does NOT impose a default key; you must compose one. This keeps
 * intent explicit at every call site.
 *
 * Sources
 * ───────
 * - https://stack.convex.dev/rate-limiting (token-bucket pattern)
 * - https://github.com/get-convex/convex-helpers/issues/233 (no built-in helper)
 */
import { ConvexError } from "convex/values";
import type { Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import { ERRORS } from "./errors";

export interface RateLimitOptions {
	/** Class of operation — see `RateLimitScope` for the canonical list. */
	scope: string;
	/** Identifier for the principal being throttled (user id, ip, etc.). */
	key: string;
	/** Maximum allowed operations within the window. */
	max: number;
	/** Window length in milliseconds. */
	periodMs: number;
}

/**
 * Common presets, picked to be conservative defaults rather than fine-tuned
 * limits. Override `max`/`periodMs` at the call site whenever a specific
 * mutation has a different traffic profile.
 */
export const RATE_LIMITS = {
	/** Generic write endpoints — 60 ops / minute / user-org pair. */
	write: { max: 60, periodMs: 60_000 },
	/** Fast lookups / passive reads — 240 / minute. */
	read: { max: 240, periodMs: 60_000 },
	/** File uploads (slower, more expensive) — 30 / minute. */
	upload: { max: 30, periodMs: 60_000 },
	/** AI calls (LLM-backed) — 20 / minute. */
	ai: { max: 20, periodMs: 60_000 },
	/** Bulk imports / batch ops — 5 / minute. */
	bulk: { max: 5, periodMs: 60_000 },
} as const;

/**
 * Token-bucket-ish enforcement. Atomically reads the current count for
 * (scope, key), increments it, and throws a `ConvexError(ERRORS.RATE_LIMITED)`
 * when the configured limit is exceeded.
 *
 * Per-tenant overrides:
 *   When `options.orgId` is provided, the helper consults
 *   `org.settings.rateLimits` for a matching scope override before falling
 *   back to the caller-supplied (preset) max/periodMs. Pass `orgId` from the
 *   mutation handler so each tenant's policy is honoured.
 *
 * Concurrency note: Convex mutations run with optimistic transactions, so two
 * parallel mutations targeting the same (scope, key) row will each see the
 * pre-write state and one of them will retry. That's acceptable — both will
 * still settle on a valid count (off-by-one at worst is fine for throttling).
 */
export async function enforceRateLimit(
	ctx: MutationCtx,
	options: RateLimitOptions & { orgId?: Id<"orgs"> },
): Promise<void> {
	const { scope, key, orgId } = options;
	let { max, periodMs } = options;

	// Per-tenant override lookup — single ctx.db.get if orgId provided.
	if (orgId) {
		const org = await ctx.db.get(orgId);
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

	if (!existing) {
		await ctx.db.insert("rateLimits", {
			scope,
			key,
			count: 1,
			resetAt: now + periodMs,
			updatedAt: now,
		});
		return;
	}

	// Window expired → reset.
	if (existing.resetAt <= now) {
		await ctx.db.patch(existing._id, {
			count: 1,
			resetAt: now + periodMs,
			updatedAt: now,
		});
		return;
	}

	if (existing.count >= max) {
		const retryInSec = Math.max(1, Math.ceil((existing.resetAt - now) / 1000));
		throw new ConvexError(`${ERRORS.RATE_LIMITED} (retry in ~${retryInSec}s)`);
	}

	await ctx.db.patch(existing._id, {
		count: existing.count + 1,
		updatedAt: now,
	});
}

/**
 * Read-only inspection. Returns `{ remaining, resetAt }` without incrementing.
 * Useful for surfacing "X requests left" badges in the UI.
 */
export async function inspectRateLimit(
	ctx: MutationCtx,
	options: Pick<RateLimitOptions, "scope" | "key" | "max">,
): Promise<{ remaining: number; resetAt: number | null }> {
	const { scope, key, max } = options;
	const now = Date.now();
	const existing = await ctx.db
		.query("rateLimits")
		.withIndex("by_scope_key", (q) => q.eq("scope", scope).eq("key", key))
		.unique();
	if (!existing || existing.resetAt <= now) {
		return { remaining: max, resetAt: null };
	}
	return {
		remaining: Math.max(0, max - existing.count),
		resetAt: existing.resetAt,
	};
}
