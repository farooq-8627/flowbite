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

/**
 * Stage 6 (SPRINT-PLAN.md) — proactive next-actions ranker.
 *
 * Originally a 30-minute cron rebuilt the materialised `aiNextActions`
 * ranked list for every active (org, user) membership. Removed
 * 2026-05-27 — replaced by the reactive trigger
 * `convex/ai/queries/nextActionsTrigger.ts:scheduleNextActionsRebuild`,
 * which fires from every relevant lead/deal/task mutation (with a 5 s
 * token-bucket dedup so bursts are coalesced). First-paint freshness
 * is covered by `convex.ai.queries.nextActions:lazyWarmForUser` (1/min
 * per user, fired once per session by `AIPulseRibbon` when the ranked
 * store is empty). The cron added latency the user felt as "the ribbon
 * is stale" — the new reactive path keeps the ranked store within
 * ~250 ms of source-of-truth.
 *
 * The action `internal.ai.actions.rankNextActions.rebuildAllOrgs`
 * remains in the codebase as an on-demand internal entrypoint (e.g. for
 * a one-off ops sweep after a schema change) but is no longer fired by
 * the scheduler.
 */

/**
 * Stage 7 (SPRINT-PLAN.md) — nightly cohort rebuild.
 *
 * The deterministic cohort rollup (`leadSource` / `industry` / `owner`
 * conversion rates + avg deal value + total value per cohort key) is
 * recomputed once a day. The action `rebuildAllOrgs` paginates active
 * orgs and runs the per-org `rebuildForOrg` mutation in its own
 * bounded transaction so we don't blow the per-mutation read cap on a
 * busy workspace.
 *
 * No LLM cost — purely a DB scan + index write.
 */
crons.interval(
	"rebuild-ai-cohorts",
	{ hours: 24 },
	internal.ai.actions.rebuildCohorts.rebuildAllOrgs,
	{},
);

/**
 * Stage 8 (SPRINT-PLAN.md) — autonomous layer evaluator.
 *
 * Every minute, scan every enabled `aiStandingOrders` row, compute
 * `shouldFireNow(schedule, now, lastRunAt)` per row, and schedule
 * `runner.run` for any whose schedule has matched. The evaluator is a
 * V8 internalAction (no `use node`) — only the `runner.run` action that
 * actually invokes streamText needs the Node runtime.
 *
 * Cost gate: the evaluator does pure scheduling — bounded, no LLM call.
 * The runner enforces the per-org cost cap via the existing AI quota
 * gate when it actually streams.
 *
 * The 1-minute cadence is chosen to match the daily/weekly schedule
 * resolution — owners type "09:00 UTC" and expect the action to fire
 * within a minute of that boundary.
 */
crons.interval(
	"evaluate-ai-standing-orders",
	{ minutes: 1 },
	internal.ai.standingOrders.evaluator.tick,
	{},
);

/**
 * Stale AI-stream reaper (every 1 min).
 *
 * If the `runChatTurn` action crashes mid-turn (provider 500, OOM, isolate
 * timeout) the assistant `aiMessages` row is stranded in a non-terminal
 * `thinkingState` ("thinking" | "calling_tool" | "streaming") forever — the
 * user sees a bubble that spins until they refresh. No other code path flips
 * it because the only writer (the orchestrator) is dead.
 *
 * `reapStaleStreams` flips any non-terminal row older than 5 minutes to a
 * terminal `done` + `aborted: true` state with a `[stalled]` marker — the same
 * shape `cancelStream` produces, so the UI already renders it (spinner stops,
 * aborted badge shows). Bounded per tick via the `by_thinkingState` index +
 * `.take()`; a backlog drains over successive ticks. Idempotent — a reaped row
 * is `done` and never re-matches. Pure DB scan, no LLM cost.
 */
crons.interval("reap-stale-ai-streams", { minutes: 1 }, internal.ai.messages.reapStaleStreams, {});

/**
 * Daily owner-panel OTP garbage collection.
 *
 * Each OTP row has a 15-minute TTL. We keep them around for an
 * additional 24h after expiry so audit-log entries can be correlated
 * to the underlying credential during incident response. After that
 * window the rows are pure clutter — this cron deletes them.
 *
 * Idempotent: deletes only rows whose `expiresAt + 24h` is in the past.
 *
 * Spec: PLATFORM-OWNER-PANEL.md §4.2.
 */
crons.interval("owner-otp-gc", { hours: 24 }, internal._platform.otp.mutations.deleteExpired, {});

/**
 * Stage 5 of DASHBOARD-V2-PLAN.md (locked decisions #8 + #9) — three
 * dashboard insight crons. Each is a separate entry per locked
 * decision #8 ("two/three separate entries — easier to disable
 * independently, cleaner per-cron logs"). Cadence per locked decision
 * #9 — daily UTC, staggered so they don't compete for the same
 * runtime window.
 */

/**
 * Daily anomaly detection (06:00 UTC).
 *
 * Iterates every starter+/pro/enterprise org, runs the deterministic
 * anomaly scan, writes up to 10 `dashboardAnnotations` per org. Free-
 * plan orgs see anomalies only on demand via `refreshForOrgForAI`.
 *
 * Idempotent — replaces prior cron-written rows for the org each tick.
 */
crons.cron("detect-anomalies", "0 6 * * *", internal.ai.insights.anomalies.detectAllOrgs, {});

/**
 * Daily deal-score rebuild (06:30 UTC).
 *
 * Iterates every starter+/pro/enterprise org, recomputes the
 * deterministic 0-100 score for every open deal. Pure DB rollup, no
 * LLM cost. Soft-deleted deals are skipped; their existing score rows
 * reap via the daily TTL sweep (next cron entry below).
 */
crons.cron("rebuild-deal-scores", "30 6 * * *", internal.ai.insights.dealScores.rebuildAllOrgs, {});

/**
 * Daily TTL purge (07:00 UTC).
 *
 * Sweeps three tables in one mutation:
 *   - `ephemeralDashboardCells` (24h TTL, per-user AI pins)
 *   - `dealScores` (14d TTL, soft-deleted deals)
 *   - `dashboardAnnotations` with `expiresAt` set (cron-written rows
 *     have a 7d TTL; user-tool-written rows leave expiresAt undefined)
 */
crons.cron(
	"purge-dashboard-ephemeral",
	"0 7 * * *",
	internal.ai.insights.dealScores.purgeExpiredCellsAndScores,
	{},
);

export default crons;
