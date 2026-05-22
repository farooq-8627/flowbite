/**
 * Migration: 2026_05_23_aiPermissionsBackfill
 *
 * Backfills 4 new AI permission keys onto existing org role docs.
 * Idempotent — only adds keys that aren't already present.
 *
 * Run: npx convex run _migrations/2026_05_23_aiPermissionsBackfill:run
 */
import { v } from "convex/values";
import { internalMutation } from "../_generated/server";
import { getMissingPermissionsForRole } from "../_shared/permissions/derive";

export const run = internalMutation({
	args: { dryRun: v.optional(v.boolean()) },
	handler: async (ctx, args) => {
		const dry = args.dryRun ?? false;
		const allRoles = await ctx.db.query("orgRoles").collect();
		const results: Array<{ orgId: string; roleName: string; added: string[] }> = [];

		for (const role of allRoles) {
			const missing = getMissingPermissionsForRole(role.name, role.permissions);
			if (missing.length === 0) continue;

			results.push({ orgId: role.orgId, roleName: role.name, added: missing });

			if (!dry) {
				await ctx.db.patch(role._id, {
					permissions: [...role.permissions, ...missing],
					updatedAt: Date.now(),
				});
			}
		}

		console.log(
			dry ? "[DRY RUN]" : "[APPLIED]",
			`Backfilled AI permissions on ${results.length} role docs.`,
			results,
		);
		return { updated: results.length, details: results };
	},
});
