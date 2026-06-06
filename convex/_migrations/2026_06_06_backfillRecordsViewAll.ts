/**
 * Migration: 2026_06_06_backfillRecordsViewAll
 *
 * Adds the new `records.viewAll` permission to EVERY existing `orgRoles`
 * row — system AND custom.
 *
 * WHY ALL ROLES (not just system roles): `records.viewAll` is a CAPABILITY
 * whose ABSENCE restricts a member to assignment-scoped (row-level) record
 * visibility. Before this permission existed, every role with `*.view`
 * implicitly saw ALL records. If we only reconciled the 4 system roles (the
 * usual `getMissingPermissionsForRole` path skips custom roles), every
 * pre-existing CUSTOM role would silently flip to assigned-only on deploy —
 * a behaviour change nobody asked for. Granting it to all roles preserves
 * the status quo; an owner OPTS a role into row-level scope afterwards by
 * removing the key in the role editor.
 *
 * Idempotent — only patches roles that don't already have the key.
 *
 * Run (dry run first):
 *   npx convex run _migrations/2026_06_06_backfillRecordsViewAll:run '{"dryRun": true}'
 *   npx convex run _migrations/2026_06_06_backfillRecordsViewAll:run '{}'
 */
import { v } from "convex/values";
import { internalMutation } from "../_generated/server";
import { VIEW_ALL_RECORDS_PERMISSION } from "../_shared/permissions/recordScope";

export const run = internalMutation({
	args: { dryRun: v.optional(v.boolean()) },
	handler: async (ctx, args) => {
		const dry = args.dryRun ?? false;
		const allRoles = await ctx.db.query("orgRoles").collect();
		const results: Array<{ orgId: string; roleName: string }> = [];

		for (const role of allRoles) {
			if (role.permissions.includes(VIEW_ALL_RECORDS_PERMISSION)) continue;

			results.push({ orgId: role.orgId, roleName: role.name });

			if (!dry) {
				await ctx.db.patch(role._id, {
					permissions: [...role.permissions, VIEW_ALL_RECORDS_PERMISSION],
					updatedAt: Date.now(),
				});
			}
		}

		console.log(
			dry ? "[DRY RUN]" : "[APPLIED]",
			`Granted ${VIEW_ALL_RECORDS_PERMISSION} to ${results.length} role docs.`,
			results,
		);
		return { updated: results.length, details: results };
	},
});
