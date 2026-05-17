/**
 * Deals Mutations — convex/crm/entities/deals/mutations.ts
 * STATUS: IMPLEMENTED
 *
 * dealCode auto-generated (D-001). Stage moves via moveToStage only.
 * closeAsDone is the only way to set wonAt/lostAt. closeAsDone fires the
 * `deal_won` notification preference for the assignee on positive close.
 */
import { ConvexError, v } from "convex/values";
import { orgMutation, requireOrgMember } from "../../../_functions/authenticated";
import { internal } from "../../../_generated/api";
import { ERRORS } from "../../../_shared/errors";
import { applyOrgStat } from "../../../_shared/orgStats";
import { requireRole } from "../../../_shared/permissions";
import { enforceRateLimit, RATE_LIMITS } from "../../../_shared/rateLimit";
import { generateEntityCode } from "../../../_shared/recordCodes";
import { logActivity } from "../../../activityLogs/helpers";
import { sendNotification } from "../../../notifications/helpers";

export const create = orgMutation({
	args: {
		orgId: v.id("orgs"),
		title: v.string(),
		pipelineId: v.id("pipelines"),
		currentStageId: v.string(),
		contactId: v.optional(v.id("contacts")),
		companyId: v.optional(v.id("companies")),
		personCode: v.optional(v.string()),
		companyCode: v.optional(v.string()),
		value: v.optional(v.number()),
		currency: v.optional(v.string()),
		assignedTo: v.optional(v.id("users")),
		source: v.string(),
		expectedCloseDate: v.optional(v.number()),
	},
	handler: async (ctx, args) => {
		const { member, userId } = await requireOrgMember(ctx, args.orgId);
		requireRole(member.permissions, "deals.create");
		await enforceRateLimit(ctx, {
			scope: "deals.create",
			key: `${userId}:${args.orgId}`,
			...RATE_LIMITS.write,
		});

		// Validate pipeline belongs to org
		const pipeline = await ctx.db.get(args.pipelineId);
		if (!pipeline || pipeline.orgId !== args.orgId) throw new ConvexError(ERRORS.NOT_FOUND);

		// Validate stage exists in pipeline
		const stageExists = pipeline.stages.some((s) => s.id === args.currentStageId);
		if (!stageExists)
			throw new ConvexError({
				code: "INVALID_STAGE",
				message: "Stage not found in pipeline",
			});

		const dealCode = await generateEntityCode(ctx, args.orgId, "deal");
		const now = Date.now();

		const dealId = await ctx.db.insert("deals", {
			orgId: args.orgId,
			dealCode,
			title: args.title,
			pipelineId: args.pipelineId,
			currentStageId: args.currentStageId,
			stageEnteredAt: now,
			contactId: args.contactId,
			companyId: args.companyId,
			personCode: args.personCode,
			companyCode: args.companyCode,
			value: args.value,
			currency: args.currency,
			assignedTo: args.assignedTo,
			source: args.source,
			expectedCloseDate: args.expectedCloseDate,
			createdAt: now,
			updatedAt: now,
		});

		await logActivity(ctx, {
			orgId: args.orgId,
			userId,
			action: "created",
			entityType: "deal",
			entityId: dealId,
			personCode: args.personCode,
			description: `Deal created: ${args.title}`,
		});

		// Counter increments — open deal + pipeline value.
		await applyOrgStat(ctx, args.orgId, "deals.open", +1);
		if (args.value && args.value > 0) {
			await applyOrgStat(ctx, args.orgId, "deals.pipelineValue", +args.value);
		}

		if (args.assignedTo && args.assignedTo !== userId) {
			await sendNotification(ctx, {
				orgId: args.orgId,
				userId: args.assignedTo,
				type: "deal.assigned",
				title: `Deal assigned to you: ${args.title}`,
				entityType: "deal",
				entityId: dealId,
			});
		}

		await ctx.scheduler.runAfter(0, internal.ai.internal.rebuildEntityContext, {
			orgId: args.orgId,
			entityType: "deal",
			entityId: dealId,
			personCode: args.personCode,
		});

		return { dealId, dealCode };
	},
});

