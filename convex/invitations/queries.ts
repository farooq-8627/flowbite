/**
 * Invitation queries.
 *
 * All queries are org-scoped and require `members.invite` permission to read.
 */
import { v } from "convex/values";
import { orgQuery } from "../_functions/authenticated";
import { requireRole } from "../_shared/permissions";
import type { OrgRole } from "../_shared/validators";
import { getOrgMember } from "../orgs/helpers";

/**
 * List pending invitations for an org. Requires `members.invite` permission.
 */
export const listPending = orgQuery({
	args: { orgId: v.id("orgs") },
	handler: async (ctx, args) => {
		const member = await getOrgMember(ctx, args.orgId, ctx.userId);
		if (!member || member.deletedAt !== undefined) return [];

		requireRole(member.role as OrgRole, "members.invite");

		return await ctx.db
			.query("invitations")
			.withIndex("by_orgId_and_status", (q) =>
				q.eq("orgId", args.orgId).eq("status", "pending"),
			)
			.take(100);
	},
});

/**
 * List all invitations for an org (any status). Requires `members.invite`.
 */
export const listAll = orgQuery({
	args: { orgId: v.id("orgs") },
	handler: async (ctx, args) => {
		const member = await getOrgMember(ctx, args.orgId, ctx.userId);
		if (!member || member.deletedAt !== undefined) return [];

		requireRole(member.role as OrgRole, "members.invite");

		return await ctx.db
			.query("invitations")
			.withIndex("by_orgId_and_status", (q) => q.eq("orgId", args.orgId))
			.take(100);
	},
});
