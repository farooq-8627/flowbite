/**
 * Org queries.
 *
 * PATTERN EXPLANATION:
 *   All public org queries use `authenticatedQuery` or `orgQuery` (Rule R2).
 *   Both are identical wrappers (orgQuery is the org-scoped naming convention).
 *   They inject `ctx.user` and `ctx.userId` before the handler runs.
 *
 *   Org membership is verified INSIDE the handler with `.withIndex()` (Rule R4)
 *   rather than `.filter()`. This is production-grade because:
 *   (1) indexes push filtering to the storage layer — O(log n) not O(n),
 *   (2) no full table scans means the function stays within Convex's
 *       transaction read budget even when `orgMembers` grows to thousands of rows.
 *
 * Sources:
 * - https://github.com/get-convex/convex-saas/blob/main/convex/organizations.ts
 * - https://github.com/dbjpanda/convex-tenants/blob/main/example/convex/tenants.ts
 * - https://github.com/get-convex/convex-helpers/blob/main/packages/convex-helpers/server/customFunctions.ts
 */
import { v } from "convex/values";
import { internalQuery } from "../_generated/server";
import { authenticatedQuery, orgQuery, superAdminQuery } from "../_functions/authenticated";
import { getOrgById, getUserOrgs } from "./helpers";

/**
 * Check if a slug is available. Returns true if available, false if taken.
 * Used by onboarding to validate slug uniqueness as the user types.
 */
export const checkSlug = authenticatedQuery({
	args: { slug: v.string() },
	handler: async (ctx, args) => {
		const existing = await ctx.db
			.query("orgs")
			.withIndex("by_slug", (q) => q.eq("slug", args.slug))
			.unique();
		return { available: existing === null };
	},
});

/**
 * List all orgs the current user is an active member of.
 *
 * HOW IT WORKS:
 *   1. `authenticatedQuery` wrapper injects `ctx.userId` (verified JWT identity).
 *   2. `getUserOrgs(ctx, ctx.userId)` queries `orgMembers` via the `by_userId` index
 *      — returns up to 100 memberships (bounded by `.take(100)`, Rule R5).
 *   3. For each active membership, fetches the `orgs` doc and merges it into the result.
 *
 * WHY NOT pass userId from client (Rule R3):
 *   `ctx.userId` comes from the validated JWT — impossible to spoof.
 *
 * RETURN: Array of `{ ...orgMember, org: Doc<"orgs"> }` — includes role, joinedAt, etc.
 */
export const listMyOrgs = authenticatedQuery({
	args: {},
	handler: async (ctx) => {
		return await getUserOrgs(ctx, ctx.userId);
	},
});

/**
 * Get a specific org by ID. Returns null if the calling user is not a member.
 *
 * HOW IT WORKS:
 *   1. Verifies org membership via `by_orgId_and_userId` compound index (Rule R4).
 *      This is O(log n) — no table scan.
 *   2. Returns null (not an error) if the user is not a member, so the client
 *      can redirect gracefully rather than crashing on a ConvexError.
 *   3. Returns the org document only if membership is confirmed.
 *
 * WHY return null instead of throwing:
 *   Clients often check `if (!org) redirect("/dashboard")` — throwing would require
 *   try/catch wrappers on every callsite. Null is cleaner for "access denied" on reads.
 */
export const get = orgQuery({
	args: { orgId: v.id("orgs") },
	handler: async (ctx, args) => {
		const member = await ctx.db
			.query("orgMembers")
			.withIndex("by_orgId_and_userId", (q) =>
				q.eq("orgId", args.orgId).eq("userId", ctx.userId),
			)
			.first();

		if (!member || member.deletedAt !== undefined) return null;

		return await getOrgById(ctx, args.orgId);
	},
});

