/**
 * Invitation mutations — create, accept, decline, cancel.
 *
 * PATTERN:
 *   - `create` / `cancel` require org membership + `members.invite` permission.
 *   - `accept` / `decline` are authenticated (no org membership required — the
 *     invited user isn't a member yet).
 *   - Every mutation calls `logActivity()` for audit trail.
 *   - `create` and `accept` call `sendNotification()`.
 *   - `create` schedules `internal.invitations.actions.sendInvitationEmail`
 *     which delivers the accept URL via Resend. Email is best-effort —
 *     when RESEND_API_KEY is unset the mutation still returns the accept URL
 *     so the inviter can share it manually (Copy invite link in the UI).
 *   - Token-based: each invitation has a UUID token for email links.
 *
 * Sources:
 * - https://github.com/dbjpanda/convex-tenants/blob/main/example/convex/tenants.ts
 * - https://github.com/get-convex/convex-saas/blob/main/convex/invitations.ts
 */
import { ConvexError, v } from "convex/values";
import { authenticatedMutation, orgMutation } from "../_functions/authenticated";
import { internal } from "../_generated/api";
import { internalMutation } from "../_generated/server";
import { ENTITY_TYPES, INVITATION_EXPIRY_MS } from "../_shared/constants";
import { ERRORS } from "../_shared/errors";
import { applyOrgStat } from "../_shared/orgStats";
import { requireRole } from "../_shared/permissions";
import { logActivity } from "../activityLogs/helpers";
import { sendNotification } from "../notifications/helpers";
import { getOrgMember } from "../orgs/helpers";

/**
 * Build the public accept URL for a given token.
 *
 * Reads `APP_PUBLIC_URL` from the Convex env (NOT NEXT_PUBLIC_APP_URL —
 * Convex backend has its own env scope). Falls back to localhost so dev
 * works out of the box.
 */
function buildAcceptUrl(token: string): string {
	const base = (process.env.APP_PUBLIC_URL ?? "http://localhost:3000").replace(/\/$/, "");
	return `${base}/join/${token}`;
}

/**
 * Create an invitation. Requires `members.invite` permission (owner/admin).
 * Prevents duplicate pending invitations to the same email in the same org.
 *
 * Role assignment
 * ───────────────
 * Caller passes `roleId: Id<"orgRoles">` — the role the invitee will be
 * assigned on accept. Validations:
 *   1. The role must belong to this org.
 *   2. The role must NOT be the Owner role (creators only — never invite-able).
 * The role's permissions are NOT copied here; they're resolved at accept time
 * from whatever the role doc currently contains. This way a role rename or
 * permission edit between invite and accept always uses the latest state.
 */
export const create = orgMutation({
	args: {
		orgId: v.id("orgs"),
		email: v.string(),
		roleId: v.id("orgRoles"),
	},
	handler: async (ctx, args) => {
		const now = Date.now();

		const member = await getOrgMember(ctx, args.orgId, ctx.userId);
		if (!member || member.deletedAt !== undefined) throw new ConvexError(ERRORS.FORBIDDEN);

		requireRole(member.permissions, "members.invite");

		// Validate the target role: must belong to this org, must NOT be Owner.
		const role = await ctx.db.get(args.roleId);
		if (!role || role.orgId !== args.orgId) {
			throw new ConvexError({
				code: "INVALID_ROLE",
				message: "Selected role does not belong to this organization.",
			});
		}
		if (role.name === "Owner") {
			throw new ConvexError({
				code: "OWNER_NOT_INVITABLE",
				message: "Owner role cannot be assigned via invitation.",
			});
		}

		// Check for existing pending invitation to same email
		const existing = await ctx.db
			.query("invitations")
			.withIndex("by_orgId_and_email", (q) =>
				q.eq("orgId", args.orgId).eq("email", args.email),
			)
			.first();

		if (existing && existing.status === "pending" && existing.expiresAt > now) {
			throw new ConvexError("An active invitation already exists for this email address.");
		}

		// Check if user is already a member
		const existingUser = await ctx.db
			.query("users")
			.withIndex("by_email", (q) => q.eq("email", args.email))
			.first();

		if (existingUser) {
			const existingMember = await getOrgMember(ctx, args.orgId, existingUser._id);
			if (existingMember && existingMember.deletedAt === undefined) {
				throw new ConvexError(ERRORS.ORG_ALREADY_MEMBER);
			}
		}

		const token = crypto.randomUUID();

		const invitationId = await ctx.db.insert("invitations", {
			orgId: args.orgId,
			email: args.email,
			roleId: args.roleId,
			status: "pending",
			invitedBy: ctx.userId,
			token,
			expiresAt: now + INVITATION_EXPIRY_MS,
			createdAt: now,
			updatedAt: now,
		});

		await logActivity(ctx, {
			orgId: args.orgId,
			userId: ctx.userId,
			action: "created",
			entityType: ENTITY_TYPES.INVITATION,
			entityId: invitationId,
			description: `Invited ${args.email} as ${role.name}`,
		});

		// Schedule the email send. Runs as an internal action (Node runtime)
		// so it can call Resend. Soft-fails when RESEND_API_KEY is unset —
		// the inviter still gets the accept URL via the return value below
		// so they can share the link manually.
		await ctx.scheduler.runAfter(0, internal.invitations.actions.sendInvitationEmail, {
			invitationId,
		});

		return { invitationId, token, acceptUrl: buildAcceptUrl(token) };
	},
});

