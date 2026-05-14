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
				q
					.eq("orgId", args.orgId)
					.eq("entityType", args.entityType)
					.eq("entityId", args.entityId),
			)
			.collect();
		const tags = await Promise.all(entityTags.map((et) => ctx.db.get(et.tagId)));
		return tags.filter(Boolean);
	},
});

/**
 * Batched tag lookup for many entities of the same type. Returns a map
 * keyed by entityId → tag documents. Cheaper than calling getTagsForEntity
 * per-row because it hits the `by_entity` index once per entityType per org
 * then fans out to a single ctx.db.get for each unique tag id.
 *
 * Used by table columns (render tag chips per row) + board group-by="tag"
 * (bucket rows into columns by tag name).
 */
export const listTagsForEntities = orgQuery({
	args: {
		orgId: v.id("orgs"),
		entityType: v.string(),
	},
	handler: async (ctx, args) => {
		await requireOrgMember(ctx, args.orgId);

		// Collect all entityTag rows for this org+entityType in one index read.
		// The composite index "by_entity" prefix-searches on orgId+entityType
		// when entityId isn't pinned, so we scan only the relevant slice.
		const links = await ctx.db
			.query("entityTags")
			.withIndex("by_entity", (q) =>
				q.eq("orgId", args.orgId).eq("entityType", args.entityType),
			)
			.collect();

		// Resolve unique tag ids to docs in one batch.
		const uniqueTagIds = Array.from(new Set(links.map((l) => l.tagId as string)));
		const tagDocs = await Promise.all(
			uniqueTagIds.map((tid) => ctx.db.get(tid as (typeof links)[number]["tagId"])),
		);
		const tagById = new Map<string, NonNullable<(typeof tagDocs)[number]>>();
		for (const t of tagDocs) if (t) tagById.set(t._id as string, t);

		// Bucket links by entityId → tag[] for O(1) row lookup on the client.
		const byEntity: Record<string, Array<NonNullable<(typeof tagDocs)[number]>>> = {};
		for (const link of links) {
			const tag = tagById.get(link.tagId as string);
			if (!tag) continue;
			const key = link.entityId;
			if (!byEntity[key]) byEntity[key] = [];
			byEntity[key].push(tag);
		}
		return byEntity;
	},
});
