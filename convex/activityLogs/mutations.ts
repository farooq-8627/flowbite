/**
 * convex/activityLogs/mutations.ts
 *
 * Internal mutations for activityLogs maintenance.
 *
 * `archiveOld`: hard-deletes rows older than the configured retention
 * window (default: 90 days). Wired up to the daily cron in `convex/crons.ts`
 * so the table doesn't grow unbounded. Activity logs are an audit trail —
 * older entries have diminishing operational value and (in the EU/India)
 * exceeding storage of personal data is a compliance liability.
 *
 * The mutation is paginated and idempotent: if it bails partway through
 * (e.g. transaction-size limits), the next cron tick picks up where it
 * left off because old rows still satisfy the cutoff predicate.
 *
 * Public-facing analytics dashboards read from `activityLogs` directly via
 * the `by_orgId_and_createdAt` index — they should clamp queries to the
 * last 90 days anyway, so this archive is invisible to the UX.
 */
import { v } from "convex/values";
import { internalMutation } from "../_generated/server";

const DEFAULT_RETENTION_DAYS = 90;
const DEFAULT_BATCH = 500;

export const archiveOld = internalMutation({
	args: {
		retentionDays: v.optional(v.number()),
		batchSize: v.optional(v.number()),
		dryRun: v.optional(v.boolean()),
	},
	handler: async (
		ctx,
		args,
	): Promise<{ deleted: number; cutoff: number; retentionDays: number; dryRun: boolean }> => {
		const retentionDays = args.retentionDays ?? DEFAULT_RETENTION_DAYS;
		const batchSize = args.batchSize ?? DEFAULT_BATCH;
		const dryRun = args.dryRun ?? false;

		const cutoff = Date.now() - retentionDays * 24 * 60 * 60 * 1000;

		// Walk the global index ordered by createdAt — but it's compound on
		// (orgId, createdAt), so we cannot range-scan globally without an
		// index lookup. Instead: find the oldest rows via the table iteration
		// (paginate with a small batch and stop early once we hit the cutoff).
		// For a true range scan we'd need a single-key createdAt index; the
		// audit log volume per cron tick is small enough that batched
		// per-table iteration is fine.
		let deleted = 0;
		let cursor: string | null = null;

		// Cap to a reasonable number of iterations so we never lock the runtime.
		// The cron fires every 24h — even 50 batches × 500 rows = 25k rows
		// archived per run, which is well above realistic per-day volume.
		for (let i = 0; i < 50; i++) {
			const page: {
				page: {
					_id: import("../_generated/dataModel").Id<"activityLogs">;
					createdAt: number;
				}[];
				isDone: boolean;
				continueCursor: string;
			} = await ctx.db.query("activityLogs").paginate({ cursor, numItems: batchSize });

			let foundOld = false;
			for (const row of page.page) {
				if (row.createdAt < cutoff) {
					if (!dryRun) await ctx.db.delete(row._id);
					deleted++;
					foundOld = true;
				}
			}

			cursor = page.continueCursor;
			if (page.isDone) break;
			// If a whole page had no archive candidates, the table is sorted
			// haphazardly; keep going for one more batch then bail.
			if (!foundOld && i > 0) break;
		}

		console.log(
			dryRun ? "[archiveOld DRY]" : "[archiveOld]",
			`Deleted ${deleted} activityLogs rows older than ${retentionDays}d (cutoff=${new Date(cutoff).toISOString()}).`,
		);

		return { deleted, cutoff, retentionDays, dryRun };
	},
});
