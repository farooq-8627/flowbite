/**
 * Saved Views Mutations — convex/crm/shared/savedViews/mutations.ts
 */
import { ConvexError, v } from "convex/values";
import type { Id } from "../../../_generated/dataModel";
import { internalMutation, type MutationCtx } from "../../../_generated/server";
import {
	orgMutation,
	requireOrgMember,
	requireOrgMemberByIds,
} from "../../../_functions/authenticated";
import { ERRORS } from "../../../_shared/errors";
import { requireRole } from "../../../_shared/permissions";

async function createImpl(
	ctx: MutationCtx,
	args: {
		orgId: Id<"orgs">;
		userId: Id<"users">;
		name: string;
		entityType: string;
		scope: "user" | "org";
		filters: string;
		sortBy?: string;
		sortOrder?: string;
		columns?: string[];
		isPinned?: boolean;
	},
) {
	try {
		JSON.parse(args.filters);
	} catch {
		throw new ConvexError({
			code: "INVALID_FILTERS",
			message: "filters must be valid JSON",
		});
	}

	const now = Date.now();
	return ctx.db.insert("savedViews", {
		orgId: args.orgId,
		name: args.name,
		entityType: args.entityType,
		scope: args.scope,
		filters: args.filters,
		sortBy: args.sortBy,
		sortOrder: args.sortOrder,
		columns: args.columns,
		isPinned: args.isPinned ?? false,
		createdBy: args.userId,
		createdAt: now,
		updatedAt: now,
	});
}

export const create = orgMutation({
	args: {
		orgId: v.id("orgs"),
		name: v.string(),
		entityType: v.string(),
		scope: v.union(v.literal("user"), v.literal("org")),
		filters: v.string(), // JSON string
		sortBy: v.optional(v.string()),
		sortOrder: v.optional(v.string()),
		columns: v.optional(v.array(v.string())),
		isPinned: v.optional(v.boolean()),
	},
	handler: async (ctx, args) => {
		const { member, userId } = await requireOrgMember(ctx, args.orgId);
		if (args.scope === "org") {
			requireRole(member.permissions, "savedViews.createOrg");
		} else {
			requireRole(member.permissions, "savedViews.createPersonal");
		}
		return createImpl(ctx, { ...args, userId });
	},
});

/** AI-callable internal twin. */
export const createForAI = internalMutation({
	args: {
		orgId: v.id("orgs"),
		userId: v.id("users"),
		name: v.string(),
		entityType: v.string(),
		scope: v.union(v.literal("user"), v.literal("org")),
		filters: v.string(),
		sortBy: v.optional(v.string()),
		sortOrder: v.optional(v.string()),
		columns: v.optional(v.array(v.string())),
		isPinned: v.optional(v.boolean()),
	},
	handler: async (ctx, args) => {
		const { member } = await requireOrgMemberByIds(ctx, args.orgId, args.userId);
		if (args.scope === "org") {
			requireRole(member.permissions, "savedViews.createOrg");
		} else {
			requireRole(member.permissions, "savedViews.createPersonal");
		}
		return createImpl(ctx, args);
	},
});

export const update = orgMutation({
	args: {
		orgId: v.id("orgs"),
		viewId: v.id("savedViews"),
		name: v.optional(v.string()),
		filters: v.optional(v.string()),
		sortBy: v.optional(v.string()),
		sortOrder: v.optional(v.string()),
		columns: v.optional(v.array(v.string())),
	},
	handler: async (ctx, args) => {
		const { member, userId } = await requireOrgMember(ctx, args.orgId);

		const view = await ctx.db.get(args.viewId);
		if (!view || view.orgId !== args.orgId) throw new ConvexError(ERRORS.NOT_FOUND);

		// Only creator can edit personal views; admin+ can edit org views
		if (view.scope === "user" && view.createdBy !== userId) {
			throw new ConvexError(ERRORS.FORBIDDEN);
		}
		if (view.scope === "org") {
			requireRole(member.permissions, "savedViews.createOrg");
		}

		if (args.filters) {
			try {
				JSON.parse(args.filters);
			} catch {
				throw new ConvexError({
					code: "INVALID_FILTERS",
					message: "filters must be valid JSON",
				});
			}
		}

		const { orgId: _o, viewId: _v, ...updates } = args;
		const patch = Object.fromEntries(
			Object.entries(updates).filter(([, v]) => v !== undefined),
		);
		await ctx.db.patch(args.viewId, { ...patch, updatedAt: Date.now() });
	},
});

async function togglePinImpl(
	ctx: MutationCtx,
	args: { orgId: Id<"orgs">; userId: Id<"users">; viewId: Id<"savedViews"> },
) {
	const view = await ctx.db.get(args.viewId);
	if (!view || view.orgId !== args.orgId) throw new ConvexError(ERRORS.NOT_FOUND);
	if (view.scope === "user" && view.createdBy !== args.userId) {
		throw new ConvexError(ERRORS.FORBIDDEN);
	}

	await ctx.db.patch(args.viewId, { isPinned: !view.isPinned, updatedAt: Date.now() });
}

export const togglePin = orgMutation({
	args: { orgId: v.id("orgs"), viewId: v.id("savedViews") },
	handler: async (ctx, args) => {
		const { userId } = await requireOrgMember(ctx, args.orgId);
		return togglePinImpl(ctx, { ...args, userId });
	},
});

/** AI-callable internal twin. */
export const togglePinForAI = internalMutation({
	args: { orgId: v.id("orgs"), userId: v.id("users"), viewId: v.id("savedViews") },
	handler: async (ctx, args) => {
		await requireOrgMemberByIds(ctx, args.orgId, args.userId);
		return togglePinImpl(ctx, args);
	},
});

async function removeImpl(
	ctx: MutationCtx,
	args: {
		orgId: Id<"orgs">;
		userId: Id<"users">;
		member: { permissions: string[] };
		viewId: Id<"savedViews">;
	},
) {
	const view = await ctx.db.get(args.viewId);
	if (!view || view.orgId !== args.orgId) throw new ConvexError(ERRORS.NOT_FOUND);

	if (view.scope === "user" && view.createdBy !== args.userId) {
		throw new ConvexError(ERRORS.FORBIDDEN);
	}
	if (view.scope === "org") {
		requireRole(args.member.permissions, "savedViews.delete");
	}

	await ctx.db.delete(args.viewId);
}

export const remove = orgMutation({
	args: { orgId: v.id("orgs"), viewId: v.id("savedViews") },
	handler: async (ctx, args) => {
		const { member, userId } = await requireOrgMember(ctx, args.orgId);
		return removeImpl(ctx, { ...args, userId, member });
	},
});

/** AI-callable internal twin. */
export const removeForAI = internalMutation({
	args: { orgId: v.id("orgs"), userId: v.id("users"), viewId: v.id("savedViews") },
	handler: async (ctx, args) => {
		const { member } = await requireOrgMemberByIds(ctx, args.orgId, args.userId);
		return removeImpl(ctx, { ...args, member });
	},
});
