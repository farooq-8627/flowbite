/**
 * Tags Mutations — convex/crm/shared/tags/mutations.ts
 */
import { ConvexError, v } from "convex/values";
import { orgMutation, requireOrgMember } from "../../../_functions/authenticated";
import { ERRORS } from "../../../_shared/errors";
import { requireRole } from "../../../_shared/permissions";

export const create = orgMutation({
	args: {
		orgId: v.id("orgs"),
		name: v.string(),
		color: v.optional(v.string()),
	},
	handler: async (ctx, args) => {
		const { member } = await requireOrgMember(ctx, args.orgId);
		requireRole(member.permissions, "tags.manage");

		const existing = await ctx.db
			.query("tags")
			.withIndex("by_org_and_name", (q) => q.eq("orgId", args.orgId).eq("name", args.name))
			.first();
		if (existing) {
			throw new ConvexError({
				code: "DUPLICATE",
				message: "Tag with this name already exists",
			});
		}

		return ctx.db.insert("tags", {
			orgId: args.orgId,
			name: args.name,
			color: args.color ?? "#6366f1",
			createdAt: Date.now(),
		});
	},
});

export const remove = orgMutation({
	args: { orgId: v.id("orgs"), tagId: v.id("tags") },
	handler: async (ctx, args) => {
		const { member } = await requireOrgMember(ctx, args.orgId);
		requireRole(member.permissions, "tags.manage");

		const tag = await ctx.db.get(args.tagId);
		if (!tag || tag.orgId !== args.orgId) throw new ConvexError(ERRORS.NOT_FOUND);

		const entityTags = await ctx.db
			.query("entityTags")
			.withIndex("by_tag", (q) => q.eq("orgId", args.orgId).eq("tagId", args.tagId))
			.collect();
		await Promise.all(entityTags.map((et) => ctx.db.delete(et._id)));

		await ctx.db.delete(args.tagId);
	},
});

export const attachToEntity = orgMutation({
	args: {
		orgId: v.id("orgs"),
		tagId: v.id("tags"),
		entityType: v.string(),
		entityId: v.string(),
	},
	handler: async (ctx, args) => {
		const { member } = await requireOrgMember(ctx, args.orgId);
		requireRole(member.permissions, "tags.attach");

		const tag = await ctx.db.get(args.tagId);
		if (!tag || tag.orgId !== args.orgId) throw new ConvexError(ERRORS.NOT_FOUND);

		const existing = await ctx.db
			.query("entityTags")
			.withIndex("by_entity", (q) =>
				q
					.eq("orgId", args.orgId)
					.eq("entityType", args.entityType)
					.eq("entityId", args.entityId),
			)
			.filter((q) => q.eq(q.field("tagId"), args.tagId))
			.first();
		if (existing) return existing._id;

		return ctx.db.insert("entityTags", {
			orgId: args.orgId,
			tagId: args.tagId,
			entityType: args.entityType,
			entityId: args.entityId,
			createdAt: Date.now(),
		});
	},
});

export const detachFromEntity = orgMutation({
	args: {
		orgId: v.id("orgs"),
		tagId: v.id("tags"),
		entityType: v.string(),
		entityId: v.string(),
	},
	handler: async (ctx, args) => {
		const { member } = await requireOrgMember(ctx, args.orgId);
		requireRole(member.permissions, "tags.attach");

		const entityTag = await ctx.db
			.query("entityTags")
			.withIndex("by_entity", (q) =>
				q
					.eq("orgId", args.orgId)
					.eq("entityType", args.entityType)
					.eq("entityId", args.entityId),
			)
			.filter((q) => q.eq(q.field("tagId"), args.tagId))
			.first();
		if (!entityTag) return;

		await ctx.db.delete(entityTag._id);
	},
});

/**
 * Copy every tag attached to a source entity onto a target entity. Idempotent —
 * pre-existing links on the target are preserved (no duplicates).
 *
 * Used by lead → deal propagation in ConvertLeadDrawer (after the deal is
 * created), and is generically useful for any future entity-clone flow.
 */
export const copyEntityTags = orgMutation({
	args: {
		orgId: v.id("orgs"),
		fromEntityType: v.string(),
		fromEntityId: v.string(),
		toEntityType: v.string(),
		toEntityId: v.string(),
	},
	handler: async (ctx, args) => {
		const { member } = await requireOrgMember(ctx, args.orgId);
		requireRole(member.permissions, "tags.attach");

		const sourceLinks = await ctx.db
			.query("entityTags")
			.withIndex("by_entity", (q) =>
				q
					.eq("orgId", args.orgId)
					.eq("entityType", args.fromEntityType)
					.eq("entityId", args.fromEntityId),
			)
			.collect();
		if (sourceLinks.length === 0) return 0;

		const existingTargetLinks = await ctx.db
			.query("entityTags")
			.withIndex("by_entity", (q) =>
				q
					.eq("orgId", args.orgId)
					.eq("entityType", args.toEntityType)
					.eq("entityId", args.toEntityId),
			)
			.collect();
		const alreadyAttached = new Set(existingTargetLinks.map((l) => l.tagId as string));

		const now = Date.now();
		let inserted = 0;
		await Promise.all(
			sourceLinks
				.filter((link) => !alreadyAttached.has(link.tagId as string))
				.map((link) => {
					inserted += 1;
					return ctx.db.insert("entityTags", {
						orgId: args.orgId,
						tagId: link.tagId,
						entityType: args.toEntityType,
						entityId: args.toEntityId,
						createdAt: now,
					});
				}),
		);
		return inserted;
	},
});
