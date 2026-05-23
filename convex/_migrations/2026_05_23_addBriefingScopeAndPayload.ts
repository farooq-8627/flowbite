/**
 * Migration: 2026_05_23_addBriefingScopeAndPayload
 *
 * Backfills `scope` + `payload` + `validUntil` on every legacy
 * `aiBriefings` row so Sprint 5's `DailyBriefingCard` /
 * `WeeklyInsightCard` queries can rely on the new fields without
 * special-casing legacy rows.
 *
 * Mapping:
 *   - scope        ← "daily-user" (every legacy row was per-user)
 *   - payload      ← derived from existing `summary` + `highlights`
 *                    so the new card renders correctly. Highlights
 *                    are flattened to plain bullets; no actionItems
 *                    (the old format didn't carry URLs / toolCalls).
 *   - validUntil   ← copied from `expiresAt` (alias).
 *
 * Idempotent — skips rows that already have `scope` AND `payload`.
 *
 * Run: npx convex run _migrations/2026_05_23_addBriefingScopeAndPayload:run
 */
import { v } from "convex/values";
import { internalMutation } from "../_generated/server";

export const run = internalMutation({
	args: { dryRun: v.optional(v.boolean()) },
	handler: async (ctx, args) => {
		const dry = args.dryRun ?? false;
		const all = await ctx.db.query("aiBriefings").collect();

		let updated = 0;
		let skipped = 0;

		for (const row of all) {
			// Idempotent — both fields already populated.
			if (row.scope && row.payload) {
				skipped++;
				continue;
			}

			const highlightTexts = (row.highlights ?? []).map((h) => h.text).filter(Boolean);

			const payload = {
				summary: row.summary || "(no summary)",
				highlights: highlightTexts.length > 0 ? highlightTexts.slice(0, 5) : [],
				actionItems: [] as Array<{
					label: string;
					url?: string;
					toolCall?: string;
				}>,
			};

			if (!dry) {
				await ctx.db.patch(row._id, {
					scope: row.scope ?? "daily-user",
					payload: row.payload ?? payload,
					validUntil: row.validUntil ?? row.expiresAt,
					updatedAt: Date.now(),
				});
			}
			updated++;
		}

		console.log(
			dry ? "[DRY RUN]" : "[APPLIED]",
			`Backfilled scope + payload on ${updated} aiBriefings rows (${skipped} already done).`,
		);
		return { updated, skipped };
	},
});
