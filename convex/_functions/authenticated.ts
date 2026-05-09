/**
 * Custom authenticated function builders — convex/_functions/authenticated.ts
 *
 * WHAT THIS FILE DOES:
 *   Wraps Convex query/mutation builders to auto-inject ctx.user + ctx.userId
 *   for every authenticated handler. This removes boilerplate and enforces
 *   consistent auth checks across all functions.
 *
 * HOW IT WORKS:
 *   `customCtx` from convex-helpers runs `resolveUser()` before every handler.
 *   If the user is not authenticated or is soft-deleted, a ConvexError is thrown
 *   and the handler never runs.
 *
 * EXPORTS:
 *   authenticatedQuery    — Public query. User must be logged in.
 *   authenticatedMutation — Public mutation. User must be logged in.
 *   authenticatedInternalQuery    — Internal query (not exposed to clients).
 *   authenticatedInternalMutation — Internal mutation (not exposed to clients).
 *   orgQuery     — Public query for org-scoped handlers. Use requireOrgMember() inside.
 *   orgMutation  — Public mutation for org-scoped handlers.
 *   superAdminQuery    — Public query. User must have platformRole === "super_admin".
 *   superAdminMutation — Public mutation. User must have platformRole === "super_admin".
 *   requireOrgMember() — Async helper. Resolves org + member in one call.
 *   requireSuperAdmin() — Async helper. Throws SUPER_ADMIN_REQUIRED if not super_admin.
 *
 * RULE R2: All public mutations that touch org data must use `orgMutation` and call
 *   `requireOrgMember(ctx, args.orgId)` to get the role before any write.
 *
 * Sources:
 * - https://github.com/get-convex/convex-helpers/blob/main/packages/convex-helpers/server/customFunctions.ts
 * - https://stack.convex.dev/custom-functions
 * - https://github.com/get-convex/convex-saas/blob/main/convex/utils.ts
 * - .github/agents/base/rbac.md — Platform Roles section
 */
import { getAuthUserId } from "@convex-dev/auth/server";
import { ConvexError } from "convex/values";
import { customCtx, customMutation, customQuery } from "convex-helpers/server/customFunctions";
import {
	internalMutation,
	internalQuery,
	mutation,
	query,
	type MutationCtx,
	type QueryCtx,
} from "../_generated/server";
import type { Doc, Id } from "../_generated/dataModel";
import { ERRORS } from "../_shared/errors";

// ─── Types ────────────────────────────────────────────────────────────────────

export type AuthenticatedCtx = {
	user: Doc<"users">;
	userId: Id<"users">;
};

export type OrgCtx = AuthenticatedCtx & {
	org: Doc<"orgs">;
	member: Doc<"orgMembers"> & { role: "owner" | "admin" | "member" | "viewer"; permissions: string[] };
};

/** SuperAdminCtx — carries the branded `isSuperAdmin: true` flag for type-safe checks. */
export type SuperAdminCtx = AuthenticatedCtx & {
	isSuperAdmin: true;
};

// ─── Core helpers ─────────────────────────────────────────────────────────────

/**
 * Resolves the authenticated user from the request context.
 *
 * HOW IT WORKS:
 *   1. Calls `getAuthUserId` from @convex-dev/auth — reads the JWT session cookie.
 *   2. Fetches the user document from the `users` table by the resolved ID.
 *   3. Throws UNAUTHORIZED if no valid session exists.
 *   4. Throws USER_NOT_FOUND if the user document was soft-deleted.
 *
 * WHY SOFT-DELETE CHECK:
 *   A user can have a valid JWT but a soft-deleted profile (e.g. account deactivated).
 *   We treat this the same as not found — they should be logged out.
 *
 * Sources: https://github.com/get-convex/convex-saas/blob/main/convex/utils.ts
 */
async function resolveUser(ctx: QueryCtx | MutationCtx): Promise<AuthenticatedCtx> {
	const userId = await getAuthUserId(ctx);
	if (userId === null) throw new ConvexError(ERRORS.UNAUTHORIZED);
	const user = await ctx.db.get(userId);
	if (!user || user.deletedAt !== undefined) throw new ConvexError(ERRORS.USER_NOT_FOUND);
	return { user, userId };
}

/**
 * Resolves the authenticated user AND verifies platform super_admin role.
 *
 * HOW IT WORKS:
 *   1. Calls `resolveUser` to get the authenticated user.
 *   2. Checks `user.platformRole === "super_admin"`.
 *   3. Throws SUPER_ADMIN_REQUIRED if the user is a regular user.
 *
 * WHY A SEPARATE HELPER:
 *   Super admin operations are platform-level (org management, plan changes, etc.).
 *   They are completely separate from org-member checks. Never mix them.
 *
 * Ref: .github/agents/base/rbac.md — Platform Roles
 */
async function resolveSuperAdmin(ctx: QueryCtx | MutationCtx): Promise<SuperAdminCtx> {
	const { user, userId } = await resolveUser(ctx);
	if (user.platformRole !== "super_admin") {
		throw new ConvexError(ERRORS.SUPER_ADMIN_REQUIRED);
	}
	return { user, userId, isSuperAdmin: true };
}

/**
 * Resolves org + member context for the authenticated user.
 *
 * HOW IT WORKS:
 *   1. Resolves the user (throws UNAUTHORIZED if not logged in).
 *   2. Fetches the org by orgId (throws ORG_NOT_FOUND if missing/deleted).
 *   3. Fetches the orgMembers row for this user+org pair (throws ORG_MEMBER_NOT_FOUND).
 *
 * USAGE:
 *   ```ts
 *   const { user, userId, org, member } = await requireOrgMember(ctx, args.orgId);
 *   requireRole(member.role, "members.invite"); // from _shared/permissions
 *   ```
 *
 * Sources: https://github.com/get-convex/convex-saas/blob/main/convex/utils.ts
 */
