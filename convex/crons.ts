/**
 * Convex Cron Jobs — `convex/crons.ts`.
 *
 * Recurring background work registered against this deployment. Add new
 * crons by calling a method on the top-level `crons` object below and
 * exporting the same object as `default` (Convex contract).
 *
 * Guidelines (see `convex/_generated/ai/guidelines.md` § Cron):
 *   - Only `crons.interval(...)` and `crons.cron(...)` are supported. The
 *     `crons.hourly` / `crons.daily` / `crons.weekly` helpers are NOT used
 *     in this project.
 *   - The third argument is a FunctionReference (`internal.module.fn`) —
 *     never the function itself.
 *   - Internal references must come from `_generated/api`, even when the
 *     target lives elsewhere (e.g. `_shared/orgStats`).
 *
 * Sources:
 *   - https://docs.convex.dev/scheduling/cron-jobs
 *   - docs/architecture/08-BACKGROUND-JOBS.md
 */

import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

/**
 * Weekly drift-recovery for the denormalised `orgStats` counters.
 *
 * Every CRM mutation calls `applyOrgStat()` to keep counters in sync. If a
 * mutation path is ever skipped (or a hot-fix lands without the matching
 * delta) the counters drift — the dashboard then shows misleading values
 * (e.g. "Open leads = 0" while the leads board shows N rows).
 *
 * Running the canonical `recomputeOrgStats` mutation once per week scans
 * the source-of-truth tables and overwrites the counter rows atomically.
 * It is idempotent — when there's no drift, the run patches zero rows.
 *
 * 168 hours = 24 × 7 = one calendar week. We use `crons.interval` (not
 * `crons.cron`) because we don't care which exact wall-clock minute the
 * job fires — only that it fires roughly weekly. Convex spreads execution
 * across deployments which keeps the read-budget impact tiny.
 *
 * For a one-off manual recompute, see `_shared/orgStats.ts` — both the
 * canonical name and the legacy `_migrations/recomputeOrgStats:run` alias
 * remain runnable via `npx convex run`.
 */
crons.interval(
	"recompute-org-stats",
	{ hours: 24 * 7 },
	internal._shared.orgStats.recomputeOrgStats,
	{},
);

/**
 * Daily purge of soft-deleted CRM records that have exceeded each org's
 * retention window. Retention is configurable per-org via
 * `org.settings.softDeleteRetentionDays` (defaults to 30 days).
 *
 * Runs every 24h. The `purgeOldTrash` internal mutation iterates each
 * org and the 4 CRM tables (leads, contacts, companies, deals) and
 * hard-deletes rows where `deletedAt + retentionMs < now`. Volumes are
 * tiny — most orgs have a handful of trashed rows at any time.
 */
crons.interval("purge-old-trash", { hours: 24 }, internal.trash.mutations.purgeOldTrash, {});

/**
 * Daily archive of old activity-log rows (>90 days by default).
 *
 * Activity logs are an audit trail — older entries have diminishing
 * operational value and storing personal-data-tagged rows past their
 * retention window is a compliance liability. The mutation is paginated
 * and idempotent; if a run truncates partway through, the next tick
 * resumes from the same cutoff predicate.
 */
crons.interval(
	"archive-activity-logs",
	{ hours: 24 },
	internal.activityLogs.mutations.archiveOld,
	{},
);

/**
 * Daily AI Morning Briefing generation.
 *
 * Iterates active users (lastActiveAt within 14 days, briefing opt-in) and
 * generates a Haiku-tier briefing per user. Throttled to 1 req/sec to stay
 * under provider rate limits. Briefings are cached for 24h in `aiBriefings`.
 *
 * Manual refresh available via `ai.briefingsPublic.refreshNow` mutation —
 * counts against the user's AI message quota when triggered manually.
 */
crons.interval(
	"generate-ai-briefings",
	{ hours: 24 },
	// biome-ignore lint/suspicious/noExplicitAny: Convex pre-codegen forward ref pattern (briefingsActions.ts is "use node" file)
	"ai/briefingsActions:generateForActiveUsers" as any,
	{},
);

/**
 * Weekly AI org-wide insight (Sprint 5).
 *
 * Generates ONE briefing per org every 7 days, scope=`weekly-org`. The
 * row is visible to all members and surfaced via `WeeklyInsightCard` on
 * the dashboard. Uses the standard model tier (heavier than Haiku) so
 * the output finds week-over-week patterns instead of just dumping
 * numbers. Throttled to 1.5 req/sec to stay under provider rate limits.
 */
crons.interval(
	"generate-ai-weekly-insights",
	{ hours: 24 * 7 },
	// biome-ignore lint/suspicious/noExplicitAny: Convex pre-codegen forward ref pattern (briefingsActions.ts is "use node" file)
	"ai/briefingsActions:generateForAllOrgs" as any,
	{},
);

export default crons;
