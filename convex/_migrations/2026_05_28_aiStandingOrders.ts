/**
 * convex/_migrations/2026_05_28_aiStandingOrders.ts
 *
 * Stage 8 of /SPRINT-PLAN.md (Autonomous layer). Two-part migration:
 *
 *   1. **Schema healthcheck** for the new `aiStandingOrders` table — a
 *      brand-new table declared in `convex/schema/ai.ts`, no backfill
 *      necessary. The healthcheck just confirms `ctx.db.query(...)`
 *      runs without throwing, which proves Convex picked up the new
 *      table cleanly.
 *
 *   2. **Permission backfill** for the new `ai.automation.manage`
 *      permission key. Existing system-role rows in `orgRoles` predate
 *      the key, so the standing-orders editor + the runner's
 *      permission-check would refuse every Owner / Admin until each
 *      key was added to the right role. The backfill iterates
 *      `orgRoles`, looks up each row's `name`, and patches in the
 *      missing Stage 8 keys ONLY (so a workspace that deliberately
 *      revoked a permission keeps it revoked).
 *
 * Idempotency: re-running the mutation does nothing on rows that
 * already have all Stage 8 keys. The `dryRun` arg lets us preview the
 * diff before writing.
 *
 * Run on dev:
 *   npx convex run _migrations/2026_05_28_aiStandingOrders:run \
 *     '{"dryRun": true}'
 * Then again with `dryRun: false` to apply.
 */

import { v } from "convex/values";
import { internalMutation } from "../_generated/server";
import { isSystemRoleName } from "../_shared/permissions/derive";

/** The single permission key Stage 8 added — see _shared/permissions/catalog.ts. */
const STAGE_8_PERMISSION_KEYS = ["ai.automation.manage"] as const;

/**
 * Per-system-role allow-list of Stage-8 permissions the role should
 * carry on a fresh org. Mirrors the `defaultRoles` declared in
 * `permissions/catalog.ts`; duplicated here so the migration's intent
 * is auditable in isolation.
 */
const STAGE_8_DEFAULT_BY_ROLE: Record<string, readonly string[]> = {
	Owner: ["ai.automation.manage"],
	Admin: ["ai.automation.manage"],
	Member: [],
	Viewer: [],
};

export const run = internalMutation({
	args: {
		dryRun: v.optional(v.boolean()),
	},
	handler: async (ctx, args) => {
		const dryRun = args.dryRun === true;

		// ── 1. Healthcheck the new table ─────────────────────────────────
		const standingOrdersHealthRows = await ctx.db.query("aiStandingOrders").take(1);

		// ── 2. Backfill Stage-8 permissions on existing system-role rows ──
		const allRoles = await ctx.db.query("orgRoles").collect();
		let rolesPatched = 0;
		const patchedSummaries: Array<{ roleId: string; name: string; added: string[] }> = [];

		for (const role of allRoles) {
			if (!isSystemRoleName(role.name)) continue; // custom roles are owner-curated
			const want = STAGE_8_DEFAULT_BY_ROLE[role.name] ?? [];
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
			tableHealthy: Array.isArray(standingOrdersHealthRows),
			permissionsBackfill: {
				rolesScanned: allRoles.length,
				rolesPatched,
				keysAdded: STAGE_8_PERMISSION_KEYS,
				patches: patchedSummaries,
			},
		};
	},
});
