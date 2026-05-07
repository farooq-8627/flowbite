/**
 * Invitation mutations — create, accept, decline, cancel.
 *
 * PATTERN:
 *   - `create` / `cancel` require org membership + `members.invite` permission.
 *   - `accept` / `decline` are authenticated (no org membership required — the
 *     invited user isn't a member yet).
 *   - Every mutation calls `logActivity()` for audit trail.
 *   - `create` and `accept` call `sendNotification()`.
 *   - Token-based: each invitation has a UUID token for email links.
 *
 * Sources:
 * - https://github.com/dbjpanda/convex-tenants/blob/main/example/convex/tenants.ts
 * - https://github.com/get-convex/convex-saas/blob/main/convex/invitations.ts
 */
import { ConvexError, v } from "convex/values";
import { authenticatedMutation, orgMutation } from "../_functions/authenticated";
import { ENTITY_TYPES, INVITATION_EXPIRY_MS } from "../_shared/constants";
import { ERRORS } from "../_shared/errors";
import { requireRole } from "../_shared/permissions";
import { invitationRoleValidator, type OrgRole } from "../_shared/validators";
import { logActivity } from "../activityLogs/helpers";
import { sendNotification } from "../notifications/helpers";
import { getOrgMember } from "../orgs/helpers";

/**
 * Create an invitation. Requires `members.invite` permission (owner/admin).
 * Prevents duplicate pending invitations to the same email in the same org.
 */
export const create = orgMutation({
	args: {
		orgId: v.id("orgs"),
		email: v.string(),
		role: invitationRoleValidator,
	},
	handler: async (ctx, args) => {
		const now = Date.now();

		const member = await getOrgMember(ctx, args.orgId, ctx.userId);
		if (!member || member.deletedAt !== undefined) throw new ConvexError(ERRORS.FORBIDDEN);

		requireRole(member.role as OrgRole, "members.invite");

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
			role: args.role,
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
			description: `Invited ${args.email} as ${args.role}`,
		});

		return { invitationId, token };
	},
});

/**
 * Accept an invitation by token. The accepting user becomes an org member.
 * Authenticated — user must be logged in, but doesn't need to be an org member.
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

		// Check if already a member (e.g. race condition or re-join)
		const existingMember = await getOrgMember(ctx, invitation.orgId, ctx.userId);
		if (existingMember && existingMember.deletedAt === undefined) {
			// Already a member — just mark invitation as accepted
			await ctx.db.patch(invitation._id, {
				status: "accepted",
				updatedAt: now,
			});
			return { orgId: invitation.orgId, alreadyMember: true };
		}

		// If previously soft-deleted, reactivate
		if (existingMember && existingMember.deletedAt !== undefined) {
			const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
			const roleDoc = await ctx.db
				.query("orgRoles")
				.withIndex("by_orgId_and_name", (q) =>
					q.eq("orgId", invitation.orgId).eq("name", capitalize(invitation.role)),
				)
				.first();
			await ctx.db.patch(existingMember._id, {
				roleId: roleDoc?._id,
				deletedAt: undefined,
				updatedAt: now,
				joinedAt: now,
			});
		} else {
			const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
			const roleDoc = await ctx.db
				.query("orgRoles")
				.withIndex("by_orgId_and_name", (q) =>
					q.eq("orgId", invitation.orgId).eq("name", capitalize(invitation.role)),
				)
				.first();

			if (!roleDoc) throw new ConvexError("Role not found in this organization.");

			// Create new membership
			await ctx.db.insert("orgMembers", {
				orgId: invitation.orgId,
				userId: ctx.userId,
				roleId: roleDoc._id,
				invitedBy: invitation.invitedBy,
				joinedAt: now,
			});
		}

		// Mark invitation as accepted
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
			description: `Accepted invitation and joined as ${invitation.role}`,
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

		requireRole(member.role as OrgRole, "members.invite");

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
