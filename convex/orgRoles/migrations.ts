/**
 * RBAC Migration — convex/orgRoles/migrations.ts
 *
 * Syncs roleId from role string for all existing orgMembers that have a role
 * string but no roleId. Run once after deploying the dual-RBAC fix.
 *
 * This resolves the dual RBAC system: after running this migration, every
 * member has both role (string) and roleId (FK) in sync.
 *
 * Usage: call via Convex dashboard or npx convex run orgRoles/migrations:syncMemberRoleIds
 */
import { internalMutation } from "../_generated/server";

/**
 * For every orgMember that has a role string but no roleId (or a stale roleId),
 * look up the matching orgRole by name and set roleId.
 *
 * Safe to run multiple times — idempotent.
 */
export const syncMemberRoleIds = internalMutation({
	args: {},
	handler: async (ctx) => {
		// Get all members without roleId or with potentially stale roleId
		const members = await ctx.db.query("orgMembers").take(10000);
		let synced = 0;

		for (const member of members) {
			if (!member.role || member.deletedAt !== undefined) continue;

			// Capitalize role string to match orgRole name ("owner" → "Owner")
			const roleName = member.role.charAt(0).toUpperCase() + member.role.slice(1);

			const orgRole = await ctx.db
				.query("orgRoles")
				.withIndex("by_orgId_and_name", (q) =>
					q.eq("orgId", member.orgId).eq("name", roleName),
				)
				.first();

			if (!orgRole) continue;

			// Only patch if roleId is missing or different
			if (member.roleId !== orgRole._id) {
				await ctx.db.patch(member._id, { roleId: orgRole._id });
				synced++;
			}
		}

		return { synced, total: members.length };
	},
});