export const update = orgMutation({
	args: {
		orgId: v.id("orgs"),
		dealId: v.id("deals"),
		title: v.optional(v.string()),
		value: v.optional(v.number()),
		currency: v.optional(v.string()),
		assignedTo: v.optional(v.id("users")),
		expectedCloseDate: v.optional(v.number()),
		/** Optional kanban position. See `leads.update.sortOrder`. */
		sortOrder: v.optional(v.number()),
	},
	handler: async (ctx, args) => {
		const { member, userId } = await requireOrgMember(ctx, args.orgId);
		requireRole(member.permissions, "deals.update");

		const deal = await ctx.db.get(args.dealId);
		if (!deal || deal.orgId !== args.orgId || deal.deletedAt !== undefined) {
			throw new ConvexError(ERRORS.NOT_FOUND);
		}

		const { orgId: _o, dealId: _d, ...updates } = args;
		const patch = Object.fromEntries(
			Object.entries(updates).filter(([, val]) => val !== undefined),
		);

		// Pipeline-value drift: if `value` is being changed, rebalance the counter.
		if (args.value !== undefined && args.value !== (deal.value ?? 0)) {
			const delta = (args.value ?? 0) - (deal.value ?? 0);
			if (!deal.wonAt && !deal.lostAt) {
				await applyOrgStat(ctx, args.orgId, "deals.pipelineValue", delta);
			}
		}

		await ctx.db.patch(args.dealId, { ...patch, updatedAt: Date.now() });

		await logActivity(ctx, {
			orgId: args.orgId,
			userId,
			action: "updated",
			entityType: "deal",
			entityId: args.dealId,
			personCode: deal.personCode,
			description: `Deal updated: ${deal.title}`,
		});
	},
});

export const moveToStage = orgMutation({
	args: {
		orgId: v.id("orgs"),
		dealId: v.id("deals"),
		stageId: v.string(),
		/**
		 * Optional kanban position within the destination stage. The deals
		 * board's drag handler computes the midpoint between the two
		 * neighbours and passes it here so the drop is atomic with the stage
		 * change.
		 */
		sortOrder: v.optional(v.number()),
	},
	handler: async (ctx, args) => {
		const { member, userId } = await requireOrgMember(ctx, args.orgId);
		requireRole(member.permissions, "deals.changeStage");

		const deal = await ctx.db.get(args.dealId);
		if (!deal || deal.orgId !== args.orgId || deal.deletedAt !== undefined) {
			throw new ConvexError(ERRORS.NOT_FOUND);
		}

		const pipeline = await ctx.db.get(deal.pipelineId);
		if (!pipeline) throw new ConvexError(ERRORS.NOT_FOUND);

		const toStage = pipeline.stages.find((s) => s.id === args.stageId);
		if (!toStage)
			throw new ConvexError({
				code: "INVALID_STAGE",
				message: "Stage not found in pipeline",
			});

		const fromStage = pipeline.stages.find((s) => s.id === deal.currentStageId);
		if (fromStage?.isFinal && toStage.isFinal) {
			throw new ConvexError({
				code: "INVALID_TRANSITION",
				message: "Cannot move between final stages",
			});
		}

		const now = Date.now();
		const patch: Record<string, unknown> = {
			currentStageId: args.stageId,
			stageEnteredAt: now,
			updatedAt: now,
		};
		if (args.sortOrder !== undefined) patch.sortOrder = args.sortOrder;
		await ctx.db.patch(args.dealId, patch);

		await logActivity(ctx, {
			orgId: args.orgId,
			userId,
			action: "stage_changed",
			entityType: "deal",
			entityId: args.dealId,
			personCode: deal.personCode,
			description: `Deal moved to stage: ${toStage.name}`,
			metadata: { fromStageId: deal.currentStageId, toStageId: args.stageId },
		});

		if (deal.assignedTo && deal.assignedTo !== userId) {
			await sendNotification(ctx, {
				orgId: args.orgId,
				userId: deal.assignedTo,
				type: "deal.stage_changed",
				title: `Deal moved to ${toStage.name}: ${deal.title}`,
				entityType: "deal",
				entityId: args.dealId,
			});
		}
	},
});

