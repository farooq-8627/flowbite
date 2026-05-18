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

export default crons;
