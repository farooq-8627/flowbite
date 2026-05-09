/**
 * OrgRoles mutations — create, update, delete custom roles.
 *
 * PATTERN:
 *   - All mutations use `authenticatedMutation` (Rule R2).
 *   - Only owners can manage roles (RBAC is owner-gated per PERMISSIONS map).
 *   - System roles (Owner, Admin, Member) cannot be deleted.
 *   - Every mutation calls `logActivity()` for audit trail.
 *
 * Sources:
 * - .github/agents/base/schema.md — orgRoles table definition
 * - .github/agents/base/rbac.md — RBAC design
 */
import { ConvexError, v } from "convex/values";
import { authenticatedMutation } from "../_functions/authenticated";
import { ENTITY_TYPES } from "../_shared/constants";
import { ERRORS } from "../_shared/errors";
import { requireRole } from "../_shared/permissions";
import { logActivity } from "../activityLogs/helpers";
import { getOrgMember } from "../orgs/helpers";

/**
 * Create a custom role for an org. Owner only.
 */
export const create = authenticatedMutation({
	args: {
		orgId: v.id("orgs"),
		name: v.string(),
		description: v.optional(v.string()),
		permissions: v.array(v.string()),
		isDefault: v.optional(v.boolean()),
		color: v.optional(v.string()),
	},
	handler: async (ctx, args) => {
		const now = Date.now();

		const member = await getOrgMember(ctx, args.orgId, ctx.userId);
		if (!member || member.deletedAt !== undefined) throw new ConvexError(ERRORS.FORBIDDEN);
		requireRole(member.permissions, "members.changeRole");

		// Ensure name is unique within org
		const existing = await ctx.db
			.query("orgRoles")
			.withIndex("by_orgId_and_name", (q) =>
				q.eq("orgId", args.orgId).eq("name", args.name),
			)
			.first();
		if (existing) throw new ConvexError("A role with this name already exists.");

		// If this is set as default, unset any existing default
		if (args.isDefault) {
			const currentDefault = await ctx.db
				.query("orgRoles")
				.withIndex("by_orgId", (q) => q.eq("orgId", args.orgId))
				.filter((q) => q.eq(q.field("isDefault"), true))
				.first();
			if (currentDefault) {
				await ctx.db.patch(currentDefault._id, { isDefault: false, updatedAt: now });
			}
		}

		const roleId = await ctx.db.insert("orgRoles", {
			orgId: args.orgId,
			name: args.name,
			description: args.description,
			permissions: args.permissions,
			isSystem: false,
			isDefault: args.isDefault ?? false,
			color: args.color,
			createdAt: now,
			updatedAt: now,
		});

		await logActivity(ctx, {
			orgId: args.orgId,
			userId: ctx.userId,
			action: "created",
			entityType: ENTITY_TYPES.ORG,
			entityId: roleId,
			description: `Created role "${args.name}"`,
		});

		return roleId;
	},
});

/**
 * Update a custom role. Owner only. Cannot update system roles' name or isSystem flag.
 */
export const update = authenticatedMutation({
	args: {
		roleId: v.id("orgRoles"),
		name: v.optional(v.string()),
		description: v.optional(v.string()),
		permissions: v.optional(v.array(v.string())),
		isDefault: v.optional(v.boolean()),
		color: v.optional(v.string()),
	},
	handler: async (ctx, args) => {
		const now = Date.now();

		const role = await ctx.db.get(args.roleId);
		if (!role) throw new ConvexError(ERRORS.NOT_FOUND);

		const member = await getOrgMember(ctx, role.orgId, ctx.userId);
		if (!member || member.deletedAt !== undefined) throw new ConvexError(ERRORS.FORBIDDEN);
		requireRole(member.permissions, "members.changeRole");

		// System roles: only permissions and color can be updated, not name
		if (role.isSystem && args.name && args.name !== role.name) {
			throw new ConvexError("Cannot rename a system role.");
		}

		// If setting as default, unset current default
		if (args.isDefault) {
			const currentDefault = await ctx.db
				.query("orgRoles")
				.withIndex("by_orgId", (q) => q.eq("orgId", role.orgId))
				.filter((q) => q.eq(q.field("isDefault"), true))
				.first();
			if (currentDefault && currentDefault._id !== args.roleId) {
				await ctx.db.patch(currentDefault._id, { isDefault: false, updatedAt: now });
			}
		}

		const { roleId, ...updates } = args;
		await ctx.db.patch(roleId, { ...updates, updatedAt: now });

		await logActivity(ctx, {
			orgId: role.orgId,
			userId: ctx.userId,
			action: "updated",
			entityType: ENTITY_TYPES.ORG,
			entityId: roleId,
			description: `Updated role "${role.name}"`,
		});
	},
});

/**
 * Delete a custom role. Owner only. Cannot delete system roles.
 * Members with this role will have their roleId cleared (they keep their legacy `role` string).
 */
export const remove = authenticatedMutation({
	args: { roleId: v.id("orgRoles") },
	handler: async (ctx, args) => {
		const now = Date.now();

		const role = await ctx.db.get(args.roleId);
		if (!role) throw new ConvexError(ERRORS.NOT_FOUND);

		const member = await getOrgMember(ctx, role.orgId, ctx.userId);
		if (!member || member.deletedAt !== undefined) throw new ConvexError(ERRORS.FORBIDDEN);
		requireRole(member.permissions, "members.changeRole");

		if (role.isSystem) throw new ConvexError("Cannot delete a system role.");

		// Reassign affected members to the org's default role
		const defaultRole = await ctx.db
			.query("orgRoles")
			.withIndex("by_orgId", (q) => q.eq("orgId", role.orgId))
			.filter((q) => q.eq(q.field("isDefault"), true))
			.first();
		if (!defaultRole) throw new ConvexError("No default role found. Cannot delete role.");

		const affectedMembers = await ctx.db
			.query("orgMembers")
			.withIndex("by_orgId_and_userId", (q) => q.eq("orgId", role.orgId))
			.take(500);

		for (const m of affectedMembers) {
			if (m.roleId === args.roleId) {
				await ctx.db.patch(m._id, { roleId: defaultRole._id, updatedAt: now });
			}
		}

		await ctx.db.delete(args.roleId);

		await logActivity(ctx, {
			orgId: role.orgId,
			userId: ctx.userId,
			action: "deleted",
			entityType: ENTITY_TYPES.ORG,
			entityId: args.roleId,
			description: `Deleted role "${role.name}"`,
		});
	},
});