/**
 * Accept an invitation by token. The accepting user becomes an org member.
 * Authenticated — user must be logged in, but doesn't need to be an org member.
 *
 * Once accepted, the invitation's `status` flips to `"accepted"` and the
 * link is dead. If the owner later removes the member, the same link
 * cannot be reused — the user must be re-invited (which generates a new
 * token). This is the "one-shot link" guarantee.
 */
export const accept = authenticatedMutation({
	args: { token: v.string() },
	handler: async (ctx, args) => {
		const now = Date.now();

		const invitation = await ctx.db
			.query("invitations")
			.withIndex("by_token", (q) => q.eq("token", args.token))
			.first();

		if (!invitation) throw new ConvexError(ERRORS.INVITATION_NOT_FOUND);
		if (invitation.status !== "pending") throw new ConvexError(ERRORS.INVITATION_ALREADY_USED);
		if (invitation.expiresAt < now) throw new ConvexError(ERRORS.INVITATION_EXPIRED);

		// Verify accepting user's email matches invitation
		if (ctx.user.email !== invitation.email) {
			throw new ConvexError(ERRORS.INVITATION_EMAIL_MISMATCH);
		}

		// Resolve the role doc the inviter chose. If the role was deleted
		// between invite and accept, refuse — admin should re-invite with a
		// different role rather than silently fall back.
		const roleDoc = await ctx.db.get(invitation.roleId);
		if (!roleDoc || roleDoc.orgId !== invitation.orgId) {
			throw new ConvexError({
				code: "ROLE_GONE",
				message:
					"The role on this invitation no longer exists. Ask your admin to send a new invitation.",
			});
		}

		// Check if already a member (e.g. race condition or re-join attempt)
		const existingMember = await getOrgMember(ctx, invitation.orgId, ctx.userId);
		if (existingMember && existingMember.deletedAt === undefined) {
			// Already a member — just mark invitation as accepted
			await ctx.db.patch(invitation._id, {
				status: "accepted",
				updatedAt: now,
			});
			return { orgId: invitation.orgId, alreadyMember: true };
		}

		// If previously soft-deleted, reactivate with the role from the invite.
		if (existingMember && existingMember.deletedAt !== undefined) {
			await ctx.db.patch(existingMember._id, {
				roleId: roleDoc._id,
				deletedAt: undefined,
				updatedAt: now,
				joinedAt: now,
			});
			await applyOrgStat(ctx, invitation.orgId, "members.active", +1);
		} else {
			// Create new membership
			await ctx.db.insert("orgMembers", {
				orgId: invitation.orgId,
				userId: ctx.userId,
				roleId: roleDoc._id,
				invitedBy: invitation.invitedBy,
				joinedAt: now,
			});
			await applyOrgStat(ctx, invitation.orgId, "members.active", +1);
		}

		// Mark invitation as accepted — link is now one-shot dead.
		await ctx.db.patch(invitation._id, {
			status: "accepted",
			updatedAt: now,
		});

		// Set as default org if user doesn't have one
		if (!ctx.user.defaultOrgId) {
			await ctx.db.patch(ctx.userId, {
				defaultOrgId: invitation.orgId,
				updatedAt: now,
			});
		}

		await logActivity(ctx, {
			orgId: invitation.orgId,
			userId: ctx.userId,
			action: "created",
			entityType: ENTITY_TYPES.MEMBER,
			entityId: ctx.userId,
			description: `Accepted invitation and joined as ${roleDoc.name}`,
		});

		// Notify the person who invited
		await sendNotification(ctx, {
			orgId: invitation.orgId,
			userId: invitation.invitedBy,
			type: "invitation.accepted",
			title: "Invitation accepted",
			body: `${ctx.user.email} has accepted your invitation.`,
			entityType: ENTITY_TYPES.INVITATION,
			entityId: invitation._id,
		});

		return { orgId: invitation.orgId, alreadyMember: false };
	},
});

