/**
 * Invitation queries.
 *
 * All queries are org-scoped and require `members.invite` permission to read.
 */
import { v } from "convex/values";
import { authenticatedQuery, orgQuery } from "../_functions/authenticated";
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
 * List pending invitations addressed to the signed-in user (across every
 * org). Powers the "you've been invited to <org>" entries in the
 * WorkspaceSwitcher dropdown so a user who's already signed in to one
 * workspace can accept a fresh invite from another workspace without
 * digging through their email for the magic link.
 *
 * SCOPE
 * ─────
 * Returns ONLY invitations whose `email` exactly matches the signed-in
 * user's email AND whose `status === "pending"` AND whose `expiresAt` is
 * still in the future. Soft-filters expired-but-not-yet-cleaned-up rows
 * client-side so the dropdown doesn't show stale entries between the
 * expiry tick and the next admin cleanup pass.
 *
 * SECURITY
 * ────────
 * Public auth required (no org-scoped permission needed — these are
 * invitations addressed to the user themselves). The query reads only
 * `ctx.user.email` to filter, so a user can never enumerate invitations
 * sent to another email.
 *
 * INDEX
 * ─────
 * Backed by `invitations.by_email_and_status` (added 2026-05-30) — gives
 * O(log n) on the (email, status) pair without scanning the full table.
 */
export const listPendingForMe = authenticatedQuery({
	args: {},
	handler: async (ctx) => {
		const myEmail = ctx.user.email;
		if (!myEmail) return [];

		const now = Date.now();

		const rows = await ctx.db
			.query("invitations")
			.withIndex("by_email_and_status", (q) => q.eq("email", myEmail).eq("status", "pending"))
			// Capped — a user with > 50 simultaneous pending invites is
			// extraordinarily unusual; the dropdown UI only renders the
			// first few anyway.
			.take(50);

		const fresh = rows.filter((r) => r.expiresAt > now);

		// Resolve org names + role names in one batch each. Both lists are
		// tiny (≤ 50 entries) so a parallel hydrate is cheaper than
		// per-row lookups in the UI.
		const orgIds = Array.from(new Set(fresh.map((r) => r.orgId)));
		const roleIds = Array.from(new Set(fresh.map((r) => r.roleId)));

		const [orgs, roles] = await Promise.all([
			Promise.all(orgIds.map((id) => ctx.db.get(id))),
			Promise.all(roleIds.map((id) => ctx.db.get(id))),
		]);

		const orgMap = new Map(orgs.filter((o) => o !== null).map((o) => [o!._id, o!]));
		const roleMap = new Map(roles.filter((r) => r !== null).map((r) => [r!._id, r!]));

		// Drop invitations whose org or role was deleted between insert and
		// read — the accept page would error on them anyway, so don't
		// surface them in the switcher.
		const enriched = fresh
			.map((r) => {
				const org = orgMap.get(r.orgId);
				const role = roleMap.get(r.roleId);
				if (!org || !role) return null;
				if (org.deletedAt !== undefined) return null;
				return {
					_id: r._id,
					token: r.token,
					email: r.email,
					expiresAt: r.expiresAt,
					orgId: r.orgId,
					orgName: org.name,
					orgSlug: org.slug,
					roleName: role.name,
					roleColor: role.color ?? null,
				};
			})
			.filter((row): row is NonNullable<typeof row> => row !== null)
			// Newest invitation first so the most recent "please join us"
			// floats to the top of the dropdown.
			.sort((a, b) => b.expiresAt - a.expiresAt);

		return enriched;
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
