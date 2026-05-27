/**
 * convex/ai/standingOrders/evaluator.ts
 *
 * Stage 8 of /SPRINT-PLAN.md (Autonomous layer). Cron-driven evaluator
 * that ticks once per minute (registered in `convex/crons.ts`).
 *
 * Stage 3-A.B.23 concurrency fix
 * ──────────────────────────────
 * Before: tick → `listEnabledForEvaluation` (full-table scan over
 *   every enabled row) → `shouldFireNow(...)` per row → maybe schedule
 *   runner. At 1000 enabled rows × 1 tick/min × 5 active orgs that's
 *   300k row-reads/hr even when nothing is due. The Convex Functions
 *   panel surfaced this as "Queries hit concurrency limit" on dev.
 *
 * After: tick → `listDueForEvaluation({ now })` reads via
 *   `withIndex("by_enabled_and_first_fire", q => q.eq("enabled",
 *   true).lte("firstFireAt", now))` — when no rows are due the read
 *   touches ZERO documents. The evaluator schedules every returned
 *   row (the index has already filtered to "due rows"). The runner
 *   re-validates the row inside its own transaction so a row that
 *   was disabled in the scheduling window is still honoured.
 *
 * The `firstFireAt` field is set on insert + recomputed after every
 * run + on schedule/enabled edits via `computeFirstFireAt` — see
 * `mutations.ts:createImpl/updateImpl/recordRunResult`. Migration
 * `2026_05_28_addStandingOrderFirstFireAt.ts` backfills existing
 * rows.
 *
 * Why a V8 action (not "use node"):
 *   - We don't call `streamText` here — only `runner.run` (which is `use node`)
 *     does that. Keeping the evaluator V8 means tests can drive it
 *     synchronously without the Node runtime spin-up.
 *   - Pure scheduling is bounded — even at 500 due rows the loop
 *     finishes well within the 60-second cron tick.
 *
 * Telemetry:
 *   The action returns `{ due, fired }` so the cron's structured
 *   logs surface a one-line health summary every minute. `fired` is
 *   the count of runner.run dispatches.
 */

import { internal } from "../../_generated/api";
import { internalAction } from "../../_generated/server";

// biome-ignore lint/suspicious/noExplicitAny: Convex pre-codegen forward ref pattern
const _ref = (path: string) => path as any;
// biome-ignore lint/suspicious/noExplicitAny: Convex pre-codegen forward ref pattern
const _anyArgs = (a: Record<string, unknown>) => a as any;

/**
 * Cron entry. Fires every minute; reads only rows whose `firstFireAt`
 * has elapsed; schedules `runner.run` for each one.
 *
 * The runner re-loads the row inside its own transaction (via
 * `getForRun`) and bumps `lastRunAt` + recomputes `firstFireAt` via
 * `recordRunResult` — so a row that was disabled in the scheduling
 * window is silently skipped, and a row that just fired won't fire
 * again on the next tick because its `firstFireAt` has moved forward.
 */
export const tick = internalAction({
	args: {},
	handler: async (ctx): Promise<{ due: number; fired: number }> => {
		const now = Date.now();
		const rows = await ctx.runQuery(internal.ai.standingOrders.queries.listDueForEvaluation, {
			now,
		});
		let fired = 0;
		for (const row of rows) {
			// runner.ts is a "use node" file; the generated `internal.*`
			// reference for it isn't always available at codegen time
			// when the runner depends on the evaluator file (cycle in
			// the dep graph at compile time). Use the string-path
			// forward-ref pattern that `briefingsActions.ts` and
			// `processChat.ts` already rely on for the same reason.
			await ctx.scheduler.runAfter(
				0,
				_ref("ai/standingOrders/runner:run"),
				_anyArgs({ standingOrderId: row.id }),
			);
			fired += 1;
		}
		return { due: rows.length, fired };
	},
});
