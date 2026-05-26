/**
 * Migration: normalize `org.settings.dashboardMetrics` to canonical
 * widget keys.
 *
 * Why
 * ───
 * Stage 1 of the dashboard fix wave (DASHBOARD-AUDIT.md §3) extended
 * `WIDGET_KEYS` from 12 KPI-only entries to 25 entries covering every
 * key the industry templates legitimately reference. In the same edit
 * we also collapsed the legacy `calendar.miniWidget` alias to its
 * canonical `calendar.mini` form. The corresponding row data on
 * `orgs.settings.dashboardMetrics` for orgs seeded prior to this
 * migration may still contain the legacy alias; this mutation walks
 * those rows and rewrites them in-place so the dashboard renders
 * correctly and the AI tool `update_dashboard_layout` can read +
 * write the canonical set without surprise.
 *
 * The migration is purely an array rewrite — no schema change. The
 * `dashboardMetrics` validator on `orgs.settings` is `v.array(v.string())`
 * so legacy values continue to validate; what changes is whether
 * `validateDashboardLayout` accepts each entry. Running this mutation
 * makes existing rows match the new acceptance contract.
 *
 * What this does
 * ──────────────
 *  1. Walk every org. (Matches the existing `2026_05_24_dropOrgAiContext`
 *     pattern — collect-style iteration; safe for the dev DB's <1k orgs.
 *     If the org count grows past the Convex transaction limit, switch
 *     to a paginated self-scheduling form per Convex query guidelines.)
 *  2. For each org with a non-empty `settings.dashboardMetrics`, run
 *     `normalizeDashboardLayout` from the registry — applies the
 *     `LEGACY_KEY_RENAMES` map (calendar.miniWidget → calendar.mini),
 *     collapses duplicates, and drops keys not in `WIDGET_KEYS`.
 *  3. If the resulting array differs from the stored array, patch the
 *     org row. Otherwise skip — the migration is idempotent.
 *  4. Aggregate counts (scanned / patched / renamed / dropped) and
 *     return them so the run is auditable.
 *
 * Idempotent: running again is a no-op once every row matches the
 * new canonical form.
 *
 * Triggered manually:
 *   npx convex run --component _migrations._2026_05_26_normalizeDashboardMetrics:run
 *   (use `dryRun: true` first to preview the rewrite without writing)
 */

import { v } from "convex/values";
import { internalMutation } from "../_generated/server";
import { normalizeDashboardLayout } from "../_shared/widgetRegistry";

export const run = internalMutation({
	args: {
		dryRun: v.optional(v.boolean()),
	},
	handler: async (ctx, args) => {
		const dryRun = args.dryRun ?? false;
		const orgs = await ctx.db.query("orgs").collect();

		let scanned = 0;
		let patched = 0;
		let unchanged = 0;
		let renamedKeys = 0;
		let droppedKeys = 0;
		const droppedSamples: string[] = [];
		const renameSamples: Array<{ orgSlug: string; from: string; to: string }> = [];

		for (const org of orgs) {
			scanned += 1;
			const current = org.settings?.dashboardMetrics;
			if (!current || current.length === 0) {
				unchanged += 1;
				continue;
			}

			const result = normalizeDashboardLayout(current);
			const next = result.keys as readonly string[];

			renamedKeys += result.renamed.length;
			droppedKeys += result.rejected.length;

			// Collect a small sample for the response — easier debugging.
			for (const r of result.renamed) {
				if (renameSamples.length < 10) {
					renameSamples.push({ orgSlug: org.slug, from: r.from, to: r.to });
				}
			}
			for (const k of result.rejected) {
				if (droppedSamples.length < 10) droppedSamples.push(`${org.slug}:${k}`);
			}

			// Skip if nothing changed (idempotent guard).
			const sameLength = next.length === current.length;
			const sameOrder = sameLength && next.every((k, i) => k === current[i]);
			if (sameOrder) {
				unchanged += 1;
				continue;
			}

			if (!dryRun) {
				await ctx.db.patch(org._id, {
					settings: {
						...(org.settings ?? {}),
						dashboardMetrics: [...next],
					},
					updatedAt: Date.now(),
				});
			}
			patched += 1;
		}

		return {
			scanned,
			patched,
			unchanged,
			renamedKeys,
			droppedKeys,
			renameSamples,
			droppedSamples,
			dryRun,
		};
	},
});
