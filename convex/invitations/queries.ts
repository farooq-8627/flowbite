/**
 * Invitation queries.
 *
 * All queries are org-scoped and require `members.invite` permission to read.
 */
import { v } from "convex/values";
import { orgQuery } from "../_functions/authenticated";
import { internalQuery, query } from "../_generated/server";
import { requireRole } from "../_shared/permissions";
import { getOrgMember } from "../orgs/helpers";

/**
 * Get an invitation by token — public query (no auth required).
 *
 * Used by the join-org page to render the accept screen before the user
 * even has a session. We deliberately avoid leaking inviter PII here —
 * only the safe fields (org name/slug, role name, target email, status)
 * are exposed. The `email` is necessary so the accept page can show
 * "make sure you're signed in with this email".
 */
export const getByToken = query({
	args: { token: v.string() },
	handler: async (ctx, args) => {
		const invitation = await ctx.db
			.query("invitations")
			.withIndex("by_token", (q) => q.eq("token", args.token))
			.first();

		if (!invitation) return null;

		const [org, role] = await Promise.all([
			ctx.db.get(invitation.orgId),
			ctx.db.get(invitation.roleId),
		]);

		return {
			_id: invitation._id,
			email: invitation.email,
			roleId: invitation.roleId,
			roleName: role?.name ?? "Member",
			roleColor: role?.color ?? null,
			status: invitation.status,
			expiresAt: invitation.expiresAt,
			orgName: org?.name ?? "Unknown",
			orgSlug: org?.slug ?? "",
		};
	},
});

/**
 * List pending invitations for an org. Requires `members.invite` permission.
 *
 * Joins to `orgRoles` so the settings UI can display the friendly role name
 * (incl. custom roles) without doing per-row lookups on the client.
 */
export const listPending = orgQuery({
	args: { orgId: v.id("orgs") },
	handler: async (ctx, args) => {
		const member = await getOrgMember(ctx, args.orgId, ctx.userId);
		if (!member || member.deletedAt !== undefined) return [];

		requireRole(member.permissions, "members.invite");

		const rows = await ctx.db
			.query("invitations")
			.withIndex("by_orgId_and_status", (q) =>
				q.eq("orgId", args.orgId).eq("status", "pending"),
			)
			.take(100);

		// Resolve role names in one batch — `orgRoles` is small (≤ 50/org).
		const roleIds = Array.from(new Set(rows.map((r) => r.roleId)));
		const roleMap = new Map<string, { name: string; color?: string }>();
		await Promise.all(
			roleIds.map(async (id) => {
				const role = await ctx.db.get(id);
				if (role) roleMap.set(id, { name: role.name, color: role.color });
			}),
		);

		return rows.map((r) => ({
			...r,
			roleName: roleMap.get(r.roleId)?.name ?? "Member",
			roleColor: roleMap.get(r.roleId)?.color ?? null,
		}));
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

		requireRole(member.permissions, "members.invite");

		return await ctx.db
			.query("invitations")
			.withIndex("by_orgId_and_status", (q) => q.eq("orgId", args.orgId))
			.take(100);
	},
});

/**
 * Internal query — returns the data needed by the `sendInvitationEmail`
 * action: token + role name + expiry + orgName + inviter name + inviter email.
 *
 * Action runtimes can't read DB directly; this is the bridge.
 */
export const getForEmail = internalQuery({
	args: { invitationId: v.id("invitations") },
	handler: async (ctx, args) => {
		const invitation = await ctx.db.get(args.invitationId);
		if (!invitation) return null;
		const [org, inviter, role] = await Promise.all([
			ctx.db.get(invitation.orgId),
			ctx.db.get(invitation.invitedBy),
			ctx.db.get(invitation.roleId),
		]);
		return {
			token: invitation.token,
			email: invitation.email,
			role: role?.name ?? "Member",
			expiresAt: invitation.expiresAt,
			orgName: org?.name ?? "your workspace",
			inviterName: inviter?.name ?? null,
			inviterEmail: inviter?.email ?? null,
		};
	},
});
