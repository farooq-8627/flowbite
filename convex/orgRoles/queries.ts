/**
 * OrgRoles queries — list roles for an org.
 *
 * PATTERN:
 *   - All queries use `authenticatedQuery` (Rule R2).
 *   - Membership verified before returning data.
 *   - Bounded with .take(50) — no org will have more than 50 roles.
 */
import { v } from "convex/values";
import { authenticatedQuery } from "../_functions/authenticated";
import type { Id } from "../_generated/dataModel";
import { internalQuery, type QueryCtx } from "../_generated/server";
import { getOrgMember } from "../orgs/helpers";

async function listImpl(ctx: QueryCtx, args: { orgId: Id<"orgs"> }) {
	return await ctx.db
		.query("orgRoles")
		.withIndex("by_orgId", (q) => q.eq("orgId", args.orgId))
		.take(50);
}

/**
 * List all roles for an org.
 * Any org member can view roles (needed for invite UI, settings page).
 */
export const list = authenticatedQuery({
	args: { orgId: v.id("orgs") },
	handler: async (ctx, args) => {
		const member = await getOrgMember(ctx, args.orgId, ctx.userId);
		if (!member || member.deletedAt !== undefined) return [];
		return listImpl(ctx, args);
	},
});

/** AI-callable internal twin. */
export const listForAI = internalQuery({
	args: { orgId: v.id("orgs"), userId: v.id("users") },
	handler: async (ctx, args) => {
		const member = await getOrgMember(ctx, args.orgId, args.userId);
		if (!member || member.deletedAt !== undefined) return [];
		return listImpl(ctx, { orgId: args.orgId });
	},
});

/**
 * Get the current user's permissions for an org.
 * Returns a flat string[] of permission keys resolved from their role.
 * Used by the settings page to filter visible groups/sections.
 */
export const getMyPermissions = authenticatedQuery({
	args: { orgId: v.id("orgs") },
	handler: async (ctx, args) => {
		const member = await getOrgMember(ctx, args.orgId, ctx.userId);
		if (!member || member.deletedAt !== undefined) return [];
		const role = await ctx.db.get(member.roleId);
		return role?.permissions ?? [];
	},
});

/**
 * Get a single role by ID.
 * Any org member can view.
 */
export const get = authenticatedQuery({
	args: { roleId: v.id("orgRoles") },
	handler: async (ctx, args) => {
		const role = await ctx.db.get(args.roleId);
		if (!role) return null;

		const member = await getOrgMember(ctx, role.orgId, ctx.userId);
		if (!member || member.deletedAt !== undefined) return null;

		return role;
	},
});
