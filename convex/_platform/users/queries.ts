/**
 * Owner-panel user queries — convex/_platform/users/queries.ts
 *
 * Read-only platform-wide access to the `users` table. NEVER returns any
 * org-scoped content (locked decision L7) — only user metadata, the orgs
 * the user belongs to, and the plan tier on each org. The owner-panel UI
 * uses these to drive the users list + per-user drawer.
 *
 * Spec: PLATFORM-OWNER-PANEL.md §5 row 2, §10 stage 5.
 */
import { paginationOptsValidator } from "convex/server";
import { v } from "convex/values";
import { query } from "../../_generated/server";
import { requirePlatformOwner } from "../ownerAuth";

/**
 * Cursor-paginated users table. Optional `search` narrows by case-
 * insensitive substring match against email or name. Search is performed
 * post-pagination because we don't have a search index — bounded read
 * size keeps it cheap (max 100 rows per page after the seed migration).
 */
export const listAllUsers = query({
	args: {
		paginationOpts: paginationOptsValidator,
		search: v.optional(v.string()),
	},
	handler: async (ctx, args) => {
		await requirePlatformOwner(ctx);

		const result = await ctx.db
			.query("users")
			.withIndex("by_email")
			.order("asc")
			.paginate(args.paginationOpts);

		// Apply search filter post-pagination on the small page slice. We
		// trade off true result density for predictable page count — the
		// alternative would require a search index which the panel
		// doesn't justify yet.
		const term = args.search?.trim().toLowerCase();
		const filtered = term
			? result.page.filter(
					(u) =>
						u.email.toLowerCase().includes(term) ||
						(u.name ?? "").toLowerCase().includes(term),
				)
			: result.page;

		const trimmed = filtered.map((u) => ({
			_id: u._id,
			email: u.email,
			name: u.name ?? null,
			avatarUrl: u.avatarUrl ?? null,
			platformRole: u.platformRole ?? null,
			lastActiveAt: u.lastActiveAt ?? null,
			deletedAt: u.deletedAt ?? null,
			onboardingCompleted: u.onboardingCompleted,
			createdAt: u._creationTime,
		}));

		return {
			page: trimmed,
			isDone: result.isDone,
			continueCursor: result.continueCursor,
		};
	},
});

/**
 * Per-user drawer payload. Returns the user row + every org the user is
 * a member of with that org's current plan tier. Designed to populate the
 * "Change subscription" UI without leaking any per-org content.
 */
export const getUserSummary = query({
	args: { userId: v.id("users") },
	handler: async (ctx, args) => {
		await requirePlatformOwner(ctx);

		const user = await ctx.db.get(args.userId);
		if (!user) return null;

		const memberships = await ctx.db
			.query("orgMembers")
			.withIndex("by_userId", (q) => q.eq("userId", args.userId))
			.collect();

		const orgs: Array<{
			_id: string;
			name: string;
			slug: string;
			plan: string;
			memberSince: number;
			isOwnerLike: boolean;
		}> = [];

		for (const m of memberships) {
			if (m.deletedAt !== undefined) continue;
			const org = await ctx.db.get(m.orgId);
			if (!org || org.deletedAt !== undefined) continue;

			// Resolve role name to surface "is the user effectively an
			// owner of this org?" in the UI without leaking permissions.
			let isOwnerLike = false;
			const role = await ctx.db.get(m.roleId);
			if (role) {
				const name = role.name.toLowerCase();
				isOwnerLike = name === "owner" || name === "admin";
			}

			orgs.push({
				_id: org._id,
				name: org.name,
				slug: org.slug,
				plan: org.plan,
				memberSince: m.joinedAt,
				isOwnerLike,
			});
		}

		return {
			user: {
				_id: user._id,
				email: user.email,
				name: user.name ?? null,
				avatarUrl: user.avatarUrl ?? null,
				platformRole: user.platformRole ?? null,
				lastActiveAt: user.lastActiveAt ?? null,
				createdAt: user._creationTime,
			},
			orgs,
		};
	},
});