export async function requireOrgMember(
	ctx: QueryCtx | MutationCtx,
	orgId: Id<"orgs">,
): Promise<OrgCtx> {
	const { user, userId } = await resolveUser(ctx);

	const org = await ctx.db.get(orgId);
	if (!org || org.deletedAt !== undefined) throw new ConvexError(ERRORS.ORG_NOT_FOUND);

	const member = await ctx.db
		.query("orgMembers")
		.withIndex("by_orgId_and_userId", (q) => q.eq("orgId", orgId).eq("userId", userId))
		.first();

	if (!member || member.deletedAt !== undefined)
		throw new ConvexError(ERRORS.ORG_MEMBER_NOT_FOUND);

	// Resolve role name + permissions from roleId (sole source of truth)
	const orgRole = await ctx.db.get(member.roleId);
	if (!orgRole) throw new ConvexError(ERRORS.ORG_MEMBER_NOT_FOUND);
	const role = orgRole.name.toLowerCase() as "owner" | "admin" | "member" | "viewer";
	const permissions = orgRole.permissions;

	return { user, userId, org, member: { ...member, role, permissions } };
}

/**
 * Standalone helper to require super_admin in handlers that don't use `superAdminQuery`.
 *
 * USAGE:
 *   ```ts
 *   const { user } = await requireSuperAdmin(ctx);
 *   ```
 */
export async function requireSuperAdmin(ctx: QueryCtx | MutationCtx): Promise<SuperAdminCtx> {
	return resolveSuperAdmin(ctx);
}

// ─── Public authenticated query/mutation ─────────────────────────────────────

/**
 * Authenticated public query. ctx.user and ctx.userId are auto-injected.
 *
 * Use this for any query that requires a logged-in user but is not org-scoped.
 * For org-scoped queries, use `orgQuery` and call `requireOrgMember` inside.
 *
 * Usage:
 * ```ts
 * export const me = authenticatedQuery({
 *   args: {},
 *   handler: async (ctx) => ctx.user,
 * });
 * ```
 */
export const authenticatedQuery = customQuery(
	query,
	customCtx(async (ctx) => resolveUser(ctx)),
);

/**
 * Authenticated public mutation. ctx.user and ctx.userId are auto-injected.
 *
 * Use this for user-level mutations (update profile, set default org, etc.).
 */
export const authenticatedMutation = customMutation(
	mutation,
	customCtx(async (ctx) => resolveUser(ctx)),
);

/**
 * Authenticated internal query. ctx.user and ctx.userId are auto-injected.
 *
 * Internal functions cannot be called from the client — only from other
 * Convex functions via `ctx.runQuery`. Use for background jobs, crons, etc.
 */
export const authenticatedInternalQuery = customQuery(
	internalQuery,
	customCtx(async (ctx) => resolveUser(ctx)),
);

/**
 * Authenticated internal mutation. ctx.user and ctx.userId are auto-injected.
 *
 * Use for internal cleanup, migration helpers, and cron-triggered writes.
 */
export const authenticatedInternalMutation = customMutation(
	internalMutation,
	customCtx(async (ctx) => resolveUser(ctx)),
);

// ─── Org-scoped builders ──────────────────────────────────────────────────────

/**
 * Org-scoped public query — injects user; call requireOrgMember(ctx, args.orgId)
 * inside the handler for full org + member context.
 *
 * Pattern:
 * ```ts
 * export const getMembers = orgQuery({
 *   args: { orgId: v.id("orgs") },
 *   handler: async (ctx, args) => {
 *     const { member } = await requireOrgMember(ctx, args.orgId);
 *     requireRole(member.role, "members.view");
 *     return ctx.db.query("orgMembers")
 *       .withIndex("by_orgId", q => q.eq("orgId", args.orgId)).take(100);
 *   },
 * });
 * ```
 */
export const orgQuery = customQuery(
	query,
	customCtx(async (ctx) => resolveUser(ctx)),
);

/**
 * Org-scoped public mutation. Injects user; call requireOrgMember() + requireRole() inside.
 */
export const orgMutation = customMutation(
	mutation,
	customCtx(async (ctx) => resolveUser(ctx)),
);

// ─── Super admin builders ─────────────────────────────────────────────────────

/**
 * Super admin public query. Throws SUPER_ADMIN_REQUIRED if user is not super_admin.
 *
 * HOW IT WORKS:
 *   `resolveSuperAdmin` is run before every handler. It verifies `user.platformRole === "super_admin"`.
 *   Regular users get FORBIDDEN; there is no way to invoke this without the platform role.
 *
 * USE FOR:
 *   - Listing all orgs (platform management)
 *   - Reading org feature flags and plan status
 *   - Any read operation that crosses org boundaries
 *
 * Ref: .github/agents/base/rbac.md — Super Admin
 */
export const superAdminQuery = customQuery(
	query,
	customCtx(async (ctx) => resolveSuperAdmin(ctx)),
);

/**
 * Super admin public mutation. Throws SUPER_ADMIN_REQUIRED if user is not super_admin.
 *
 * USE FOR:
 *   - Changing org plans (upgrading/downgrading with data preservation)
 *   - Enabling/disabling feature flags per org
 *   - Deactivating orgs
 *
 * DATA PRESERVATION RULE: When changing plans, NEVER delete data.
 *   Only update `featureFlags.orgOverrides[orgId]` to pause/enable features.
 *   Ref: .github/agents/base/rbac.md — Data Preservation
 */
export const superAdminMutation = customMutation(
	mutation,
	customCtx(async (ctx) => resolveSuperAdmin(ctx)),
);
