/**
 * convex/_migrations/2026_05_28_addAiAnalyticsTables.ts
 *
 * Stage 7 of /SPRINT-PLAN.md (Analytical layer + Trace UI). Two-part migration:
 *
 *   1. **Schema healthcheck** for the two NEW tables `aiInsights` and
 *      `aiCohortReports`. These are brand-new tables (declared in
 *      `convex/schema/ai.ts`) — there is nothing to backfill. The
 *      healthcheck just confirms `ctx.db.query(<table>).take(1)` runs
 *      without throwing, which proves Convex picked up the schema
 *      additions cleanly.
 *
 *   2. **Permission backfill** for the four NEW permission keys this
 *      stage introduces:
 *
 *        - `members.viewPerformance` (Owner + Admin)
 *        - `ai.analytics.viewMetrics` (Owner + Admin + Member)
 *        - `ai.cohorts.view` (Owner + Admin)
 *        - `ai.trace.view` (Owner + Admin + Member)
 *
 *      Existing system-role rows in `orgRoles` predate these keys, so
 *      the gated tools / UI would refuse every member of every org
 *      until each key was added to the right role. The backfill
 *      iterates `orgRoles`, looks up each row's `name` in the catalog
 *      via `getMissingPermissionsForRole`, and patches in the missing
 *      Stage 7 keys ONLY (so we don't accidentally re-grant a key the
 *      org owner deliberately revoked).
 *
 * Idempotency: re-running the mutation does nothing on rows that
 * already have all four keys. We intentionally restrict the patch set
 * to the Stage 7 keys (instead of running the full
 * `getMissingPermissionsForRole`) so previously-revoked permissions
 * stay revoked. The companion `dryRun` arg lets us preview the diff
 * before writing.
 *
 * Run on dev:
 *   npx convex run _migrations/2026_05_28_addAiAnalyticsTables:run \
 *     '{"dryRun": true}'
 * Then again with `dryRun: false` to apply.
 */

import { v } from "convex/values";
import { internalMutation } from "../_generated/server";
import { isSystemRoleName } from "../_shared/permissions/derive";

/** The four permission keys Stage 7 added — see _shared/permissions/catalog.ts. */
const STAGE_7_PERMISSION_KEYS = [
	"members.viewPerformance",
	"ai.analytics.viewMetrics",
	"ai.cohorts.view",
	"ai.trace.view",
] as const;

/**
 * Per-system-role allow-list of Stage-7 permissions the role should
 * carry on a fresh org. Mirrors the `defaultRoles` declared in
 * `permissions/catalog.ts` for the four new keys; duplicated here so
 * the migration's intent is auditable in isolation.
 */
const STAGE_7_DEFAULT_BY_ROLE: Record<string, readonly string[]> = {
	Owner: [
		"members.viewPerformance",
		"ai.analytics.viewMetrics",
		"ai.cohorts.view",
		"ai.trace.view",
	],
	Admin: [
		"members.viewPerformance",
		"ai.analytics.viewMetrics",
		"ai.cohorts.view",
		"ai.trace.view",
	],
	Member: ["ai.analytics.viewMetrics", "ai.trace.view"],
	Viewer: [],
};

export const run = internalMutation({
	args: {
		dryRun: v.optional(v.boolean()),
	},
	handler: async (ctx, args) => {
		const dryRun = args.dryRun === true;

		// ── 1. Healthcheck the new tables ─────────────────────────────────
		const insightsHealthRows = await ctx.db.query("aiInsights").take(1);
		const cohortsHealthRows = await ctx.db.query("aiCohortReports").take(1);

		// ── 2. Backfill Stage-7 permissions on existing system-role rows ──
		const allRoles = await ctx.db.query("orgRoles").collect();
		let rolesPatched = 0;
		const patchedSummaries: Array<{ roleId: string; name: string; added: string[] }> = [];

		for (const role of allRoles) {
			if (!isSystemRoleName(role.name)) continue; // custom roles are owner-curated
			const want = STAGE_7_DEFAULT_BY_ROLE[role.name] ?? [];
			const have = new Set(role.permissions);
			const toAdd = want.filter((k) => !have.has(k));
			if (toAdd.length === 0) continue;

			rolesPatched += 1;
			patchedSummaries.push({
				roleId: role._id as unknown as string,
				name: role.name,
				added: toAdd,
			});
			if (!dryRun) {
				await ctx.db.patch(role._id, {
					permissions: [...role.permissions, ...toAdd],
					updatedAt: Date.now(),
				});
			}
		}

		return {
			dryRun,
			tablesHealthy: {
				aiInsights: Array.isArray(insightsHealthRows),
				aiCohortReports: Array.isArray(cohortsHealthRows),
			},
			permissionsBackfill: {
				rolesScanned: allRoles.length,
				rolesPatched,
				keysAdded: STAGE_7_PERMISSION_KEYS,
				patches: patchedSummaries,
			},
		};
	},
});
