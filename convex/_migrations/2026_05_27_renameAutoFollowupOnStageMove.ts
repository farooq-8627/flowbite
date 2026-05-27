/**
 * Migration — Stage 4B follow-up: rename
 * `users.preferences.aiAutonomy.autoFollowupOnStageMove` →
 * `users.preferences.aiAutonomy.autoTaskOnStageMove`.
 *
 * Closes G4 of P1.6.A (PENDING.md). The Stage 4B SHIPPED row claimed
 * this rename was complete but a code-scan on 2026-05-27 confirmed it
 * never landed. The validator in `convex/schema/identity.ts` was
 * flipped in the same edit as this migration; this file walks every
 * `users` row that still carries the legacy key, copies the boolean
 * value into the new key, and clears the old field.
 *
 * Per Decision #5 of TASKS-RENAME-PLAN.md (ONE verb family — `task_*`),
 * the autonomy preference name aligns with the rest of the rename:
 *   - activity log actions: task_*
 *   - permissions:           tasks.*
 *   - notification keys:     task_due / task_overdue (renamed in G9)
 *
 * Idempotent — re-running is safe and a no-op once every row is in the
 * new shape. Designed to run once on dev (laudable-mockingbird-383)
 * and once on prod (wary-fly-391) before the schema validator change
 * starts rejecting writes that still carry the old key.
 *
 * How to run
 * ──────────
 *   npx convex run _migrations/2026_05_27_renameAutoFollowupOnStageMove:run '{}'
 *
 * Or dry-run first:
 *   npx convex run _migrations/2026_05_27_renameAutoFollowupOnStageMove:run \
 *     '{ "dryRun": true }'
 */
// biome-ignore-all lint/suspicious/noExplicitAny: legacy `autoFollowupOnStageMove` key is dropped from the schema in the same edit; the cast lets the migration read the historical value before the schema change takes effect.

import { v } from "convex/values";
import { internalMutation } from "../_generated/server";

export const run = internalMutation({
	args: {
		dryRun: v.optional(v.boolean()),
	},
	handler: async (ctx, args) => {
		const dryRun = args.dryRun ?? false;

		const users = await ctx.db.query("users").collect();

		let scanned = 0;
		let patched = 0;
		let alreadyMigrated = 0;
		let noLegacyKey = 0;

		for (const user of users) {
			scanned++;
			const prefs = (user.preferences ?? {}) as Record<string, unknown> & {
				aiAutonomy?: {
					autoFollowupOnStageMove?: boolean;
					autoTaskOnStageMove?: boolean;
					autoEnrichOnContactCreate?: boolean;
					autoTagOnNote?: boolean;
					weeklyDigestEmail?: boolean;
				};
			};
			const autonomy = prefs.aiAutonomy ?? {};
			const legacy = (autonomy as any).autoFollowupOnStageMove;

			if (legacy === undefined) {
				if ((autonomy as any).autoTaskOnStageMove !== undefined) {
					alreadyMigrated++;
				} else {
					noLegacyKey++;
				}
				continue;
			}

			// Pick the freshest existing value: prefer an explicit new-key
			// value if both exist (the new key is the source of truth in
			// post-migration code paths). Otherwise carry the legacy value
			// across.
			const merged: Record<string, boolean> = {};
			for (const [k, v] of Object.entries(autonomy)) {
				if (k === "autoFollowupOnStageMove") continue;
				if (typeof v === "boolean") merged[k] = v;
			}
			const newValue =
				typeof (autonomy as any).autoTaskOnStageMove === "boolean"
					? (autonomy as any).autoTaskOnStageMove
					: legacy;
			merged.autoTaskOnStageMove = newValue;

			if (!dryRun) {
				await ctx.db.patch(user._id, {
					preferences: { ...prefs, aiAutonomy: merged },
					updatedAt: Date.now(),
				});
			}
			patched++;
		}

		return {
			scanned,
			patched,
			alreadyMigrated,
			noLegacyKey,
			dryRun,
		};
	},
});
