/**
 * Migration: 2026_05_24_addContextBagAndSubagent
 *
 * Backs Week 2.3 + Week 3.1 of `PHASE-3-AI-AUDIT.md §6`.
 *
 * Schema additions covered:
 *   - `aiConversations.contextBag` (Week 3.1) — typed conversational state.
 *   - `aiMessages.subagent`        (Week 2.3) — which subagent handled the turn.
 *
 * Both fields are OPTIONAL, so legacy rows already validate. This migration
 * is therefore non-blocking — its job is to pre-populate sensible defaults
 * so subsequent reads don't have to handle `undefined` as a special case.
 *
 * Strategy:
 *   - Conversations: backfill `contextBag: {}` so the system-prompt builder
 *     can iterate `Object.entries` without a fallback.
 *   - Messages: leave `subagent` undefined for legacy rows. The router
 *     stamps it on every NEW assistant row from Week 2 onward; legacy
 *     messages predating subagent routing report `undefined` in
 *     telemetry, which is accurate.
 *
 * Idempotent. Safe to re-run. Pages with paginationOpts.
 *
 * Run: npx convex run _migrations/2026_05_24_addContextBagAndSubagent:run
 */
import { v } from "convex/values";
import { internalMutation } from "../_generated/server";

export const run = internalMutation({
	args: {
		dryRun: v.optional(v.boolean()),
		batchSize: v.optional(v.number()),
		cursor: v.optional(v.string()),
	},
	handler: async (
		ctx,
		args,
	): Promise<{
		examined: number;
		updated: number;
		isDone: boolean;
		nextCursor: string | null;
	}> => {
		const dry = args.dryRun ?? false;
		const batchSize = args.batchSize ?? 200;

		const page = await ctx.db.query("aiConversations").paginate({
			cursor: args.cursor ?? null,
			numItems: batchSize,
		});

		let updated = 0;
		for (const conv of page.page) {
			// Legacy rows: contextBag is undefined. Backfill with {} so the
			// system-prompt builder can skip the bag injection cleanly when
			// the user hasn't accumulated any facts yet.
			if (conv.contextBag === undefined) {
				if (!dry) {
					await ctx.db.patch(conv._id, { contextBag: {} });
				}
				updated++;
			}
		}

		console.log(
			dry ? "[DRY RUN]" : "[APPLIED]",
			`Backfill aiConversations.contextBag — examined ${page.page.length}, updated ${updated}.`,
			{ isDone: page.isDone, nextCursor: page.continueCursor },
		);

		return {
			examined: page.page.length,
			updated,
			isDone: page.isDone,
			nextCursor: page.continueCursor ?? null,
		};
	},
});
