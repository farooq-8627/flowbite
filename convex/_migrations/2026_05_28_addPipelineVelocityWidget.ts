/**
 * convex/_migrations/2026_05_28_addPipelineVelocityWidget.ts
 *
 * Stage 7 of /SPRINT-PLAN.md — opts existing org dashboards into the
 * new `pipeline.velocity` widget by appending the key to
 * `org.settings.dashboardMetrics` for every org that doesn't already
 * have it.
 *
 * Idempotent: re-running the mutation on an org that already has the
 * key is a no-op (`unchanged` count goes up, `patched` stays at 0).
 *
 * `dryRun: true` previews the write without persisting — same shape
 * as the Stage 5 dashboard-widgets migration so ops can compare runs
 * with `--diff`.
 */

import { v } from "convex/values";
import { internalMutation } from "../_generated/server";

const KEY_TO_INSERT = "pipeline.velocity";

export const run = internalMutation({
	args: { dryRun: v.optional(v.boolean()) },
	handler: async (ctx, args) => {
		const dryRun = args.dryRun === true;
		const orgs = await ctx.db.query("orgs").collect();
		let scanned = 0;
		let patched = 0;
		let unchanged = 0;
		let skippedNoArray = 0;

		for (const org of orgs) {
			scanned += 1;
			const settings = org.settings;
			const metrics = settings?.dashboardMetrics;
			if (!Array.isArray(metrics)) {
				skippedNoArray += 1;
				continue;
			}
			if (metrics.includes(KEY_TO_INSERT)) {
				unchanged += 1;
				continue;
			}
			const next = [...metrics, KEY_TO_INSERT];
			if (!dryRun) {
				await ctx.db.patch(org._id, {
					settings: { ...settings, dashboardMetrics: next },
					updatedAt: Date.now(),
				});
			}
			patched += 1;
		}

		return { dryRun, scanned, patched, unchanged, skippedNoArray };
	},
});
