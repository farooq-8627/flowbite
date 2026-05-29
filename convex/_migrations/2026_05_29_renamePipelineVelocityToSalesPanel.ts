/**
 * convex/_migrations/2026_05_29_renamePipelineVelocityToSalesPanel.ts
 *
 * Stage 2 of /DASHBOARD-V2-PLAN.md (2026-05-29) — backfill the
 * `pipeline.velocity` → `pipeline.salesPanel` rename across every
 * existing `org.settings.dashboardMetrics` array.
 *
 * Why this migration exists
 * ─────────────────────────
 * `pipeline.velocity` was retired and `pipeline.salesPanel` (Summary +
 * Velocity + Forecast tabs) added in `convex/_shared/widgetRegistry.ts`
 * in the same edit. Templates were flipped in lock-step. But existing
 * orgs already wrote `pipeline.velocity` into their `dashboardMetrics`
 * (Stage 7 of /SPRINT-PLAN.md seeded it via
 * `_migrations/2026_05_28_addPipelineVelocityWidget.ts`). Without this
 * follow-up:
 *
 *   1. `validateDashboardLayout` would reject `pipeline.velocity` as
 *      unknown on the next write — causing the AI's
 *      `update_dashboard_layout` tool to surface the rejection in the
 *      Settings → Dashboard editor.
 *   2. The dashboard renderer's `isEnabled("pipeline.salesPanel")`
 *      gate would return `false` for these orgs — dropping the panel
 *      from the page silently until an owner re-saved their layout.
 *
 * Both are loud + recoverable, but neither is the right experience.
 * This migration walks every org once, replaces the legacy key with
 * the canonical one in-place, and is idempotent so re-running on a
 * clean DB returns `patched: 0`.
 *
 * Trigger
 * ───────
 *   npx convex run _migrations/2026_05_29_renamePipelineVelocityToSalesPanel:run
 *   (`dryRun: true` previews without writing)
 */

import { v } from "convex/values";
import { internalMutation } from "../_generated/server";

const LEGACY_KEY = "pipeline.velocity";
const CANONICAL_KEY = "pipeline.salesPanel";

export const run = internalMutation({
	args: { dryRun: v.optional(v.boolean()) },
	handler: async (ctx, args) => {
		const dryRun = args.dryRun === true;
		const orgs = await ctx.db.query("orgs").collect();
		let scanned = 0;
		let patched = 0;
		let unchanged = 0;
		let renamed = 0;
		let dedupedDuplicates = 0;
		const samples: Array<{ orgSlug: string; before: string[]; after: string[] }> = [];

		for (const org of orgs) {
			scanned += 1;
			const settings = org.settings;
			const metrics = settings?.dashboardMetrics;
			if (!Array.isArray(metrics)) {
				unchanged += 1;
				continue;
			}

			let changed = false;
			let renamedHere = 0;
			const seen = new Set<string>();
			const next: string[] = [];
			for (const k of metrics) {
				const remapped = k === LEGACY_KEY ? CANONICAL_KEY : k;
				if (remapped !== k) {
					changed = true;
					renamedHere += 1;
				}
				if (seen.has(remapped)) {
					// Same key already present — drop the duplicate produced by
					// the rename (e.g. an org whose array contained both
					// `pipeline.velocity` and `pipeline.salesPanel`).
					dedupedDuplicates += 1;
					changed = true;
					continue;
				}
				seen.add(remapped);
				next.push(remapped);
			}

			if (!changed) {
				unchanged += 1;
				continue;
			}

			renamed += renamedHere;
			if (samples.length < 10) {
				samples.push({ orgSlug: org.slug, before: [...metrics], after: next });
			}

			if (!dryRun) {
				await ctx.db.patch(org._id, {
					settings: { ...(settings ?? {}), dashboardMetrics: next },
					updatedAt: Date.now(),
				});
			}
			patched += 1;
		}

		return { dryRun, scanned, patched, unchanged, renamed, dedupedDuplicates, samples };
	},
});
