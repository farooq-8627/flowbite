/**
 * Tags Queries — convex/crm/shared/tags/queries.ts
 */
import { v } from "convex/values";
import { orgQuery, requireOrgMember } from "../../../_functions/authenticated";

export const listByOrg = orgQuery({
	args: { orgId: v.id("orgs") },
	handler: async (ctx, args) => {
		await requireOrgMember(ctx, args.orgId);
		return ctx.db
			.query("tags")
			.withIndex("by_org", (q) => q.eq("orgId", args.orgId))
			.collect();
	},
});

export const getTagsForEntity = orgQuery({
	args: { orgId: v.id("orgs"), entityType: v.string(), entityId: v.string() },
	handler: async (ctx, args) => {
		await requireOrgMember(ctx, args.orgId);
		const entityTags = await ctx.db
			.query("entityTags")
			.withIndex("by_entity", (q) =>
				q.eq("orgId", args.orgId).eq("entityType", args.entityType).eq("entityId", args.entityId),
			)
			.collect();
		const tags = await Promise.all(entityTags.map((et) => ctx.db.get(et.tagId)));
		return tags.filter(Boolean);
	},
});
