/**
 * Pipelines Queries — convex/crm/fields/pipelines/queries.ts
 * STATUS: IMPLEMENTED
 */
import { v } from "convex/values";
import type { Id } from "../../../_generated/dataModel";
import { internalQuery, type QueryCtx } from "../../../_generated/server";
import {
	orgQuery,
	requireOrgMember,
	requireOrgMemberByIds,
} from "../../../_functions/authenticated";
import { requireRole } from "../../../_shared/permissions";

async function listByOrgImpl(ctx: QueryCtx, args: { orgId: Id<"orgs"> }) {
	return ctx.db
		.query("pipelines")
		.withIndex("by_org", (q) => q.eq("orgId", args.orgId))
		.collect();
}

export const listByOrg = orgQuery({
	args: { orgId: v.id("orgs") },
	handler: async (ctx, args) => {
		const { member } = await requireOrgMember(ctx, args.orgId);
		requireRole(member.permissions, "pipelines.view");
		return listByOrgImpl(ctx, args);
	},
});

/** AI-callable internal twin — see `convex/ai/tools/_shared.ts` for rationale. */
export const listByOrgForAI = internalQuery({
	args: { orgId: v.id("orgs"), userId: v.id("users") },
	handler: async (ctx, args) => {
		const { member } = await requireOrgMemberByIds(ctx, args.orgId, args.userId);
		requireRole(member.permissions, "pipelines.view");
		return listByOrgImpl(ctx, args);
	},
});

export const getDefault = orgQuery({
	args: { orgId: v.id("orgs"), entityType: v.string() },
	handler: async (ctx, args) => {
		const { member } = await requireOrgMember(ctx, args.orgId);
		requireRole(member.permissions, "pipelines.view");

		const pipelines = await ctx.db
			.query("pipelines")
			.withIndex("by_org_and_entity", (q) =>
				q.eq("orgId", args.orgId).eq("entityType", args.entityType),
			)
			.collect();

		// Prefer the explicitly-marked default. If none, fall back to the first
		// pipeline so new orgs can still create deals before they've set a
		// default in Settings → Modules → Deals → Pipelines.
		return pipelines.find((p) => p.isDefault === true) ?? pipelines[0] ?? null;
	},
});

export const getById = orgQuery({
	args: { orgId: v.id("orgs"), pipelineId: v.id("pipelines") },
	handler: async (ctx, args) => {
		const { member } = await requireOrgMember(ctx, args.orgId);
		requireRole(member.permissions, "pipelines.view");

		const pipeline = await ctx.db.get(args.pipelineId);
		if (!pipeline || pipeline.orgId !== args.orgId) return null;
		return pipeline;
	},
});
