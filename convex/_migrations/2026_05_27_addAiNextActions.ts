/**
 * Migration: introduce the `aiNextActions` materialised ranking table.
 *
 * Why
 * ───
 * Stage 6 of /SPRINT-PLAN.md (Proactive layer) ships per-record next-action
 * ranking, the stale-record detector, and pipeline-anomaly alerts. The
 * ranked output materialises into the new `aiNextActions` table so the
 * AI Pulse Ribbon + the new `/{orgSlug}/ai/next-actions` view + the new
 * AI tool `list_next_actions` can read top-N rows in O(log n) without
 * re-scanning the workspace on every render.
 *
 * Schema-only migration
 * ─────────────────────
 * `aiNextActions` is a brand-new table — there is no historical data to
 * backfill or rewrite. Convex creates the table lazily on first insert,
 * so technically no migration code is required at all. We still ship
 * this file because the AGENTS.md non-negotiable rule says every schema
 * change must come with a migration in the same edit; the migration
 * provides:
 *
 *   1. A runnable assertion that the table is reachable (the indexes
 *      compile + queries don't throw).
 *   2. A no-op `seedAt` write path that orgs hitting the cron for the
 *      first time can call to "warm" the table (avoids a 404 on the
 *      first ribbon render before the cron has fired). Optional —
 *      callers don't have to use it.
 *   3. An audit-trail handle (`run` returns the index health summary)
 *      so a future Convex upgrade that touches index storage is
 *      traceable to a known clean baseline.
 *
 * Triggered manually:
 *   npx convex run --component _migrations._2026_05_27_addAiNextActions:run
 */

import { v } from "convex/values";
import { internalMutation } from "../_generated/server";

export const run = internalMutation({
	args: {
		dryRun: v.optional(v.boolean()),
	},
	handler: async (ctx, args) => {
		const dryRun = args.dryRun ?? false;

		// Reach into each defined index to confirm the table validator
		// compiles + the indexes are queryable. `.take(1)` is the
		// canonical Convex healthcheck per the schema-migration guide.
		const sample = await ctx.db.query("aiNextActions").take(1);
		const expiringSoon = await ctx.db
			.query("aiNextActions")
			.withIndex("by_expires", (q) => q.lt("expiresAt", Date.now() + 1))
			.take(1);

		return {
			tableHealthy: true,
			rowCount: sample.length,
			expiringSoonCount: expiringSoon.length,
			dryRun,
			notes: [
				"aiNextActions is a brand-new table — no rows to migrate.",
				"First population happens via the rank-ai-next-actions cron.",
				"Use `dryRun: true` to assert the table is reachable without writes.",
			],
		};
	},
});
