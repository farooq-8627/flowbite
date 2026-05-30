/**
 * convex/_migrations/2026_05_30_clearMockDataDismissedAt.ts
 *
 * Mock-data UX overhaul (2026-05-30) — clear the now-vestigial
 * `org.settings.mockDataDismissedAt` field on every org.
 *
 * Why this migration exists
 * ─────────────────────────
 * The "X" button on `<MockDataBanner />` used to call
 * `dismissMockDataBanner`, which patched `mockDataDismissedAt` so the
 * banner stayed hidden even though the seeded data was still in the
 * workspace. The user explicitly asked for the opposite behaviour —
 * the banner MUST stay visible until the data is actually cleared, so
 * "dismiss without clearing" was a footgun.
 *
 * In the same change:
 *   1. `<MockDataBanner />` was rewired so the "X" calls
 *      `clearMockData` (the same flow as the primary CTA).
 *   2. `convex/orgs/mutations.ts::dismissMockDataBanner` was deleted.
 *   3. `convex/ai/tools/layers/settings.ts` dropped
 *      `mockDataDismissedAt` from its allowlist.
 *
 * The schema field stays defined as `v.optional(v.number())` so this
 * migration's writes don't fail validation. Once we've confirmed no
 * other reader exists (next session, after this migration has run on
 * prod), the schema field will be removed in a follow-up — see
 * `Future-Enhancements.md §B`.
 *
 * Trigger
 * ───────
 *   npx convex run _migrations/2026_05_30_clearMockDataDismissedAt:run '{"dryRun": true}'
 *   (preview)
 *   npx convex run _migrations/2026_05_30_clearMockDataDismissedAt:run '{}'
 *   (apply)
 *
 * Idempotent — re-running on a clean DB returns `patched: 0`.
 */

import { v } from "convex/values";
import { internalMutation } from "../_generated/server";

export const run = internalMutation({
	args: { dryRun: v.optional(v.boolean()) },
	handler: async (ctx, args) => {
		const dryRun = args.dryRun === true;
		const orgs = await ctx.db.query("orgs").collect();
		let scanned = 0;
		let patched = 0;
		let alreadyClean = 0;
		const samples: Array<{ orgSlug: string; previousValue: number }> = [];

		for (const org of orgs) {
			scanned += 1;
			const settings = org.settings;
			const previousValue = settings?.mockDataDismissedAt;
			if (previousValue === undefined) {
				alreadyClean += 1;
				continue;
			}

			if (samples.length < 10) {
				samples.push({ orgSlug: org.slug, previousValue });
			}

			if (!dryRun) {
				const { mockDataDismissedAt: _drop, ...nextSettings } = settings ?? {};
				await ctx.db.patch(org._id, {
					settings: nextSettings,
					updatedAt: Date.now(),
				});
			}
			patched += 1;
		}

		return { dryRun, scanned, patched, alreadyClean, samples };
	},
});
