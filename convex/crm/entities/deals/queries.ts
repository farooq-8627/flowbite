/**
 * Deals Queries — convex/crm/entities/deals/queries.ts
 * STATUS: IMPLEMENTED
 */
import { v } from "convex/values";
import { orgQuery, requireOrgMember } from "../../../_functions/authenticated";
import { requireRole } from "../../../_shared/permissions";

export const list = orgQuery({
	args: {
		orgId: v.id("orgs"),
		pipelineId: v.optional(v.id("pipelines")),
		assignedTo: v.optional(v.id("users")),
		limit: v.optional(v.number()),
	},
	handler: async (ctx, args) => {
		const { member } = await requireOrgMember(ctx, args.orgId);
		requireRole(member.permissions, "deals.view");

		const cap = args.limit ?? 200;

		// Init with the broad index so `q`'s type is inferred, then narrow.
		let q = ctx.db.query("deals").withIndex("by_org", (qi) => qi.eq("orgId", args.orgId));
		if (args.pipelineId) {
			q = ctx.db
				.query("deals")
				.withIndex("by_org_and_pipeline", (qi) =>
					qi.eq("orgId", args.orgId).eq("pipelineId", args.pipelineId!),
				);
		} else if (args.assignedTo) {
			q = ctx.db
				.query("deals")
				.withIndex("by_org_and_assignee", (qi) =>
					qi.eq("orgId", args.orgId).eq("assignedTo", args.assignedTo!),
				);
		}

		const results = await q.take(cap * 2);

		return results
			.filter((d) => d.deletedAt === undefined)
			.filter((d) => !args.assignedTo || d.assignedTo === args.assignedTo)
			.slice(0, cap);
	},
});

/** Returns deals grouped by stageId with isStale + daysInStage annotated. */
export const listGroupedByStage = orgQuery({
	args: { orgId: v.id("orgs"), pipelineId: v.id("pipelines") },
	handler: async (ctx, args) => {
		const { member } = await requireOrgMember(ctx, args.orgId);
		requireRole(member.permissions, "deals.view");

		const [pipeline, deals] = await Promise.all([
			ctx.db.get(args.pipelineId),
			ctx.db
				.query("deals")
				.withIndex("by_org_and_pipeline", (q) =>
					q.eq("orgId", args.orgId).eq("pipelineId", args.pipelineId),
				)
				.take(500),
		]);

		if (!pipeline || pipeline.orgId !== args.orgId) return {};

		const stageMap = new Map(pipeline.stages.map((s) => [s.id, s]));
		const now = Date.now();
		const grouped: Record<
			string,
			Array<(typeof deals)[0] & { daysInStage: number; isStale: boolean }>
		> = {};

		for (const stage of pipeline.stages) {
			grouped[stage.id] = [];
		}

		for (const deal of deals) {
			if (deal.deletedAt !== undefined) continue;
			const stage = stageMap.get(deal.currentStageId);
			const daysInStage = (now - deal.stageEnteredAt) / 86_400_000;
			const isStale =
				stage?.staleAfterDays !== undefined && daysInStage > stage.staleAfterDays;
			if (grouped[deal.currentStageId]) {
				grouped[deal.currentStageId].push({ ...deal, daysInStage, isStale });
			}
		}

		return grouped;
	},
});

export const getById = orgQuery({
	args: { orgId: v.id("orgs"), dealId: v.id("deals") },
	handler: async (ctx, args) => {
		const { member } = await requireOrgMember(ctx, args.orgId);
		requireRole(member.permissions, "deals.view");

		const deal = await ctx.db.get(args.dealId);
		if (!deal || deal.orgId !== args.orgId || deal.deletedAt !== undefined) return null;
		return deal;
	},
});

export const getByDealCode = orgQuery({
	args: { orgId: v.id("orgs"), dealCode: v.string() },
	handler: async (ctx, args) => {
		const { member } = await requireOrgMember(ctx, args.orgId);
		requireRole(member.permissions, "deals.view");

		return ctx.db
			.query("deals")
			.withIndex("by_org_and_dealCode", (q) =>
				q.eq("orgId", args.orgId).eq("dealCode", args.dealCode),
			)
			.first();
	},
});

/**
 * listByPersonCode — every deal linked to one person.
 *
 * Used by `OverviewCard` to surface the latest deals on a profile or
 * hover quick-view. Scopes via the `by_org_and_personCode` index so the
 * query is O(log n) regardless of org size, and filters out soft-deleted
 * rows on the way out. Capped at `limit` (default 5) — the card never
 * needs more than a handful.
 */
export const listByPersonCode = orgQuery({
	args: {
		orgId: v.id("orgs"),
		personCode: v.string(),
		limit: v.optional(v.number()),
	},
	handler: async (ctx, args) => {
		const { member } = await requireOrgMember(ctx, args.orgId);
		requireRole(member.permissions, "deals.view");

		const cap = args.limit ?? 5;
		const rows = await ctx.db
			.query("deals")
			.withIndex("by_org_and_personCode", (q) =>
				q.eq("orgId", args.orgId).eq("personCode", args.personCode),
			)
			.take(cap * 2);
		return rows
			.filter((d) => d.deletedAt === undefined)
			.sort((a, b) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0))
			.slice(0, cap);
	},
});
