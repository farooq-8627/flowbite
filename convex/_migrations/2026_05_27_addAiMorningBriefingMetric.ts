/**
 * convex/_migrations/2026_05_27_addAiMorningBriefingMetric.ts
 *
 * Stage 3-A.3 of /SPRINT-PLAN.md (Proactive UX hardening). Backfill
 * `ai.morningBriefing` into every existing org's
 * `settings.dashboardMetrics` array so workspaces seeded BEFORE Stage 5
 * see the daily/weekly briefing surface without manual customisation.
 *
 * Why a migration (not runtime backfill)
 * ──────────────────────────────────────
 * Per AGENTS.md → "RULE: Convex schema/data changes — migrate IN THE
 * SAME MESSAGE, never defer" + the user's explicit ask: NO runtime
 * normalisation fallbacks. We ship the migration, run it once on dev
 * (re-running is a no-op), then trust the data going forward. The
 * runtime path (`DashboardHomeView` + `resolveWidgets`) reads
 * `settings.dashboardMetrics` verbatim — there is no "if missing,
 * inject ai.morningBriefing" fallback anywhere in the render code.
 *
 * Behaviour
 * ─────────
 * 1. Walk every `orgs` row.
 * 2. Skip orgs with no explicit `dashboardMetrics` array — those use
 *    the default layout from `resolveWidgets` and pick up new keys
 *    automatically.
 * 3. Skip orgs that already include `ai.morningBriefing` (idempotent).
 * 4. For orgs that need patching, insert `ai.morningBriefing` BEFORE
 *    `ai.pulseRibbon` if present so the AI block stays grouped at the
 *    top; otherwise prepend to the front.
 *
 * Re-running the migration on a clean DB returns `patched: 0`. That
 * `unchanged` count is the integration-test signal that the job is
 * done.
 *
 * Trigger
 * ───────
 *   npx convex run --component _migrations._2026_05_27_addAiMorningBriefingMetric:run
 *   (`dryRun: true` previews the rewrite without persisting)
 */

import { v } from "convex/values";
import { internalMutation } from "../_generated/server";

const KEY = "ai.morningBriefing";
const PULSE_RIBBON_KEY = "ai.pulseRibbon";

export const run = internalMutation({
	args: {
		dryRun: v.optional(v.boolean()),
	},
	handler: async (ctx, args) => {
		const dryRun = args.dryRun === true;
		const orgs = await ctx.db.query("orgs").collect();

		let scanned = 0;
		let patched = 0;
		let unchanged = 0;
		let skippedNoArray = 0;
		const patchedSlugs: string[] = [];

		for (const org of orgs) {
			scanned += 1;
			const settings = org.settings;
			const current = settings?.dashboardMetrics;

			if (!Array.isArray(current) || current.length === 0) {
				skippedNoArray += 1;
				continue;
			}

			if (current.includes(KEY)) {
				unchanged += 1;
				continue;
			}

			// Insert before ai.pulseRibbon when present so the AI block
			// stays grouped at the top of the array. Otherwise prepend.
			const pulseIdx = current.indexOf(PULSE_RIBBON_KEY);
			const next =
				pulseIdx >= 0
					? [...current.slice(0, pulseIdx), KEY, ...current.slice(pulseIdx)]
					: [KEY, ...current];

			if (!dryRun) {
				await ctx.db.patch(org._id, {
					settings: { ...(settings ?? {}), dashboardMetrics: next },
					updatedAt: Date.now(),
				});
			}
			patched += 1;
			if (patchedSlugs.length < 10) patchedSlugs.push(org.slug);
		}

		return {
			dryRun,
			scanned,
			patched,
			unchanged,
			skippedNoArray,
			patchedSlugs,
		};
	},
});
