/**
 * OrgRoles mutations — create, update, delete custom roles.
 *
 * PATTERN:
 *   - Public mutations use `authenticatedMutation` (Rule R2).
 *   - AI-callable `*ForAI` twins use `internalMutation` and accept the
 *     trusted `userId` as an explicit arg (per AGENTS.md non-negotiable
 *     ForAI rule). Auth bridges via `getOrgMember(ctx, orgId, userId)`.
 *   - Only members with `members.changeRole` permission can manage roles.
 *   - System roles (Owner, Admin, Member) cannot be deleted.
 *   - Every mutation calls `logActivity()` for audit trail.
 *
 * Sources:
 * - .github/agents/base/schema.md — orgRoles table definition
 * - .github/agents/base/rbac.md — RBAC design
 */
import { ConvexError, v } from "convex/values";
import { authenticatedMutation } from "../_functions/authenticated";
import type { Id } from "../_generated/dataModel";
import { internalMutation, type MutationCtx } from "../_generated/server";
import { ENTITY_TYPES } from "../_shared/constants";
import { ERRORS } from "../_shared/errors";
import { requireRole } from "../_shared/permissions";
import { logActivity } from "../activityLogs/helpers";
import { getOrgMember } from "../orgs/helpers";

async function createImpl(
	ctx: MutationCtx,
	args: {
		orgId: Id<"orgs">;
		userId: Id<"users">;
		name: string;
		description?: string;
		permissions: string[];
		isDefault?: boolean;
		color?: string;
	},
) {
	const now = Date.now();

	// Ensure name is unique within org
	const existing = await ctx.db
		.query("orgRoles")
		.withIndex("by_orgId_and_name", (q) => q.eq("orgId", args.orgId).eq("name", args.name))
		.first();
	if (existing) throw new ConvexError("A role with this name already exists.");

	// If this is set as default, unset any existing default
	if (args.isDefault) {
		const currentDefault = await ctx.db
			.query("orgRoles")
			.withIndex("by_orgId_and_isDefault", (q) =>
				q.eq("orgId", args.orgId).eq("isDefault", true),
			)
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
		userId: args.userId,
		action: "created",
		entityType: ENTITY_TYPES.ORG,
		entityId: roleId,
		description: `Created role "${args.name}"`,
	});

	return roleId;
}

/**
 * Create a custom role for an org. Requires `members.changeRole` permission.
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
		const member = await getOrgMember(ctx, args.orgId, ctx.userId);
		if (!member || member.deletedAt !== undefined) throw new ConvexError(ERRORS.FORBIDDEN);
		requireRole(member.permissions, "members.changeRole");
		return createImpl(ctx, { ...args, userId: ctx.userId });
	},
});

/** AI-callable internal twin. */
export const createForAI = internalMutation({
	args: {
		orgId: v.id("orgs"),
		userId: v.id("users"),
		name: v.string(),
		description: v.optional(v.string()),
		permissions: v.array(v.string()),
		isDefault: v.optional(v.boolean()),
		color: v.optional(v.string()),
	},
	handler: async (ctx, args) => {
		const member = await getOrgMember(ctx, args.orgId, args.userId);
		if (!member || member.deletedAt !== undefined) throw new ConvexError(ERRORS.FORBIDDEN);
		requireRole(member.permissions, "members.changeRole");
		return createImpl(ctx, args);
	},
});

async function updateImpl(
	ctx: MutationCtx,
	args: {
		userId: Id<"users">;
		roleId: Id<"orgRoles">;
		name?: string;
		description?: string;
		permissions?: string[];
		isDefault?: boolean;
		color?: string;
	},
) {
	const now = Date.now();

	const role = await ctx.db.get(args.roleId);
	if (!role) throw new ConvexError(ERRORS.NOT_FOUND);

	// System roles: only permissions and color can be updated, not name
	if (role.isSystem && args.name && args.name !== role.name) {
		throw new ConvexError("Cannot rename a system role.");
	}

	// If setting as default, unset current default
	if (args.isDefault) {
		const currentDefault = await ctx.db
			.query("orgRoles")
			.withIndex("by_orgId_and_isDefault", (q) =>
				q.eq("orgId", role.orgId).eq("isDefault", true),
			)
			.first();
		if (currentDefault && currentDefault._id !== args.roleId) {
			await ctx.db.patch(currentDefault._id, { isDefault: false, updatedAt: now });
		}
	}

	const { userId: _u, roleId, ...updates } = args;
	await ctx.db.patch(roleId, { ...updates, updatedAt: now });

	await logActivity(ctx, {
		orgId: role.orgId,
		userId: args.userId,
		action: "updated",
		entityType: ENTITY_TYPES.ORG,
		entityId: roleId,
		description: `Updated role "${role.name}"`,
	});
}

