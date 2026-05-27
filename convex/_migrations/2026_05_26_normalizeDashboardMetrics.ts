/**
 * Migration: normalize `org.settings.dashboardMetrics` to canonical
 * widget keys.
 *
 * Stage 1 of the dashboard fix wave (DASHBOARD-AUDIT.md §3) extended
 * `WIDGET_KEYS` from 12 KPI-only entries to 25 entries and collapsed
 * the legacy `calendar.miniWidget` alias to its canonical
 * `calendar.mini` form. This migration walks every org row and
 * rewrites the array in-place so existing data matches the new
 * acceptance contract.
 *
 * Stage 3-A session 2 update — pure-code directive
 * ─────────────────────────────────────────────────
 * The legacy alias map + normalizer USED to live as runtime exports on
 * `convex/_shared/widgetRegistry.ts` (`LEGACY_KEY_RENAMES` +
 * `normalizeDashboardLayout`). Per the user's "no runtime backfill,
 * pure code only" directive on 2026-05-27, the runtime path no longer
 * carries any alias logic — every write goes through
 * `validateDashboardLayout` which rejects unknown keys. The alias map
 * + collapser now live LOCALLY here, scoped to the migration. Once
 * this migration has run on every deployment + every existing row has
 * been rewritten, the alias map is fully consumed.
 *
 * Idempotent: running again on a clean DB returns `patched: 0`.
 *
 * Trigger
 * ───────
 *   npx convex run --component _migrations._2026_05_26_normalizeDashboardMetrics:run
 *   (`dryRun: true` previews without writing)
 */

import { v } from "convex/values";
import { internalMutation } from "../_generated/server";
import { isWidgetKey, type WidgetKey } from "../_shared/widgetRegistry";

/**
 * Legacy → canonical key rename map. Migration-private (no longer
 * exported to runtime). Add new entries here when you rename a widget
 * key, then run the migration once + delete the entry afterwards.
 */
const LEGACY_KEY_RENAMES_LOCAL: Record<string, WidgetKey> = {
	"calendar.miniWidget": "calendar.mini",
};

function normalizeForMigration(input: readonly string[]): {
	keys: WidgetKey[];
	rejected: string[];
	renamed: Array<{ from: string; to: WidgetKey }>;
} {
	const seen = new Set<string>();
	const keys: WidgetKey[] = [];
	const rejected: string[] = [];
	const renamed: Array<{ from: string; to: WidgetKey }> = [];
	for (const raw of input) {
		const aliasTarget = LEGACY_KEY_RENAMES_LOCAL[raw];
		const candidate = aliasTarget ?? raw;
		if (seen.has(candidate)) continue;
		seen.add(candidate);
		if (isWidgetKey(candidate)) {
			keys.push(candidate);
			if (aliasTarget) renamed.push({ from: raw, to: aliasTarget });
		} else {
			rejected.push(raw);
		}
	}
	return { keys, rejected, renamed };
}

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

			const result = normalizeForMigration(current);
			const next = result.keys as readonly string[];

			renamedKeys += result.renamed.length;
			droppedKeys += result.rejected.length;

			for (const r of result.renamed) {
				if (renameSamples.length < 10) {
					renameSamples.push({ orgSlug: org.slug, from: r.from, to: r.to });
				}
			}
			for (const k of result.rejected) {
				if (droppedSamples.length < 10) droppedSamples.push(`${org.slug}:${k}`);
			}

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
