/**
 * RBAC Migration — convex/orgRoles/migrations.ts
 *
 * Historical migration that synced roleId from role string.
 * The role string field has been removed from the schema.
 * This migration is now a no-op — kept for reference only.
 *
 * If you need to fix members with missing roleId, use the
 * assignDefaultRole migration below.
 */
import { internalMutation } from "../_generated/server";

/**
 * Assigns the default role to any orgMember that somehow has no roleId.
 * Safety net — should never be needed in normal operation.
 */
export const assignDefaultRoles = internalMutation({
	args: {},
	handler: async (ctx) => {
		const members = await ctx.db.query("orgMembers").take(10000);
		let fixed = 0;

		for (const member of members) {
			if (member.deletedAt !== undefined) continue;
			// roleId is required in schema, but check for data integrity
			if (member.roleId) continue;

			const defaultRole = await ctx.db
				.query("orgRoles")
				.withIndex("by_orgId", (q) => q.eq("orgId", member.orgId))
				.filter((q) => q.eq(q.field("isDefault"), true))
				.first();

			if (defaultRole) {
				await ctx.db.patch(member._id, { roleId: defaultRole._id });
				fixed++;
			}
		}

		return { fixed, total: members.length };
	},
});
