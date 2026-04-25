/**
 * Org mutations.
 *
 * PATTERN:
 *   - All public mutations use `authenticatedMutation` or `orgMutation` (Rule R2).
 *   - Role checks use `requireRole()` / `requireMinRole()` from permissions.ts.
 *   - Every mutation calls `logActivity()` after DB writes (audit trail).
 *   - Member-affecting mutations call `sendNotification()` for the affected user.
 *   - Every patch includes `updatedAt: Date.now()` (Rule R7).
 *
 * Sources:
 * - https://github.com/get-convex/convex-saas/blob/main/convex/organizations.ts
 * - https://github.com/dbjpanda/convex-tenants/blob/main/example/convex/tenants.ts
 */
import { ConvexError, v } from "convex/values";
import { authenticatedMutation, orgMutation } from "../_functions/authenticated";
import { DEFAULT_ORG_PLAN, ENTITY_TYPES } from "../_shared/constants";
import { ERRORS } from "../_shared/errors";
import { requireRole, requireMinRole } from "../_shared/permissions";
import type { OrgRole } from "../_shared/validators";
import { invitationRoleValidator } from "../_shared/validators";
import { logActivity } from "../activityLogs/helpers";
import { sendNotification } from "../notifications/helpers";
import { generateSlug, getOrgBySlug, getOrgMember } from "./helpers";

/**
 * Create a new org. The creating user automatically becomes the owner.
 */
export const create = authenticatedMutation({
	args: {
		name: v.string(),
		slug: v.optional(v.string()),
	},
	handler: async (ctx, args) => {
		const now = Date.now();

		const slug = args.slug ?? generateSlug(args.name);

		const existing = await getOrgBySlug(ctx, slug);
		if (existing) throw new ConvexError(ERRORS.ORG_SLUG_TAKEN);

		const orgId = await ctx.db.insert("orgs", {
			name: args.name,
			slug,
			plan: DEFAULT_ORG_PLAN,
			createdAt: now,
			updatedAt: now,
		});

		await ctx.db.insert("orgMembers", {
			orgId,
			userId: ctx.userId,
			role: "owner",
			joinedAt: now,
		});

		if (!ctx.user.defaultOrgId) {
			await ctx.db.patch(ctx.userId, {
				defaultOrgId: orgId,
				onboardingCompleted: true,
				updatedAt: now,
			});
		}

		await logActivity(ctx, {
			orgId,
			userId: ctx.userId,
			action: "created",
			entityType: ENTITY_TYPES.ORG,
			entityId: orgId,
			description: `Created organization "${args.name}"`,
		});

		return orgId;
	},
});

/**
 * Update org settings (name, slug, currency/timezone). Requires `org.editSettings`.
 */
export const update = orgMutation({
	args: {
		orgId: v.id("orgs"),
		name: v.optional(v.string()),
		slug: v.optional(v.string()),
		settings: v.optional(
			v.object({
				defaultCurrency: v.optional(v.string()),
				timezone: v.optional(v.string()),
			}),
		),
	},
	handler: async (ctx, args) => {
		const now = Date.now();

		const member = await getOrgMember(ctx, args.orgId, ctx.userId);
		if (!member || member.deletedAt !== undefined)
			throw new ConvexError(ERRORS.ORG_MEMBER_NOT_FOUND);

		requireMinRole(member.role as OrgRole, "admin");

		const { orgId, ...updates } = args;

		if (updates.slug) {
			const existing = await getOrgBySlug(ctx, updates.slug);
			if (existing && existing._id !== orgId) throw new ConvexError(ERRORS.ORG_SLUG_TAKEN);
		}

		await ctx.db.patch(orgId, { ...updates, updatedAt: now });

		await logActivity(ctx, {
			orgId,
			userId: ctx.userId,
			action: "updated",
			entityType: ENTITY_TYPES.ORG,
			entityId: orgId,
			description: "Updated organization settings",
		});
	},
});

/**
 * Remove a member from the org (soft-delete). Requires `members.remove`.
 * Cannot remove the last owner.
 */
