/**
 * Pipelines Queries — convex/crm/fields/pipelines/queries.ts
 * STATUS: IMPLEMENTED
 */
import { v } from "convex/values";
import { orgQuery, requireOrgMember } from "../../../_functions/authenticated";
import { requireRole } from "../../../_shared/permissions";

export const listByOrg = orgQuery({
	args: { orgId: v.id("orgs") },
	handler: async (ctx, args) => {
		const { member } = await requireOrgMember(ctx, args.orgId);
		requireRole(member.role ?? "viewer", "pipelines.view");

		return ctx.db
			.query("pipelines")
			.withIndex("by_org", (q) => q.eq("orgId", args.orgId))
			.collect();
	},
});

export const getDefault = orgQuery({
	args: { orgId: v.id("orgs"), entityType: v.string() },
	handler: async (ctx, args) => {
		const { member } = await requireOrgMember(ctx, args.orgId);
		requireRole(member.role ?? "viewer", "pipelines.view");

		return ctx.db
			.query("pipelines")
			.withIndex("by_org_and_entity", (q) =>
				q.eq("orgId", args.orgId).eq("entityType", args.entityType),
			)
			.filter((q) => q.eq(q.field("isDefault"), true))
			.first();
	},
});

export const getById = orgQuery({
	args: { orgId: v.id("orgs"), pipelineId: v.id("pipelines") },
	handler: async (ctx, args) => {
		const { member } = await requireOrgMember(ctx, args.orgId);
		requireRole(member.role ?? "viewer", "pipelines.view");

		const pipeline = await ctx.db.get(args.pipelineId);
		if (!pipeline || pipeline.orgId !== args.orgId) return null;
		return pipeline;
	},
});
