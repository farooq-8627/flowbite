/**
 * Saved Views Mutations — convex/crm/shared/savedViews/mutations.ts
 */
import { ConvexError, v } from "convex/values";
import { orgMutation, requireOrgMember } from "../../../_functions/authenticated";
import { ERRORS } from "../../../_shared/errors";
import { requireRole } from "../../../_shared/permissions";

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

		// Validate filters is valid JSON
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
			createdBy: userId,
			createdAt: now,
			updatedAt: now,
		});
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

export const togglePin = orgMutation({
	args: { orgId: v.id("orgs"), viewId: v.id("savedViews") },
	handler: async (ctx, args) => {
		const { userId } = await requireOrgMember(ctx, args.orgId);

		const view = await ctx.db.get(args.viewId);
		if (!view || view.orgId !== args.orgId) throw new ConvexError(ERRORS.NOT_FOUND);
		if (view.scope === "user" && view.createdBy !== userId) {
			throw new ConvexError(ERRORS.FORBIDDEN);
		}

		await ctx.db.patch(args.viewId, { isPinned: !view.isPinned, updatedAt: Date.now() });
	},
});

export const remove = orgMutation({
	args: { orgId: v.id("orgs"), viewId: v.id("savedViews") },
	handler: async (ctx, args) => {
		const { member, userId } = await requireOrgMember(ctx, args.orgId);

		const view = await ctx.db.get(args.viewId);
		if (!view || view.orgId !== args.orgId) throw new ConvexError(ERRORS.NOT_FOUND);

		if (view.scope === "user" && view.createdBy !== userId) {
			throw new ConvexError(ERRORS.FORBIDDEN);
		}
		if (view.scope === "org") {
			requireRole(member.permissions, "savedViews.delete");
		}

		await ctx.db.delete(args.viewId);
	},
});
