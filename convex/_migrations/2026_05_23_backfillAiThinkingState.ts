/**
 * Migration: 2026_05_23_backfillAiThinkingState
 *
 * Backfills `aiMessages.thinkingState` on existing assistant rows. The
 * field is optional in the schema and the UI treats `undefined` as
 * `"done"`, so this migration is *cosmetic* — it lets future code rely
 * on the field always being set on settled messages. Idempotent.
 *
 * Strategy:
 *   - role === "assistant" + non-empty content → "done"
 *   - role === "assistant" + empty content + last message in convo → likely
 *     stranded by the pre-fix processChat crash; mark "error" and patch
 *     content with a placeholder so the chat doesn't show an empty bubble.
 *   - role === "tool" or "user" → leave unchanged.
 *
 * Pages with paginationOpts to handle large message volumes safely.
 *
 * Run: npx convex run _migrations/2026_05_23_backfillAiThinkingState:run
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
		stranded: number;
		isDone: boolean;
		nextCursor: string | null;
	}> => {
		const dry = args.dryRun ?? false;
		const batchSize = args.batchSize ?? 200;

		const page = await ctx.db.query("aiMessages").paginate({
			cursor: args.cursor ?? null,
			numItems: batchSize,
		});

		let updated = 0;
		let stranded = 0;
		const now = Date.now();

		for (const msg of page.page) {
			if (msg.role !== "assistant") continue;
			if (msg.thinkingState) continue; // already migrated

			if (msg.content && msg.content.trim().length > 0) {
				if (!dry) {
					await ctx.db.patch(msg._id, { thinkingState: "done" });
				}
				updated++;
				continue;
			}

			// Empty assistant body — stranded placeholder from the pre-fix bug.
			// Patch with a friendly error so the conversation doesn't render a
			// permanently-empty bubble.
			if (!dry) {
				await ctx.db.patch(msg._id, {
					thinkingState: "error",
					content:
						msg.content ||
						"❌ This response was interrupted before completion. Please re-send your message.",
				});
			}
			stranded++;
			updated++;
		}

		console.log(
			dry ? "[DRY RUN]" : "[APPLIED]",
			`Backfill thinkingState — examined ${page.page.length}, updated ${updated} (${stranded} stranded).`,
			{ isDone: page.isDone, nextCursor: page.continueCursor, lastBatchSize: batchSize, now },
		);

		return {
			examined: page.page.length,
			updated,
			stranded,
			isDone: page.isDone,
			nextCursor: page.continueCursor ?? null,
		};
	},
});
