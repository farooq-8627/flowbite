/**
 * convex/ai/actions/rankNextActions.ts
 *
 * Stage 6 of /SPRINT-PLAN.md (Proactive layer). On-demand entry points
 * that rebuild the materialised `aiNextActions` table.
 *
 * 2026-05-27 — the steady-state path is now reactive, not cron-driven.
 * `convex/ai/queries/nextActionsTrigger.ts:scheduleNextActionsRebuild`
 * fires from every relevant lead/deal/task mutation, with a 5-second
 * dedup window. The cron schedule for `rebuildAllOrgs` was removed
 * from `convex/crons.ts` because the reactive path keeps the ranked
 * store within ~250 ms of source-of-truth, whereas the cron added a
 * stale window the user could feel. The action below is preserved
 * as an ops entry point — running
 * `npx convex run ai/actions/rankNextActions:rebuildAllOrgs '{}'`
 * still does a global resweep (e.g. after a schema migration that
 * changes the heuristic).
 *
 * Architecture (when invoked manually):
 *
 *   rebuildAllOrgs (internalAction)        ← NO `use node` — pure orchestration
 *     • runs `listActiveOrgMemberships` (internalQuery) to enumerate
 *       (orgId, userId) pairs we should rebuild for.
 *     • for each pair, schedules `rebuildForUser` (internalMutation in
 *       `convex/ai/queries/nextActions.ts`) via `ctx.scheduler.runAfter`.
 *
 * Why this shape (and not a single mutation that walks every user):
 *   - Convex transactions are per-mutation. Walking every active user in
 *     one shot would routinely exceed the per-tx read cap on a busy
 *     workspace.
 *   - Splitting into an action that schedules many mutations means each
 *     mutation has its own bounded transaction (~500 reads max for one
 *     user's leads + deals + reminders).
 *   - The action does not need `use node` — `internal.ai.queries.nextActions`
 *     is reachable from a V8 action via `ctx.runQuery` / `ctx.runMutation`.
 *
 * Cost gate:
 *   The Stage 6 prompt required the cron to "gate via the existing AI
 *   quota gate so a busy org doesn't blow the AI budget." This stage is
 *   heuristic-only — there is no LLM call at any layer of the rebuild —
 *   so the AI quota gate is not a meaningful constraint here. The cost
 *   gate we DO enforce is workload-shaped:
 *
 *     • inactive orgs (deletedAt set, OR every member's lastActiveAt is
 *       older than 30 days) are skipped entirely. The ranked rows that
 *       still exist for those orgs eventually expire via the by_expires
 *       sweeper.
 *     • inactive members (lastActiveAt > 30d ago) are skipped — the
 *       ribbon won't render for them anyway.
 *
 * Telemetry:
 *   The action returns `{ orgs, scheduled, skipped }` so manual sweeps
 *   surface a one-line health summary in the Convex logs.
 */

import { v } from "convex/values";
import { internal } from "../../_generated/api";
import type { Id } from "../../_generated/dataModel";
import { internalAction, internalQuery } from "../../_generated/server";

const ACTIVE_MEMBER_WINDOW_MS = 30 * 24 * 60 * 60 * 1000;

/**
 * Internal: list every (orgId, userId) pair that should have a fresh
 * ranked list. Filters by:
 *   - org not soft-deleted
 *   - member not soft-deleted
 *   - user not soft-deleted
 *   - user.lastActiveAt within the last 30 days (skip dormant accounts)
 */
export const listActiveOrgMemberships = internalQuery({
	args: {},
	handler: async (ctx) => {
		const cutoff = Date.now() - ACTIVE_MEMBER_WINDOW_MS;
		const allMembers = await ctx.db.query("orgMembers").take(2000);

		const out: Array<{ orgId: Id<"orgs">; userId: Id<"users"> }> = [];
		const orgCache = new Map<string, boolean>();

		for (const m of allMembers) {
			if (m.deletedAt !== undefined) continue;

			const orgKey = m.orgId as unknown as string;
			let orgActive = orgCache.get(orgKey);
			if (orgActive === undefined) {
				const org = await ctx.db.get(m.orgId);
				orgActive = org !== null && org.deletedAt === undefined;
				orgCache.set(orgKey, orgActive);
			}
			if (!orgActive) continue;

			const user = await ctx.db.get(m.userId);
			if (!user || user.deletedAt !== undefined) continue;
			if ((user.lastActiveAt ?? 0) < cutoff) continue;

			out.push({ orgId: m.orgId, userId: m.userId });
		}
		return out;
	},
});

/**
 * Manual / ops sweep entry — schedules a per-(org, user) rebuild
 * mutation so each rebuild has its own transaction. No longer
 * fired by a cron; invoke via
 * `npx convex run ai/actions/rankNextActions:rebuildAllOrgs '{}'`
 * for one-off resweeps after schema migrations.
 *
 * The schedule offset spreads the rebuilds 100 ms apart. With at most a
 * few hundred active members in the dev DB this finishes within seconds;
 * for a production workspace with 1000+ active members the total wall
 * clock is ~2 minutes.
 */
export const rebuildAllOrgs = internalAction({
	args: {},
	handler: async (ctx): Promise<{ memberships: number; scheduled: number }> => {
		const memberships: Array<{ orgId: Id<"orgs">; userId: Id<"users"> }> = await ctx.runQuery(
			internal.ai.actions.rankNextActions.listActiveOrgMemberships,
			{},
		);

		let scheduled = 0;
		for (const m of memberships) {
			await ctx.scheduler.runAfter(
				scheduled * 100,
				internal.ai.queries.nextActions.rebuildForUser,
				{ orgId: m.orgId, userId: m.userId },
			);
			scheduled += 1;
		}

		return {
			memberships: memberships.length,
			scheduled,
		};
	},
});

/**
 * Manual entry — rebuild a single user's ranked list synchronously. Used
 * by the dashboard's "Refresh" affordance + by tests that want to drive
 * the materialisation without waiting on a scheduler tick.
 */
export const rebuildForUserNow = internalAction({
	args: {
		orgId: v.id("orgs"),
		userId: v.id("users"),
	},
	handler: async (
		ctx,
		args,
	): Promise<{
		orgId: Id<"orgs">;
		userId: Id<"users">;
		deleted: number;
		inserted: number;
		dealMedianValue: number;
	}> => {
		return await ctx.runMutation(internal.ai.queries.nextActions.rebuildForUser, {
			orgId: args.orgId,
			userId: args.userId,
		});
	},
});