/**
 * Decline an invitation by token. Authenticated — email must match.
 */
export const decline = authenticatedMutation({
	args: { token: v.string() },
	handler: async (ctx, args) => {
		const now = Date.now();

		const invitation = await ctx.db
			.query("invitations")
			.withIndex("by_token", (q) => q.eq("token", args.token))
			.first();

		if (!invitation) throw new ConvexError(ERRORS.INVITATION_NOT_FOUND);
		if (invitation.status !== "pending") throw new ConvexError(ERRORS.INVITATION_ALREADY_USED);

		if (ctx.user.email !== invitation.email) {
			throw new ConvexError(ERRORS.INVITATION_EMAIL_MISMATCH);
		}

		await ctx.db.patch(invitation._id, {
			status: "declined",
			updatedAt: now,
		});

		await logActivity(ctx, {
			orgId: invitation.orgId,
			userId: ctx.userId,
			action: "updated",
			entityType: ENTITY_TYPES.INVITATION,
			entityId: invitation._id,
			description: `Declined invitation`,
		});
	},
});

/**
 * Cancel a pending invitation. Requires `members.invite` permission.
 */
export const cancel = orgMutation({
	args: {
		orgId: v.id("orgs"),
		invitationId: v.id("invitations"),
	},
	handler: async (ctx, args) => {
		const now = Date.now();

		const member = await getOrgMember(ctx, args.orgId, ctx.userId);
		if (!member || member.deletedAt !== undefined) throw new ConvexError(ERRORS.FORBIDDEN);

		requireRole(member.permissions, "members.invite");

		const invitation = await ctx.db.get(args.invitationId);
		if (!invitation || invitation.orgId !== args.orgId)
			throw new ConvexError(ERRORS.INVITATION_NOT_FOUND);
		if (invitation.status !== "pending") throw new ConvexError(ERRORS.INVITATION_ALREADY_USED);

		await ctx.db.patch(invitation._id, {
			status: "expired",
			updatedAt: now,
		});

		await logActivity(ctx, {
			orgId: args.orgId,
			userId: ctx.userId,
			action: "deleted",
			entityType: ENTITY_TYPES.INVITATION,
			entityId: invitation._id,
			description: `Cancelled invitation for ${invitation.email}`,
		});
	},
});

/**
 * Internal — called by `sendInvitationEmail` action to record the email
 * delivery outcome on the activity log. Never throws (a failed write here
 * shouldn't break the user-visible flow).
 */
export const recordEmailDelivery = internalMutation({
	args: {
		invitationId: v.id("invitations"),
		ok: v.boolean(),
		detail: v.string(),
	},
	handler: async (ctx, args) => {
		const invitation = await ctx.db.get(args.invitationId);
		if (!invitation) return;

		await logActivity(ctx, {
			orgId: invitation.orgId,
			userId: invitation.invitedBy,
			action: args.ok ? "updated" : "updated",
			entityType: ENTITY_TYPES.INVITATION,
			entityId: args.invitationId,
			description: args.ok
				? `Invitation email delivered to ${invitation.email}`
				: `Invitation email NOT delivered to ${invitation.email}: ${args.detail}`,
		});
	},
});
