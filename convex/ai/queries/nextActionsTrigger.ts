/**
 * convex/ai/queries/nextActionsTrigger.ts
 *
 * Centralised reactive-rebuild helper for `aiNextActions`. Called from
 * every mutation that touches a row referenced by the AI Pulse Ribbon
 * (leads / deals / tasks). Schedules
 * `internal.ai.queries.nextActions.rebuildForUser` so the user's pulse
 * picks up the change without waiting for the 30-min cron.
 *
 * Design constraints:
 *   1. **Never throw** — this is post-write side-effect code. A failure
 *      to schedule a rebuild must not abort the user's mutation.
 *   2. **Coalesce bursts** — a user who closes 5 deals in 10s should
 *      generate at most a few rebuilds, not 5. The helper consults the
 *      shared `rateLimits` table (token-bucket scoped to
 *      `nextActions.reactiveRebuild`) and silently skips when the same
 *      user/org has been scheduled within the last 5 s.
 *   3. **Idempotent in transactions** — Convex mutations are
 *      optimistically concurrent; calling this helper multiple times
 *      from the same transaction is safe and quietly deduped.
 *   4. **Cheap on the read path** — one indexed `rateLimits` lookup per
 *      call, plus at most one insert/patch + one `scheduler.runAfter`.
 *
 * Usage from a mutation `*Impl` helper, AFTER the primary write +
 * activity-log + notification side-effects, BEFORE returning:
 *
 *   await scheduleNextActionsRebuild(ctx, args.orgId, args.userId);
 *
 * The userId we pass is the trusted caller — for assignedTo-based
 * fan-out (e.g. assigning a lead to someone else), the calling
 * mutation should additionally call this helper for the new assignee
 * so both users' pulses refresh.
 */

import { internal } from "../../_generated/api";
import type { Id } from "../../_generated/dataModel";
import type { MutationCtx } from "../../_generated/server";

const REBUILD_SCOPE = "nextActions.reactiveRebuild";
const REBUILD_DEBOUNCE_MS = 5_000;
const REBUILD_MAX_PER_WINDOW = 1;

/**
 * Schedule a `rebuildForUser` for the (orgId, userId) pair. Silently
 * coalesces back-to-back calls within `REBUILD_DEBOUNCE_MS`. Errors are
 * swallowed (logged) so a failed schedule never aborts the caller.
 */
export async function scheduleNextActionsRebuild(
	ctx: MutationCtx,
	orgId: Id<"orgs">,
	userId: Id<"users">,
): Promise<void> {
	try {
		const scope = REBUILD_SCOPE;
		const key = `${userId}:${orgId}`;
		const now = Date.now();

		const existing = await ctx.db
			.query("rateLimits")
			.withIndex("by_scope_key", (q) => q.eq("scope", scope).eq("key", key))
			.unique();

		if (existing) {
			if (existing.resetAt > now) {
				// Inside the dedup window — was a rebuild already scheduled
				// recently? Skip silently.
				if (existing.count >= REBUILD_MAX_PER_WINDOW) return;
				await ctx.db.patch(existing._id, {
					count: existing.count + 1,
					updatedAt: now,
				});
			} else {
				// Window expired — reset.
				await ctx.db.patch(existing._id, {
					count: 1,
					resetAt: now + REBUILD_DEBOUNCE_MS,
					updatedAt: now,
				});
			}
		} else {
			await ctx.db.insert("rateLimits", {
				scope,
				key,
				count: 1,
				resetAt: now + REBUILD_DEBOUNCE_MS,
				updatedAt: now,
			});
		}

		// Schedule outside the current transaction so we don't hold OCC
		// locks longer than necessary. `runAfter(0, ...)` runs as soon
		// as the current mutation commits.
		await ctx.scheduler.runAfter(0, internal.ai.queries.nextActions.rebuildForUser, {
			orgId,
			userId,
		});
	} catch (err) {
		// Side-effect helper — never abort the caller. The 30-min cron
		// will eventually correct any state we missed.
		console.warn("[scheduleNextActionsRebuild] schedule failed:", err);
	}
}

/**
 * Schedule rebuilds for multiple users at once — used when a write
 * affects two users (e.g. reassigning a lead from `oldAssignee` to
 * `newAssignee`). Deduplicates the input set so passing the same
 * userId twice in different fields doesn't double-trigger.
 */
export async function scheduleNextActionsRebuildForUsers(
	ctx: MutationCtx,
	orgId: Id<"orgs">,
	userIds: ReadonlyArray<Id<"users"> | undefined | null>,
): Promise<void> {
	const seen = new Set<string>();
	for (const u of userIds) {
		if (!u) continue;
		const key = u as unknown as string;
		if (seen.has(key)) continue;
		seen.add(key);
		await scheduleNextActionsRebuild(ctx, orgId, u);
	}
}
