/**
 * Pipelines Mutations — convex/crm/fields/pipelines/mutations.ts
 * STATUS: IMPLEMENTED
 */
import { ConvexError, v } from "convex/values";
import { orgMutation, requireOrgMember } from "../../../_functions/authenticated";
import { ERRORS } from "../../../_shared/errors";
import { requireRole } from "../../../_shared/permissions";
import { logActivity } from "../../../activityLogs/helpers";

const stageShape = v.object({
	id: v.string(),
	name: v.string(),
	order: v.number(),
	color: v.optional(v.string()),
	isFinal: v.optional(v.boolean()),
	finalType: v.optional(
		v.union(v.literal("positive"), v.literal("negative"), v.literal("neutral")),
	),
	staleAfterDays: v.optional(v.number()),
});

function nanoid12(): string {
	return Math.random().toString(36).slice(2, 14).padEnd(12, "0");
}

export const create = orgMutation({
	args: {
		orgId: v.id("orgs"),
		name: v.string(),
		entityType: v.string(),
		stages: v.optional(v.array(stageShape)),
		isDefault: v.optional(v.boolean()),
	},
	handler: async (ctx, args) => {
		const { member, userId } = await requireOrgMember(ctx, args.orgId);
		requireRole(member.permissions, "pipelines.manage");

		if (args.isDefault) {
			const existing = await ctx.db
				.query("pipelines")
				.withIndex("by_org_and_entity", (q) =>
					q.eq("orgId", args.orgId).eq("entityType", args.entityType),
				)
				.filter((q) => q.eq(q.field("isDefault"), true))
				.first();
			if (existing) {
				await ctx.db.patch(existing._id, { isDefault: false, updatedAt: Date.now() });
			}
		}

		const pipelineId = await ctx.db.insert("pipelines", {
			orgId: args.orgId,
			name: args.name,
			entityType: args.entityType,
			isDefault: args.isDefault ?? false,
			stages: args.stages ?? [],
			createdAt: Date.now(),
			updatedAt: Date.now(),
		});

		await logActivity(ctx, {
			orgId: args.orgId,
			userId,
			action: "pipeline_created",
			entityType: "pipeline",
			entityId: pipelineId,
			description: `Pipeline created: ${args.name}`,
		});

		return pipelineId;
	},
});

export const addStage = orgMutation({
	args: {
		orgId: v.id("orgs"),
		pipelineId: v.id("pipelines"),
		stage: v.object({
			name: v.string(),
			color: v.optional(v.string()),
			isFinal: v.optional(v.boolean()),
			finalType: v.optional(
				v.union(v.literal("positive"), v.literal("negative"), v.literal("neutral")),
			),
			staleAfterDays: v.optional(v.number()),
		}),
	},
	handler: async (ctx, args) => {
		const { member, userId } = await requireOrgMember(ctx, args.orgId);
		requireRole(member.permissions, "pipelines.manage");

		const pipeline = await ctx.db.get(args.pipelineId);
		if (!pipeline || pipeline.orgId !== args.orgId) throw new ConvexError(ERRORS.NOT_FOUND);

		const newStage = {
			id: `stage_${nanoid12()}`,
			name: args.stage.name,
			order: pipeline.stages.length,
			color: args.stage.color,
			isFinal: args.stage.isFinal,
			finalType: args.stage.finalType,
			staleAfterDays: args.stage.staleAfterDays,
		};

		await ctx.db.patch(args.pipelineId, {
			stages: [...pipeline.stages, newStage],
			updatedAt: Date.now(),
		});

		await logActivity(ctx, {
			orgId: args.orgId,
			userId,
			action: "stage_added",
			entityType: "pipeline",
			entityId: args.pipelineId,
			description: `Stage added: ${args.stage.name}`,
		});

		return newStage.id;
	},
});

