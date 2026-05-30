/**
 * Owner-panel organisation queries — convex/_platform/orgs/queries.ts
 *
 * Read-only platform-wide access to the `orgs` table. NEVER returns
 * org-scoped content (locked decision L7) — only metadata: org row +
 * the list of members and their roles. The owner-panel UI uses these
 * to drive the orgs list + per-org drawer.
 *
 * Mirrors `_platform/users/queries.ts`:
 *   - `listAllOrgs` — cursor-paginated table + post-pagination search
 *   - `getOrgSummary` — drawer payload (org + members + roles)
 *
 * Both queries deliberately INCLUDE soft-deleted and suspended orgs in
 * the result set — the owner panel needs to see them to restore /
 * unsuspend. The UI surfaces those states as badges on the row.
 *
 * Spec: PLATFORM-OWNER-PANEL.md §5.
 */
import { paginationOptsValidator } from "convex/server";
import { v } from "convex/values";
import { query } from "../../_generated/server";
import { requirePlatformOwner } from "../ownerAuth";

/**
 * Cursor-paginated orgs table. Optional `search` narrows by case-
 * insensitive substring match against name OR slug. Post-pagination
 * filter (same trade-off as `_platform/users/queries.ts::listAllUsers`)
 * — bounded read size keeps cost predictable.
 */
export const listAllOrgs = query({
	args: {
		paginationOpts: paginationOptsValidator,
		search: v.optional(v.string()),
	},
	handler: async (ctx, args) => {
		await requirePlatformOwner(ctx);

		const result = await ctx.db
			.query("orgs")
			.withIndex("by_slug")
			.order("asc")
			.paginate(args.paginationOpts);

		const term = args.search?.trim().toLowerCase();
		const filtered = term
			? result.page.filter(
					(o) =>
						o.name.toLowerCase().includes(term) || o.slug.toLowerCase().includes(term),
				)
			: result.page;

		// Resolve member count per org (cheap — bounded by `.take(1000)`
		// and we only need the COUNT, not the rows). The UI uses this for
		// the "X members" cell on the table without firing per-row queries.
		const trimmed = await Promise.all(
			filtered.map(async (o) => {
				const memberCount = await ctx.db
					.query("orgMembers")
					.withIndex("by_orgId_and_userId", (q) => q.eq("orgId", o._id))
					.take(1000)
					.then((rows) => rows.filter((m) => m.deletedAt === undefined).length);
				return {
					_id: o._id,
					name: o.name,
					slug: o.slug,
					plan: o.plan,
					industry: o.industry ?? null,
					memberCount,
					createdAt: o._creationTime,
					suspendedAt: o.suspendedAt ?? null,
					suspensionReason: o.suspensionReason ?? null,
					deletedAt: o.deletedAt ?? null,
				};
			}),
		);

		return {
			page: trimmed,
			isDone: result.isDone,
			continueCursor: result.continueCursor,
		};
	},
});

/**
 * Per-org drawer payload. Returns the org row + every member of the
 * org with their role name. Designed to populate the "Members + roles
 * + tier" UI without leaking any org-scoped content.
 */
export const getOrgSummary = query({
	args: { orgId: v.id("orgs") },
	handler: async (ctx, args) => {
		await requirePlatformOwner(ctx);

		const org = await ctx.db.get(args.orgId);
		if (!org) return null;

		const memberships = await ctx.db
			.query("orgMembers")
			.withIndex("by_orgId_and_userId", (q) => q.eq("orgId", args.orgId))
			.take(1000);

		const members: Array<{
			_id: string;
			userId: string;
			email: string;
			name: string | null;
			roleName: string;
			roleColor: string | null;
			joinedAt: number;
			isOwnerLike: boolean;
			suspendedAt: number | null;
			deletedAt: number | null;
		}> = [];

		for (const m of memberships) {
			if (m.deletedAt !== undefined) continue;

			const memberUser = await ctx.db.get(m.userId);
			if (!memberUser) continue;

			const role = await ctx.db.get(m.roleId);
			const roleName = role?.name ?? "—";
			const isOwnerLike = ["owner", "admin"].includes(roleName.toLowerCase());

			members.push({
				_id: m._id,
				userId: memberUser._id,
				email: memberUser.email,
				name: memberUser.name ?? null,
				roleName,
				roleColor: role?.color ?? null,
				joinedAt: m.joinedAt,
				isOwnerLike,
				suspendedAt: memberUser.suspendedAt ?? null,
				deletedAt: memberUser.deletedAt ?? null,
			});
		}

		// Sort owner/admin first, then by joinedAt asc for stable ordering.
		members.sort((a, b) => {
			if (a.isOwnerLike !== b.isOwnerLike) return a.isOwnerLike ? -1 : 1;
			return a.joinedAt - b.joinedAt;
		});

		return {
			org: {
				_id: org._id,
				name: org.name,
				slug: org.slug,
				plan: org.plan,
				industry: org.industry ?? null,
				teamSize: org.teamSize ?? null,
				createdAt: org._creationTime,
				suspendedAt: org.suspendedAt ?? null,
				suspensionReason: org.suspensionReason ?? null,
				deletedAt: org.deletedAt ?? null,
				lemonSqueezySubscriptionStatus: org.lemonSqueezySubscriptionStatus ?? null,
			},
			members,
		};
	},
});
