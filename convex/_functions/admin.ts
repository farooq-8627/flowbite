/**
 * Admin-scoped function builders.
 *
 * These wrap orgQuery/orgMutation to additionally enforce that the caller
 * has at least `admin` role. Saves repeating `requireOrgMember` +
 * `requireMinRole` boilerplate in every admin handler.
 *
 * EXPORTS:
 *   adminQuery    — Public query requiring admin+ role in the org.
 *   adminMutation — Public mutation requiring admin+ role in the org.
 *
 * Sources:
 * - https://github.com/get-convex/convex-helpers/blob/main/packages/convex-helpers/server/customFunctions.ts
 * - convex/_functions/authenticated.ts (same pattern)
 */

import { getAuthUserId } from "@convex-dev/auth/server";
import { ConvexError } from "convex/values";
import { customCtx, customQuery } from "convex-helpers/server/customFunctions";
import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import { query } from "../_generated/server";
import { ERRORS } from "../_shared/errors";
import { requireMinRole } from "../_shared/permissions";

export type AdminCtx = {
	user: Doc<"users">;
	userId: Id<"users">;
};

/**
 * Resolves the authenticated user (same as authenticated.ts).
 */
async function resolveUser(ctx: QueryCtx | MutationCtx): Promise<AdminCtx> {
	const userId = await getAuthUserId(ctx);
	if (userId === null) throw new ConvexError(ERRORS.UNAUTHORIZED);
	const user = await ctx.db.get(userId);
	if (!user || user.deletedAt !== undefined) throw new ConvexError(ERRORS.USER_NOT_FOUND);
	return { user, userId };
}

/**
 * Admin-scoped public query. Injects `ctx.user` and `ctx.userId`.
 *
 * The handler must still call `requireOrgMember(ctx, args.orgId)` to get
 * the member doc — this builder only provides user auth. The admin role
 * check is enforced via `requireAdminMember()` helper.
 *
 * Usage:
 * ```ts
 * export const listSettings = adminQuery({
 *   args: { orgId: v.id("orgs") },
 *   handler: async (ctx, args) => {
 *     const { member } = await requireAdminMember(ctx, args.orgId);
 *     // member.role is guaranteed to be admin or owner
 *   },
 * });
 * ```
 */
export const adminQuery = customQuery(
	query,
	customCtx(async (ctx) => resolveUser(ctx)),
);

/**
 * Helper: resolves org membership AND requires admin+ role.
 * Throws FORBIDDEN if user is member/viewer.
 */
export async function requireAdminMember(
	ctx: QueryCtx | MutationCtx,
	orgId: Id<"orgs">,
): Promise<{
	org: Doc<"orgs">;
	member: Doc<"orgMembers"> & {
		role: "owner" | "admin" | "member" | "viewer";
		permissions: string[];
	};
}> {
	const userId = await getAuthUserId(ctx);
	if (userId === null) throw new ConvexError(ERRORS.UNAUTHORIZED);

	const org = await ctx.db.get(orgId);
	if (!org || org.deletedAt !== undefined) throw new ConvexError(ERRORS.ORG_NOT_FOUND);

	const member = await ctx.db
		.query("orgMembers")
		.withIndex("by_orgId_and_userId", (q) => q.eq("orgId", orgId).eq("userId", userId))
		.first();

	if (!member || member.deletedAt !== undefined)
		throw new ConvexError(ERRORS.ORG_MEMBER_NOT_FOUND);

	// Resolve role + permissions from roleId (sole source of truth)
	const orgRole = await ctx.db.get(member.roleId);
	if (!orgRole) throw new ConvexError(ERRORS.ORG_MEMBER_NOT_FOUND);
	const role = orgRole.name.toLowerCase() as "owner" | "admin" | "member" | "viewer";

	requireMinRole(role, "admin");

	return { org, member: { ...member, role, permissions: orgRole.permissions } };
}