export const removeMember = orgMutation({
	args: {
		orgId: v.id("orgs"),
		userId: v.id("users"),
	},
	handler: async (ctx, args) => {
		const now = Date.now();

		const actorMember = await getOrgMember(ctx, args.orgId, ctx.userId);
		if (!actorMember || actorMember.deletedAt !== undefined)
			throw new ConvexError(ERRORS.FORBIDDEN);

		requireRole(actorMember.role as OrgRole, "members.remove");

		const targetMember = await getOrgMember(ctx, args.orgId, args.userId);
		if (!targetMember || targetMember.deletedAt !== undefined)
			throw new ConvexError(ERRORS.ORG_MEMBER_NOT_FOUND);

		if (targetMember.role === "owner") {
			const ownerCount = await ctx.db
				.query("orgMembers")
				.withIndex("by_orgId_and_role", (q) =>
					q.eq("orgId", args.orgId).eq("role", "owner"),
				)
				.take(10);
			const activeOwners = ownerCount.filter((m) => m.deletedAt === undefined);
			if (activeOwners.length <= 1)
				throw new ConvexError("Cannot remove the last owner of an organization.");
		}

		await ctx.db.patch(targetMember._id, { deletedAt: now });

		await logActivity(ctx, {
			orgId: args.orgId,
			userId: ctx.userId,
			action: "deleted",
			entityType: ENTITY_TYPES.MEMBER,
			entityId: targetMember._id,
			description: `Removed member from organization`,
		});

		// Notify the removed user (not the actor)
		if (args.userId !== ctx.userId) {
			await sendNotification(ctx, {
				orgId: args.orgId,
				userId: args.userId,
				type: "member.removed",
				title: "You have been removed from an organization",
				body: "Your membership has been revoked by an administrator.",
				entityType: ENTITY_TYPES.MEMBER,
				entityId: targetMember._id,
			});
		}
	},
});

/**
 * Update a member's role. Requires `members.changeRole` (owner only).
 */
export const updateMemberRole = orgMutation({
	args: {
		orgId: v.id("orgs"),
		userId: v.id("users"),
		role: invitationRoleValidator,
	},
	handler: async (ctx, args) => {
		const now = Date.now();

		const actorMember = await getOrgMember(ctx, args.orgId, ctx.userId);
		if (!actorMember || actorMember.deletedAt !== undefined)
			throw new ConvexError(ERRORS.FORBIDDEN);

		requireRole(actorMember.role as OrgRole, "members.changeRole");

		const targetMember = await getOrgMember(ctx, args.orgId, args.userId);
		if (!targetMember || targetMember.deletedAt !== undefined)
			throw new ConvexError(ERRORS.ORG_MEMBER_NOT_FOUND);

		const previousRole = targetMember.role;
		await ctx.db.patch(targetMember._id, { role: args.role, updatedAt: now });

		await logActivity(ctx, {
			orgId: args.orgId,
			userId: ctx.userId,
			action: "updated",
			entityType: ENTITY_TYPES.MEMBER,
			entityId: targetMember._id,
			description: `Changed role from ${previousRole} to ${args.role}`,
		});

		// Notify the affected user about role change
		if (args.userId !== ctx.userId) {
			await sendNotification(ctx, {
				orgId: args.orgId,
				userId: args.userId,
				type: "member.roleChanged",
				title: "Your role has been updated",
				body: `Your role has been changed from ${previousRole} to ${args.role}.`,
				entityType: ENTITY_TYPES.MEMBER,
				entityId: targetMember._id,
			});
		}
	},
});

/**
 * Soft-delete the org. Requires `org.delete` (owner only).
 */
export const deleteOrg = orgMutation({
	args: { orgId: v.id("orgs") },
	handler: async (ctx, args) => {
		const now = Date.now();

		const member = await getOrgMember(ctx, args.orgId, ctx.userId);
		if (!member || member.deletedAt !== undefined) throw new ConvexError(ERRORS.FORBIDDEN);

		requireRole(member.role as OrgRole, "org.delete");

		await ctx.db.patch(args.orgId, { deletedAt: now, updatedAt: now });

		await logActivity(ctx, {
			orgId: args.orgId,
			userId: ctx.userId,
			action: "deleted",
			entityType: ENTITY_TYPES.ORG,
			entityId: args.orgId,
			description: "Deleted organization",
		});
	},
});
