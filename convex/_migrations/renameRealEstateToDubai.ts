/**
 * 2026-05-21 — Rename `org.industry === "real-estate"` to `"dubai-real-estate"`
 * for orgs seeded before the general real-estate template existed.
 *
 * Why
 * ───
 * The single `real-estate` template ID was originally Gulf-specific (RERA,
 * Form F, Ejari, Emirates ID, 90-day rent renewal). With this release we
 * split it into:
 *   - `dubai-real-estate` — the original Gulf workflow (kept untouched).
 *   - `real-estate`        — a region-neutral template (no RERA / Ejari).
 *
 * Existing orgs whose `industry` is `"real-estate"` were onboarded with
 * the Gulf workflow (their fieldDefinitions table already holds rows like
 * `rera_orn`, `trade_license`, `ejari_number`). To keep the AI persona,
 * Reminders → "Rent Renewal Alert" toggle, and any future industry-aware
 * code paths consistent for those workspaces, we update their `industry`
 * pointer to the new `"dubai-real-estate"` id.
 *
 * Strategy
 * ────────
 *  - For every org with `industry === "real-estate"`, patch to
 *    `"dubai-real-estate"`.
 *  - Idempotent — orgs that already moved are skipped.
 *  - The `fieldDefinitions` rows themselves don't need touching: every row
 *    they care about (rera_orn, ejari_number, …) is still present and
 *    still matches what the curated `dubai-real-estate` template seeds.
 *
 * Run via:
 *     npx convex run _migrations/renameRealEstateToDubai:run '{}'
 */

import { v } from "convex/values";
import { internalMutation } from "../_generated/server";

export const run = internalMutation({
	args: { dryRun: v.optional(v.boolean()) },
	handler: async (ctx, args) => {
		const dryRun = args.dryRun ?? false;
		const orgs = await ctx.db.query("orgs").collect();

		let renamed = 0;
		let alreadyOk = 0;
		let untouched = 0;

		for (const org of orgs) {
			if (org.deletedAt !== undefined) continue;
			if (org.industry === "real-estate") {
				if (!dryRun) {
					await ctx.db.patch(org._id, {
						industry: "dubai-real-estate",
						updatedAt: Date.now(),
					});
				}
				renamed += 1;
			} else if (org.industry === "dubai-real-estate") {
				alreadyOk += 1;
			} else {
				untouched += 1;
			}
		}

		return {
			dryRun,
			orgsScanned: orgs.length,
			renamed,
			alreadyOk,
			untouched,
		};
	},
});
