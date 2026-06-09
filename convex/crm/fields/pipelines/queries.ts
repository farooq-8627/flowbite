/**
 * Pipelines Queries — convex/crm/fields/pipelines/queries.ts
 * STATUS: IMPLEMENTED
 */
import { v } from "convex/values";
import {
	orgQuery,
	requireOrgMember,
	requireOrgMemberByIds,
} from "../../../_functions/authenticated";
import type { Id } from "../../../_generated/dataModel";
import { internalQuery, type QueryCtx } from "../../../_generated/server";
import { requireRole } from "../../../_shared/permissions";

async function listByOrgImpl(ctx: QueryCtx, args: { orgId: Id<"orgs"> }) {
	const all = await ctx.db
		.query("pipelines")
		.withIndex("by_org", (q) => q.eq("orgId", args.orgId))
		.collect();
	// Soft-deleted pipelines (deletedAt set) are recoverable from trash;
	// they must NOT appear in any "live" listing — board picker, settings
	// editor, AI describe_workspace, etc.
	return all.filter((p) => p.deletedAt === undefined);
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

		// Skip soft-deleted pipelines — a default that's been trashed
		// must NOT keep claiming the slot. Prefer the explicit live
		// default; otherwise fall back to the first live pipeline so
		// new orgs can still create deals before they've set a default.
		const live = pipelines.filter((p) => p.deletedAt === undefined);
		return live.find((p) => p.isDefault === true) ?? live[0] ?? null;
	},
});

export const getById = orgQuery({
	args: { orgId: v.id("orgs"), pipelineId: v.id("pipelines") },
	handler: async (ctx, args) => {
		const { member } = await requireOrgMember(ctx, args.orgId);
		requireRole(member.permissions, "pipelines.view");

		const pipeline = await ctx.db.get(args.pipelineId);
		if (!pipeline || pipeline.orgId !== args.orgId) return null;
		// Soft-deleted pipelines are not visible in normal flows; the
		// trash UI reads via its own dedicated query.
		if (pipeline.deletedAt !== undefined) return null;
		return pipeline;
	},
});

/**
 * Map of pipelineId → number of deals (incl. soft-deleted) currently
 * referencing that pipeline. Drives the Settings → Pipelines delete
 * affordance: the editor only enables Delete when count = 0.
 *
 * Counts soft-deleted rows because restoring a soft-deleted deal whose
 * pipeline was hard-deleted would orphan the row (its `pipelineId`
 * points at a non-existent pipeline). Better to make the owner empty
 * the trash first.
 *
 * Bounded by `take(500)` per pipeline — a workspace with 500+ deals in
 * a single pipeline reads as "lots, definitely not deletable" and the
 * UI shows "500+" instead of an exact number.
 */
export const countByPipelines = orgQuery({
	args: { orgId: v.id("orgs") },
	handler: async (ctx, args) => {
		const { member } = await requireOrgMember(ctx, args.orgId);
		requireRole(member.permissions, "pipelines.view");

		const pipelines = await ctx.db
			.query("pipelines")
			.withIndex("by_org_and_entity", (q) =>
				q.eq("orgId", args.orgId).eq("entityType", "deal"),
			)
			.collect();
		// Soft-deleted pipelines aren't shown in the editor; skip the
		// per-pipeline deal-count read for them.
		const live = pipelines.filter((p) => p.deletedAt === undefined);

		const counts: Record<string, number> = {};
		for (const p of live) {
			const deals = await ctx.db
				.query("deals")
				.withIndex("by_org_and_pipeline", (q) =>
					q.eq("orgId", args.orgId).eq("pipelineId", p._id),
				)
				.take(500);
			counts[p._id] = deals.length;
		}
		return counts;
	},
});