export const closeAsDone = orgMutation({
	args: {
		orgId: v.id("orgs"),
		dealId: v.id("deals"),
		finalType: v.union(v.literal("positive"), v.literal("negative"), v.literal("neutral")),
		outcomeReason: v.optional(v.string()),
	},
	handler: async (ctx, args) => {
		const { member, userId } = await requireOrgMember(ctx, args.orgId);
		requireRole(member.permissions, "deals.close");

		const deal = await ctx.db.get(args.dealId);
		if (!deal || deal.orgId !== args.orgId || deal.deletedAt !== undefined) {
			throw new ConvexError(ERRORS.NOT_FOUND);
		}

		const pipeline = await ctx.db.get(deal.pipelineId);
		const finalStage = pipeline?.stages.find(
			(s) => s.isFinal && s.finalType === args.finalType,
		);

		const now = Date.now();
		const patch: Record<string, unknown> = {
			outcomeReason: args.outcomeReason,
			updatedAt: now,
		};

		if (finalStage) {
			patch.currentStageId = finalStage.id;
			patch.stageEnteredAt = now;
		}

		if (args.finalType === "positive") {
			patch.wonAt = now;
		} else if (args.finalType === "negative") {
			patch.lostAt = now;
		}

		await ctx.db.patch(args.dealId, patch);

		// Counter rebalance: leaving the open pool. Pipeline-value drops by
		// the deal's current value.
		await applyOrgStat(ctx, args.orgId, "deals.open", -1);
		if (deal.value && deal.value > 0) {
			await applyOrgStat(ctx, args.orgId, "deals.pipelineValue", -deal.value);
		}
		if (args.finalType === "positive") {
			await applyOrgStat(ctx, args.orgId, "deals.won", +1);
		} else if (args.finalType === "negative") {
			await applyOrgStat(ctx, args.orgId, "deals.lost", +1);
		}

		await logActivity(ctx, {
			orgId: args.orgId,
			userId,
			action: args.finalType === "positive" ? "won" : "lost",
			entityType: "deal",
			entityId: args.dealId,
			personCode: deal.personCode,
			description: `Deal ${args.finalType === "positive" ? "won" : "lost"}: ${deal.title}`,
		});

		// Notify the assignee on win/loss (matches the user's `deal_won` /
		// `deal_stage_changed` notification preferences). Skip if the actor
		// is the assignee themselves.
		if (deal.assignedTo && deal.assignedTo !== userId) {
			const isWon = args.finalType === "positive";
			await sendNotification(ctx, {
				orgId: args.orgId,
				userId: deal.assignedTo,
				type: isWon ? "deal.won" : "deal.lost",
				title: isWon ? `Deal won: ${deal.title}` : `Deal closed lost: ${deal.title}`,
				body: args.outcomeReason ? args.outcomeReason : undefined,
				entityType: "deal",
				entityId: args.dealId,
				metadata: {
					dealCode: deal.dealCode,
					value: deal.value ?? 0,
					currency: deal.currency ?? "",
				},
			});
		}
	},
});

export const softDelete = orgMutation({
	args: { orgId: v.id("orgs"), dealId: v.id("deals") },
	handler: async (ctx, args) => {
		const { member, userId } = await requireOrgMember(ctx, args.orgId);
		requireRole(member.permissions, "deals.delete");

		const deal = await ctx.db.get(args.dealId);
		if (!deal || deal.orgId !== args.orgId) throw new ConvexError(ERRORS.NOT_FOUND);

		await ctx.db.patch(args.dealId, { deletedAt: Date.now(), updatedAt: Date.now() });

		// Counter rebalance: only decrement if the deal was open before deletion.
		if (!deal.wonAt && !deal.lostAt && !deal.deletedAt) {
			await applyOrgStat(ctx, args.orgId, "deals.open", -1);
			if (deal.value && deal.value > 0) {
				await applyOrgStat(ctx, args.orgId, "deals.pipelineValue", -deal.value);
			}
		}

		await logActivity(ctx, {
			orgId: args.orgId,
			userId,
			action: "deleted",
			entityType: "deal",
			entityId: args.dealId,
			personCode: deal.personCode,
			description: `Deal deleted: ${deal.title}`,
		});
	},
});
