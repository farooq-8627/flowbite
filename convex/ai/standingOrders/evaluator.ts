/**
 * convex/ai/standingOrders/evaluator.ts
 *
 * Stage 8 of /SPRINT-PLAN.md (Autonomous layer). Cron-driven evaluator
 * that ticks once per minute (registered in `convex/crons.ts`).
 *
 * Architecture:
 *   crons.ts: evaluate-ai-standing-orders (every minute)
 *     → tick (internalAction, V8 runtime)
 *         → listEnabledForEvaluation (internalQuery): pull every enabled row.
 *         → for each row:
 *             - call shouldFireNow(schedule, now, lastRunAt)
 *             - if true: scheduler.runAfter(0, runner.run, { id }) AND
 *               patch row.lastRunAt = now via recordRunResult
 *
 * Why a V8 action (not "use node"):
 *   - We don't call `streamText` here — only `runner.run` (which is `use node`)
 *     does that. Keeping the evaluator V8 means tests can drive it
 *     synchronously without the Node runtime spin-up.
 *   - Pure scheduling is bounded — even at 1000 enabled rows the loop
 *     finishes well within the 60-second cron tick.
 *
 * Telemetry:
 *   The action returns `{ enabled, fired }` so the cron's structured
 *   logs surface a one-line health summary every minute. `fired` is
 *   the count of rows that matched their schedule on this tick.
 */

import { internal } from "../../_generated/api";
import { internalAction } from "../../_generated/server";
import { shouldFireNow } from "./schedule";

// biome-ignore lint/suspicious/noExplicitAny: Convex pre-codegen forward ref pattern
const _ref = (path: string) => path as any;
// biome-ignore lint/suspicious/noExplicitAny: Convex pre-codegen forward ref pattern
const _anyArgs = (a: Record<string, unknown>) => a as any;

/**
 * Cron entry. Fires every minute; checks every enabled standing order;
 * schedules `runner.run` for any whose schedule has matched.
 *
 * The lastRunAt bump happens inside the runner — NOT here — so that a
 * row that was scheduled but failed to actually start (action runtime
 * crash, scheduler backlog) still re-fires on the next tick instead of
 * being silently skipped for a day.
 */
export const tick = internalAction({
	args: {},
	handler: async (ctx): Promise<{ enabled: number; fired: number }> => {
		const rows = await ctx.runQuery(
			internal.ai.standingOrders.queries.listEnabledForEvaluation,
			{},
		);
		const now = Date.now();
		let fired = 0;
		for (const row of rows) {
			if (!shouldFireNow(row.schedule, now, row.lastRunAt)) continue;
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
		return { enabled: rows.length, fired };
	},
});
