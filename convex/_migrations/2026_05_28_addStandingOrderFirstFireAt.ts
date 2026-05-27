/**
 * convex/_migrations/2026_05_28_addStandingOrderFirstFireAt.ts
 *
 * Stage 3-A.B.23 of /SPRINT-PLAN.md (Convex concurrency hotspot fix).
 *
 * Backfills `aiStandingOrders.firstFireAt` for every row that exists
 * BEFORE the field was introduced. Without the backfill, the cron
 * evaluator's `by_enabled_and_first_fire` index would return zero rows
 * on every tick because every existing row's `firstFireAt` is
 * `undefined` and `undefined` sorts as "less than" any number — but
 * Convex's `.lte("firstFireAt", now)` filter excludes the undefined
 * values. After this migration runs, every enabled row has the
 * computed next-fire time and the evaluator's index-bounded read
 * becomes the only path to fire.
 *
 * Idempotent: re-running on a row that already has `firstFireAt` set
 * is a no-op (the row goes into `unchanged`). Safe to re-run after
 * scaling events.
 *
 * For disabled rows (`enabled === false`) we leave `firstFireAt`
 * undefined — the index keys on `enabled = true` so disabled rows
 * never appear regardless. Setting it would just be noise.
 *
 * Why this lives in `_migrations/` (not in the Stage 8 schema migration)
 * ────────────────────────────────────────────────────────────────────
 * Stage 8 didn't have the `firstFireAt` field at all — adding it +
 * the index is a Stage 3-A schema change. Per AGENTS.md "RULE: Convex
 * schema/data changes — migrate IN THE SAME MESSAGE", this migration
 * ships in the same edit as the schema change and the writer changes
 * (`mutations.ts:createImpl` / `updateImpl` / `recordRunResult`).
 *
 * Trigger
 * ───────
 *   npx convex run --component _migrations._2026_05_28_addStandingOrderFirstFireAt:run
 *   (`dryRun: true` previews the rewrite without persisting)
 */

import { v } from "convex/values";
import { internalMutation } from "../_generated/server";
import { computeFirstFireAt } from "../ai/standingOrders/schedule";

export const run = internalMutation({
	args: {
		dryRun: v.optional(v.boolean()),
	},
	handler: async (ctx, args) => {
		const dryRun = args.dryRun === true;
		const rows = await ctx.db.query("aiStandingOrders").collect();

		let scanned = 0;
		let patched = 0;
		let unchanged = 0;
		let skippedDisabled = 0;

		const now = Date.now();
		for (const row of rows) {
			scanned += 1;
			if (!row.enabled) {
				skippedDisabled += 1;
				continue;
			}
			if (row.firstFireAt !== undefined) {
				unchanged += 1;
				continue;
			}
			const firstFireAt = computeFirstFireAt(row.schedule, now, row.lastRunAt);
			if (!dryRun) {
				await ctx.db.patch(row._id, {
					firstFireAt,
					updatedAt: now,
				});
			}
			patched += 1;
		}

		return {
			dryRun,
			scanned,
			patched,
			unchanged,
			skippedDisabled,
		};
	},
});
