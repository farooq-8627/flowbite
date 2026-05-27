/**
 * Owner-panel overview queries — convex/_platform/overview/queries.ts
 *
 * Aggregated counts only. NEVER returns per-org content (locked decision
 * L7) — only platform-wide counts of users + orgs + tier distribution.
 *
 * Read budget: a counts query iterates the source tables. For very large
 * datasets this would need a denormalised counter — punt that to a
 * Future-Enhancements card if/when the panel feels slow.
 *
 * Spec: PLATFORM-OWNER-PANEL.md §5 row 1, §10 stage 6.
 */
import { query } from "../../_generated/server";
import { requirePlatformOwner } from "../ownerAuth";

export const getCounts = query({
	args: {},
	handler: async (ctx) => {
		await requirePlatformOwner(ctx);

		const users = await ctx.db.query("users").collect();
		const orgs = await ctx.db.query("orgs").collect();

		const totalUsers = users.length;
		const activeUsers = users.filter((u) => u.deletedAt === undefined).length;
		const superAdmins = users.filter((u) => u.platformRole === "super_admin").length;

		const activeOrgs = orgs.filter((o) => o.deletedAt === undefined);
		const totalOrgs = orgs.length;

		// Tier distribution across active orgs.
		const tierCounts: Record<string, number> = {
			free: 0,
			starter: 0,
			pro: 0,
			enterprise: 0,
		};
		for (const o of activeOrgs) {
			tierCounts[o.plan] = (tierCounts[o.plan] ?? 0) + 1;
		}

		return {
			totalUsers,
			activeUsers,
			deletedUsers: totalUsers - activeUsers,
			superAdmins,
			totalOrgs,
			activeOrgs: activeOrgs.length,
			tierCounts,
		};
	},
});
