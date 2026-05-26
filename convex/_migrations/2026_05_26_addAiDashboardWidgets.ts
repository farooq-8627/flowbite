/**
 * Migration: append Stage 5 AI dashboard widget keys to existing
 * `org.settings.dashboardMetrics` arrays.
 *
 * Why
 * ───
 * Stage 5 (SPRINT-PLAN.md) ships two new dashboard widgets:
 *   - `ai.quickComposer` — pinned mini chat composer at the top of the
 *     dashboard.
 *   - `ai.pulseRibbon` — top-3 highest-value AI suggestions, dismissible.
 *
 * Both keys were added to `WIDGET_KEYS` in `convex/_shared/widgetRegistry.ts`
 * and opted into every industry template's `dashboardMetrics` array in the
 * same edit. Orgs seeded BEFORE this migration still have the old layouts,
 * which means the new widgets don't render for them by default. This
 * migration walks every org and inserts the two keys at the start of the
 * array (so they render above the existing widgets) when they are missing.
 *
 * It is purely an array rewrite — no schema change. The
 * `dashboardMetrics` validator on `orgs.settings` is `v.array(v.string())`
 * so legacy values continue to validate.
 *
 * What this does
 * ──────────────
 *  1. Walk every org. (Same collect-style iteration as
 *     `2026_05_26_normalizeDashboardMetrics.ts`; safe for the dev DB's
 *     <1k orgs. Switch to a paginated form once we approach the Convex
 *     transaction limit.)
 *  2. Skip orgs without a `settings.dashboardMetrics` array — those use
 *     the default registry layout and pick up the new keys via
 *     `resolveWidgets` automatically.
 *  3. For each org that has an explicit array, insert any of the two new
 *     keys that are missing at the FRONT of the array (after any leading
 *     `ai.morningBriefing` if present, so the AI block renders together).
 *  4. Skip if both keys already present (idempotent).
 *
 * Idempotent: running again is a no-op once every row contains both
 * keys.
 *
 * Triggered manually:
 *   npx convex run --component _migrations._2026_05_26_addAiDashboardWidgets:run
 *   (use `dryRun: true` first to preview the rewrite without writing)
 */

import { v } from "convex/values";
import { internalMutation } from "../_generated/server";
import { isWidgetKey, WIDGET_KEYS } from "../_shared/widgetRegistry";

const NEW_KEYS = ["ai.pulseRibbon", "ai.quickComposer"] as const;
const AI_BRIEFING_KEY = "ai.morningBriefing" as const;

export const run = internalMutation({
	args: {
		dryRun: v.optional(v.boolean()),
	},
	handler: async (ctx, args) => {
		// Compile-time guard — fail loudly here if a NEW_KEY ever drifts
		// out of WIDGET_KEYS. The migration must never write a key that
		// `validateDashboardLayout` would later reject.
		for (const k of NEW_KEYS) {
			if (!isWidgetKey(k)) {
				throw new Error(
					`addAiDashboardWidgets: NEW_KEY '${k}' is not a registered widget key. WIDGET_KEYS=${WIDGET_KEYS.join(",")}`,
				);
			}
		}

		const dryRun = args.dryRun ?? false;
		const orgs = await ctx.db.query("orgs").collect();

		let scanned = 0;
		let patched = 0;
		let unchanged = 0;
		let skippedNoArray = 0;
		const patchedSlugs: string[] = [];

		for (const org of orgs) {
			scanned += 1;
			const current = org.settings?.dashboardMetrics;

			// No explicit layout → defaults pick up the new keys via
			// `resolveWidgets`. Nothing to patch.
			if (!current || current.length === 0) {
				skippedNoArray += 1;
				continue;
			}

			const missing = NEW_KEYS.filter((k) => !current.includes(k));
			if (missing.length === 0) {
				unchanged += 1;
				continue;
			}

			// Insert missing keys after a leading `ai.morningBriefing` if
			// present, so the AI block stays grouped at the top. If
			// absent, prepend them to the front.
			let next: string[];
			if (current[0] === AI_BRIEFING_KEY) {
				next = [current[0], ...missing, ...current.slice(1)];
			} else {
				next = [...missing, ...current];
			}

			if (!dryRun) {
				await ctx.db.patch(org._id, {
					settings: {
						...(org.settings ?? {}),
						dashboardMetrics: next,
					},
					updatedAt: Date.now(),
				});
			}
			patched += 1;
			if (patchedSlugs.length < 10) patchedSlugs.push(org.slug);
		}

		return {
			scanned,
			patched,
			unchanged,
			skippedNoArray,
			patchedSlugs,
			dryRun,
		};
	},
});