export const updateStage = orgMutation({
	args: {
		orgId: v.id("orgs"),
		pipelineId: v.id("pipelines"),
		stageId: v.string(),
		name: v.optional(v.string()),
		color: v.optional(v.string()),
		staleAfterDays: v.optional(v.number()),
	},
	handler: async (ctx, args) => {
		const { member } = await requireOrgMember(ctx, args.orgId);
		requireRole(member.permissions, "pipelines.manage");

		const pipeline = await ctx.db.get(args.pipelineId);
		if (!pipeline || pipeline.orgId !== args.orgId) throw new ConvexError(ERRORS.NOT_FOUND);

		const stages = pipeline.stages.map((s) => {
			if (s.id !== args.stageId) return s;
			return {
				...s,
				name: args.name ?? s.name,
				color: args.color ?? s.color,
				staleAfterDays: args.staleAfterDays ?? s.staleAfterDays,
			};
		});

		await ctx.db.patch(args.pipelineId, { stages, updatedAt: Date.now() });
	},
});

export const removeStage = orgMutation({
	args: { orgId: v.id("orgs"), pipelineId: v.id("pipelines"), stageId: v.string() },
	handler: async (ctx, args) => {
		const { member } = await requireOrgMember(ctx, args.orgId);
		requireRole(member.permissions, "pipelines.manage");

		const pipeline = await ctx.db.get(args.pipelineId);
		if (!pipeline || pipeline.orgId !== args.orgId) throw new ConvexError(ERRORS.NOT_FOUND);

		const dealsInStage = await ctx.db
			.query("deals")
			.withIndex("by_org_and_stage", (q) =>
				q.eq("orgId", args.orgId).eq("currentStageId", args.stageId),
			)
			.first();
		if (dealsInStage)
			throw new ConvexError({
				code: "STAGE_HAS_DEALS",
				message: "Cannot remove stage with active deals",
			});

		const filtered = pipeline.stages
			.filter((s) => s.id !== args.stageId)
			.map((s, i) => ({ ...s, order: i }));

		await ctx.db.patch(args.pipelineId, { stages: filtered, updatedAt: Date.now() });
	},
});

export const reorderStages = orgMutation({
	args: { orgId: v.id("orgs"), pipelineId: v.id("pipelines"), stageIds: v.array(v.string()) },
	handler: async (ctx, args) => {
		const { member } = await requireOrgMember(ctx, args.orgId);
		requireRole(member.permissions, "pipelines.manage");

		const pipeline = await ctx.db.get(args.pipelineId);
		if (!pipeline || pipeline.orgId !== args.orgId) throw new ConvexError(ERRORS.NOT_FOUND);

		const stageMap = new Map(pipeline.stages.map((s) => [s.id, s]));
		const reordered = args.stageIds.map((id, i) => {
			const stage = stageMap.get(id);
			if (!stage)
				throw new ConvexError({ code: "INVALID_STAGE", message: `Stage ${id} not found` });
			return { ...stage, order: i };
		});

		await ctx.db.patch(args.pipelineId, { stages: reordered, updatedAt: Date.now() });
	},
});

export const deletePipeline = orgMutation({
	args: { orgId: v.id("orgs"), pipelineId: v.id("pipelines") },
	handler: async (ctx, args) => {
		const { member } = await requireOrgMember(ctx, args.orgId);
		requireRole(member.permissions, "pipelines.manage");

		const pipeline = await ctx.db.get(args.pipelineId);
		if (!pipeline || pipeline.orgId !== args.orgId) throw new ConvexError(ERRORS.NOT_FOUND);
		if (pipeline.isDefault)
			throw new ConvexError({
				code: "DEFAULT_PIPELINE",
				message: "Cannot delete the default pipeline",
			});

		for (const stage of pipeline.stages) {
			const deal = await ctx.db
				.query("deals")
				.withIndex("by_org_and_stage", (q) =>
					q.eq("orgId", args.orgId).eq("currentStageId", stage.id),
				)
				.first();
			if (deal)
				throw new ConvexError({
					code: "PIPELINE_HAS_DEALS",
					message: `Cannot delete — deals exist in stage "${stage.name}"`,
				});
		}

		await ctx.db.delete(args.pipelineId);
	},
});