/**
 * List all active members of an org (with their user profile).
 *
 * HOW IT WORKS:
 *   1. Confirms the calling user is an active member before listing (access control).
 *   2. Queries `orgMembers` via `by_orgId_and_userId` with only the orgId prefix —
 *      this returns all members of the org, bounded at 100 (Rule R5).
 *   3. For each active member, fetches the user document and merges it in.
 *
 * WHY bounded at 100:
 *   No org in Phase 0 is expected to exceed 100 members. When the team-management
 *   feature is built, this query will be replaced with a paginated version.
 *
 * RETURN: Array of `{ ...orgMember, user: Doc<"users"> }` — includes role, joinedAt, etc.
 */
export const listMembers = orgQuery({
	args: { orgId: v.id("orgs") },
	handler: async (ctx, args) => {
		const membership = await ctx.db
			.query("orgMembers")
			.withIndex("by_orgId_and_userId", (q) =>
				q.eq("orgId", args.orgId).eq("userId", ctx.userId),
			)
			.first();

		if (!membership || membership.deletedAt !== undefined) return [];

		const members = await ctx.db
			.query("orgMembers")
			.withIndex("by_orgId_and_userId", (q) => q.eq("orgId", args.orgId))
			.take(100);

		const result = [];
		for (const m of members) {
			if (m.deletedAt !== undefined) continue;
			const memberUser = await ctx.db.get(m.userId);
			if (!memberUser || memberUser.deletedAt !== undefined) continue;
			result.push({ ...m, user: memberUser });
		}
		return result;
	},
});

/**
 * Get the current user's membership in a specific org.
 *
 * HOW IT WORKS:
 *   1. `authenticatedQuery` wrapper injects `ctx.userId` (verified JWT).
 *   2. Queries `orgMembers` via the `by_orgId_and_userId` compound index — O(log n).
 *   3. Returns the membership doc (role, joinedAt, etc.) or null if not a member.
 *
 * WHY THIS EXISTS:
 *   `listMembers` fetches ALL members + their user profiles — O(n) reads.
 *   The frontend `useOrgPermission` hook only needs the CURRENT user's role.
 *   This query returns a single membership row — O(1) after index lookup.
 *
 * RETURN: `Doc<"orgMembers"> | null`
 */
export const getMyMembership = authenticatedQuery({
	args: { orgId: v.id("orgs") },
	handler: async (ctx, args) => {
		const member = await ctx.db
			.query("orgMembers")
			.withIndex("by_orgId_and_userId", (q) =>
				q.eq("orgId", args.orgId).eq("userId", ctx.userId),
			)
			.first();

		if (!member || member.deletedAt !== undefined) return null;
		return member;
	},
});

/**
 * Internal: get org by ID. No auth check — for server-side use only.
 *
 * HOW IT WORKS:
 *   Direct `ctx.db.get(orgId)` — O(1) lookup. Returns null if not found.
 *
 * WHY `internalQuery` (Rule R6):
 *   Used by cron jobs, notification helpers, and activity log helpers that need
 *   an org doc without going through membership verification.
 */
export const getInternal = internalQuery({
	args: { orgId: v.id("orgs") },
	handler: async (ctx, args) => {
		return await ctx.db.get(args.orgId);
	},
});

/**
 * Super admin only: list ALL orgs in the platform.
 *
 * WHAT THIS DOES:
 *   Returns a paginated list of all orgs across the entire platform.
 *   Restricted to platform super_admin only — no org member can call this.
 *
 * HOW IT WORKS:
 *   `superAdminQuery` wrapper calls `resolveSuperAdmin()` before the handler.
 *   If the user does not have `platformRole === "super_admin"`, the handler
 *   never runs — ConvexError(SUPER_ADMIN_REQUIRED) is thrown.
 *
 * WHY BOUNDED WITH .take(100):
 *   Prevents runaway reads on large deployments. Super admin dashboard
 *   should paginate using the cursor from paginationOpts.
 *
 * Ref: .github/agents/base/rbac.md — Super Admin
 */
export const listAll = superAdminQuery({
	args: {},
	handler: async (ctx) => {
		return await ctx.db.query("orgs").order("desc").take(100);
	},
});