/**
 * Update a custom role. Requires `members.changeRole`. Cannot rename system roles.
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
		const role = await ctx.db.get(args.roleId);
		if (!role) throw new ConvexError(ERRORS.NOT_FOUND);

		const member = await getOrgMember(ctx, role.orgId, ctx.userId);
		if (!member || member.deletedAt !== undefined) throw new ConvexError(ERRORS.FORBIDDEN);
		requireRole(member.permissions, "members.changeRole");
		return updateImpl(ctx, { ...args, userId: ctx.userId });
	},
});

/** AI-callable internal twin. */
export const updateForAI = internalMutation({
	args: {
		userId: v.id("users"),
		roleId: v.id("orgRoles"),
		name: v.optional(v.string()),
		description: v.optional(v.string()),
		permissions: v.optional(v.array(v.string())),
		isDefault: v.optional(v.boolean()),
		color: v.optional(v.string()),
	},
	handler: async (ctx, args) => {
		const role = await ctx.db.get(args.roleId);
		if (!role) throw new ConvexError(ERRORS.NOT_FOUND);

		const member = await getOrgMember(ctx, role.orgId, args.userId);
		if (!member || member.deletedAt !== undefined) throw new ConvexError(ERRORS.FORBIDDEN);
		requireRole(member.permissions, "members.changeRole");
		return updateImpl(ctx, args);
	},
});

async function removeImpl(ctx: MutationCtx, args: { userId: Id<"users">; roleId: Id<"orgRoles"> }) {
	const now = Date.now();

	const role = await ctx.db.get(args.roleId);
	if (!role) throw new ConvexError(ERRORS.NOT_FOUND);
	if (role.isSystem) throw new ConvexError("Cannot delete a system role.");

	// Reassign affected members to the org's default role
	const defaultRole = await ctx.db
		.query("orgRoles")
		.withIndex("by_orgId_and_isDefault", (q) => q.eq("orgId", role.orgId).eq("isDefault", true))
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
		userId: args.userId,
		action: "deleted",
		entityType: ENTITY_TYPES.ORG,
		entityId: args.roleId,
		description: `Deleted role "${role.name}"`,
	});
}

/**
 * Delete a custom role. Requires `members.changeRole`. Cannot delete system roles.
 * Members with this role will have their roleId reassigned to the default role.
 */
export const remove = authenticatedMutation({
	args: { roleId: v.id("orgRoles") },
	handler: async (ctx, args) => {
		const role = await ctx.db.get(args.roleId);
		if (!role) throw new ConvexError(ERRORS.NOT_FOUND);

		const member = await getOrgMember(ctx, role.orgId, ctx.userId);
		if (!member || member.deletedAt !== undefined) throw new ConvexError(ERRORS.FORBIDDEN);
		requireRole(member.permissions, "members.changeRole");
		return removeImpl(ctx, { ...args, userId: ctx.userId });
	},
});

/** AI-callable internal twin. */
export const removeForAI = internalMutation({
	args: { userId: v.id("users"), roleId: v.id("orgRoles") },
	handler: async (ctx, args) => {
		const role = await ctx.db.get(args.roleId);
		if (!role) throw new ConvexError(ERRORS.NOT_FOUND);

		const member = await getOrgMember(ctx, role.orgId, args.userId);
		if (!member || member.deletedAt !== undefined) throw new ConvexError(ERRORS.FORBIDDEN);
		requireRole(member.permissions, "members.changeRole");
		return removeImpl(ctx, args);
	},
});
