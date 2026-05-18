/**
 * `convex/_migrations/recomputeOrgStats.ts` — backwards-compatible shim.
 *
 * The recompute logic lives in `convex/_shared/orgStats.ts` (canonical
 * location) — see the module docstring there for the full explanation.
 * That move happened on 2026-05-19 so the schema doc-comment can simply
 * point at the canonical export and the dashboard/cron stay in sync.
 *
 * This file exists only to keep two things working without a code change
 * for ops:
 *
 *   1. The legacy CLI invocation path:
 *        npx convex run _migrations/recomputeOrgStats:run '{}'
 *        npx convex run _migrations/recomputeOrgStats:runDryRun '{}'
 *
 *   2. The `_migrations_recomputeOrgStats` namespace already wired into
 *      `convex/_generated/api.d.ts`.
 *
 * New code should reference the canonical exports directly:
 *   internal._shared.orgStats.recomputeOrgStats
 *   internal._shared.orgStats.recomputeOrgStatsDryRun
 *
 * That's also what the weekly drift-recovery cron in `convex/crons.ts`
 * does — calling these aliases would still work, but the canonical name
 * is preferred.
 */

export {
	recomputeOrgStats as run,
	recomputeOrgStatsDryRun as runDryRun,
} from "../_shared/orgStats";
