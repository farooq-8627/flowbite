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
import { logFieldUpdates } from "../../../_shared/fieldUpdateLog";
import { applyOrgStat } from "../../../_shared/orgStats";
import { requireRole } from "../../../_shared/permissions";
import { enforceRateLimit, RATE_LIMITS } from "../../../_shared/rateLimit";
import { generateEntityCode } from "../../../_shared/recordCodes";
import { logActivity } from "../../../activityLogs/helpers";
import { sendNotification } from "../../../notifications/helpers";
import { getRequiredFieldsForStage, pickMissingFields } from "../../fields/pipelines/helpers";

export const create = orgMutation({
	args: {
		orgId: v.id("orgs"),
		title: v.string(),
		pipelineId: v.id("pipelines"),
		/**
		 * Optional — if omitted, the deal lands in the pipeline's auto-
		 * created Default stage (`isDefaultStage: true`). Callers SHOULD
		 * omit this for the AddDealDrawer flow; the only legitimate
		 * caller passing an explicit stage is the legacy lead-conversion
		 * path which still picks the first non-final stage.
		 */
		currentStageId: v.optional(v.string()),
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

		// Resolve the destination stage:
		//   1. If caller passed `currentStageId` and it exists in the pipeline → use it.
		//   2. Otherwise pick the Default stage (`isDefaultStage === true`).
		//   3. Final fallback (pre-migration data without isDefaultStage) →
		//      first non-final stage by order; first stage if all are final.
		let resolvedStageId: string | undefined;
		if (args.currentStageId) {
			const exists = pipeline.stages.some((s) => s.id === args.currentStageId);
			if (!exists) {
				throw new ConvexError({
					code: "INVALID_STAGE",
					message: "Stage not found in pipeline",
				});
			}
			resolvedStageId = args.currentStageId;
		} else {
			const defaultStage = pipeline.stages.find((s) => s.isDefaultStage === true);
			if (defaultStage) {
				resolvedStageId = defaultStage.id;
			} else {
				const sorted = [...pipeline.stages].sort((a, b) => a.order - b.order);
				resolvedStageId = (sorted.find((s) => !s.isFinal) ?? sorted[0])?.id;
			}
		}
		if (!resolvedStageId) {
			throw new ConvexError({
				code: "EMPTY_PIPELINE",
				message: "Pipeline has no stages — add stages before creating deals.",
			});
		}

		const dealCode = await generateEntityCode(ctx, args.orgId, "deal");
		const now = Date.now();

		const dealId = await ctx.db.insert("deals", {
			orgId: args.orgId,
			dealCode,
			title: args.title,
			pipelineId: args.pipelineId,
			currentStageId: resolvedStageId,
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

		// Drag-rate guard. Same shared 120/min budget as the other drag
		// mutations. The deals kanban can fire `update` (assignee/value
		// in-column) and `moveToStage` (cross-column) — both gated.
		await enforceRateLimit(ctx, {
			scope: "deals.update",
			key: `${userId}:${args.orgId}`,
			max: 120,
			periodMs: 60_000,
			orgId: args.orgId,
		});

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

		await logFieldUpdates(ctx, {
			orgId: args.orgId,
			userId,
			entityType: "deal",
			entityId: args.dealId,
			personCode: deal.personCode,
			displayName: deal.title,
			before: deal as unknown as Record<string, unknown>,
			after: { ...deal, ...patch } as unknown as Record<string, unknown>,
			fields: ["title", "value", "currency", "assignedTo", "expectedCloseDate"],
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

		// Drag-rate guard. Cross-stage moves on the kanban are the most
		// likely target for runaway drag loops — same scope-shared budget
		// as `deals.update` so a user can't bypass by alternating.
		await enforceRateLimit(ctx, {
			scope: "deals.update",
			key: `${userId}:${args.orgId}`,
			max: 120,
			periodMs: 60_000,
			orgId: args.orgId,
		});

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

		// ── Skip-stage policy ───────────────────────────────────────────
		// When `stageTransitionPolicy === "block"` AND `allowSkipStages` is
		// false (the default), deals can advance ONLY one stage forward at
		// a time. Backwards moves and lateral moves to final stages are
		// always allowed (mark-as-lost / mark-as-done shouldn't be blocked
		// by skip rules).
		const policy = pipeline.stageTransitionPolicy ?? "warn";
		const allowSkip = pipeline.allowSkipStages === true;
		if (policy === "block" && !allowSkip && !toStage.isFinal) {
			const sorted = [...pipeline.stages].sort((a, b) => a.order - b.order);
			const fromIdx = sorted.findIndex((s) => s.id === deal.currentStageId);
			const toIdx = sorted.findIndex((s) => s.id === args.stageId);
			if (fromIdx >= 0 && toIdx > fromIdx + 1) {
				throw new ConvexError({
					code: "STAGE_SKIP_NOT_ALLOWED",
					message: `Move one stage at a time — go through "${
						sorted[fromIdx + 1]?.name ?? "the next stage"
					}" first, or enable "Allow skipping stages" on the pipeline.`,
					nextStageId: sorted[fromIdx + 1]?.id,
					nextStageName: sorted[fromIdx + 1]?.name,
				});
			}
		}

		// ── Stage-aware required-field policy ───────────────────────────
		// Per-pipeline owner setting. Skip the check when the destination
		// is a final stage AND the source is non-final — closing a deal is
		// already gated by closeAsDone / outcome-reason flow, so blocking
		// it here would double-gate. (We still warn on final-stage moves.)
		let missingFields: ReturnType<typeof pickMissingFields> = [];
		if (policy !== "off") {
			const required = await getRequiredFieldsForStage(ctx, {
				orgId: args.orgId,
				entityType: "deal",
				stageId: args.stageId,
			});
			if (required.length > 0) {
				const fieldValueRows = await ctx.db
					.query("fieldValues")
					.withIndex("by_entity", (q) =>
						q
							.eq("orgId", args.orgId)
							.eq("entityType", "deal")
							.eq("entityId", args.dealId),
					)
					.collect();
				const valuesByName: Record<string, unknown> = {};
				for (const v of fieldValueRows) valuesByName[v.fieldName] = v.value;

				missingFields = pickMissingFields({
					deal: deal as unknown as Record<string, unknown>,
					fieldValuesByName: valuesByName,
					requiredFields: required,
				});
			}

			if (policy === "block" && missingFields.length > 0) {
				throw new ConvexError({
					code: "MISSING_REQUIRED_FIELDS",
					message: `Cannot move to ${toStage.name} — ${missingFields.length} required field(s) missing`,
					missingFields: missingFields.map((f) => ({
						_id: f._id,
						name: f.name,
						label: f.label,
						type: f.type,
					})),
					stageId: args.stageId,
					stageName: toStage.name,
				});
			}
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
			action:
				policy === "warn" && missingFields.length > 0
					? "stage_changed_with_missing_fields"
					: "stage_changed",
			entityType: "deal",
			entityId: args.dealId,
			personCode: deal.personCode,
			description:
				policy === "warn" && missingFields.length > 0
					? `Deal moved to stage "${toStage.name}" with ${missingFields.length} required field(s) missing`
					: `Deal moved to stage: ${toStage.name}`,
			metadata: {
				fromStageId: deal.currentStageId,
				toStageId: args.stageId,
				toCode: toStage.code,
				pipelineId: deal.pipelineId,
				...(fromStage?.code !== undefined ? { fromCode: fromStage.code } : {}),
				...(missingFields.length > 0
					? {
							missingFieldNames: missingFields.map((f) => f.name).join(","),
							missingFieldsCount: missingFields.length,
							stageTransitionPolicy: policy,
						}
					: {}),
			},
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

		// ── Mark-as-done all-fields gate ───────────────────────────────
		// When `markDoneRequiresAllFields` is true (default), closing a
		// deal as won / neutral demands EVERY required field across every
		// non-final stage be filled. Mark-as-lost (`finalType === "negative"`)
		// is unaffected — owners need to be able to close out dead deals
		// regardless of completeness, that's the whole point of `markAsLost`.
		if (
			pipeline &&
			args.finalType !== "negative" &&
			pipeline.markDoneRequiresAllFields !== false
		) {
			// Default true when undefined.
			const fieldValueRows = await ctx.db
				.query("fieldValues")
				.withIndex("by_entity", (q) =>
					q.eq("orgId", args.orgId).eq("entityType", "deal").eq("entityId", args.dealId),
				)
				.collect();
			const valuesByName: Record<string, unknown> = {};
			for (const fv of fieldValueRows) valuesByName[fv.fieldName] = fv.value;

			const missingAcrossStages: Array<{ name: string; label: string; stageName: string }> =
				[];
			for (const stage of pipeline.stages) {
				if (stage.isFinal) continue;
				const required = await getRequiredFieldsForStage(ctx, {
					orgId: args.orgId,
					entityType: "deal",
					stageId: stage.id,
				});
				const missing = pickMissingFields({
					deal: deal as unknown as Record<string, unknown>,
					fieldValuesByName: valuesByName,
					requiredFields: required,
				});
				for (const m of missing) {
					if (missingAcrossStages.some((x) => x.name === m.name)) continue;
					missingAcrossStages.push({
						name: m.name,
						label: m.label,
						stageName: stage.name,
					});
				}
			}
			if (missingAcrossStages.length > 0) {
				throw new ConvexError({
					code: "MISSING_REQUIRED_FIELDS_FOR_DONE",
					message: `Cannot mark as done — ${missingAcrossStages.length} required field(s) still missing across the pipeline. Disable "Require all fields before mark as done" on the pipeline if this isn't needed.`,
					missingFields: missingAcrossStages,
				});
			}
		}

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

/**
 * changePipeline — move an existing deal to a different pipeline.
 *
 * Invariants:
 *   - Both pipelines belong to the same org.
 *   - Both pipelines have entityType="deal".
 *   - Closed deals (wonAt or lostAt set) cannot change pipeline. Reopen first.
 *   - currentStageId resets to the new pipeline's first non-final stage by order.
 *   - stageEnteredAt resets to now (deal restarts staleness clock).
 *   - Old activity-log entries (referencing the OLD currentStageId) stay
 *     intact — they're an audit trail and shouldn't be rewritten.
 *
 * RBAC:    deals.changePipeline (Owner / Admin only — see permissions/catalog.ts)
 * Limit:   shared `deals.update` 120/min scope (drag-rate parity)
 * Notify:  the assignee, if any, via deal_pipeline_changed pref.
 * AI:      schedules rebuildEntityContext like every other deal mutation.
 */
export const changePipeline = orgMutation({
	args: {
		orgId: v.id("orgs"),
		dealId: v.id("deals"),
		toPipelineId: v.id("pipelines"),
	},
	handler: async (ctx, args) => {
		const { member, userId } = await requireOrgMember(ctx, args.orgId);
		requireRole(member.permissions, "deals.changePipeline");
		await enforceRateLimit(ctx, {
			scope: "deals.update",
			key: `${userId}:${args.orgId}`,
			max: 120,
			periodMs: 60_000,
			orgId: args.orgId,
		});

		const deal = await ctx.db.get(args.dealId);
		if (!deal || deal.orgId !== args.orgId || deal.deletedAt !== undefined) {
			throw new ConvexError(ERRORS.NOT_FOUND);
		}
		if (deal.wonAt || deal.lostAt) {
			throw new ConvexError({
				code: "DEAL_CLOSED",
				message: "Closed deals cannot change pipeline. Reopen first.",
			});
		}
		if (deal.pipelineId === args.toPipelineId) {
			throw new ConvexError({
				code: "SAME_PIPELINE",
				message: "Deal is already in this pipeline.",
			});
		}

		const [fromPipeline, toPipeline] = await Promise.all([
			ctx.db.get(deal.pipelineId),
			ctx.db.get(args.toPipelineId),
		]);
		if (!toPipeline || toPipeline.orgId !== args.orgId) throw new ConvexError(ERRORS.NOT_FOUND);
		if (toPipeline.entityType !== "deal")
			throw new ConvexError({
				code: "INVALID_PIPELINE",
				message: "Target pipeline is not for deals.",
			});

		const sortedStages = [...toPipeline.stages].sort((a, b) => a.order - b.order);
		const firstNonFinal = sortedStages.find((s) => !s.isFinal) ?? sortedStages[0];
		if (!firstNonFinal)
			throw new ConvexError({
				code: "EMPTY_PIPELINE",
				message: "Target pipeline has no stages.",
			});

		const now = Date.now();
		await ctx.db.patch(args.dealId, {
			pipelineId: args.toPipelineId,
			currentStageId: firstNonFinal.id,
			stageEnteredAt: now,
			updatedAt: now,
		});

		await logActivity(ctx, {
			orgId: args.orgId,
			userId,
			action: "deal_pipeline_changed",
			entityType: "deal",
			entityId: args.dealId,
			personCode: deal.personCode,
			description: `Pipeline changed: ${fromPipeline?.name ?? "?"} → ${toPipeline.name}`,
			metadata: {
				fromPipelineId: deal.pipelineId,
				toPipelineId: args.toPipelineId,
				fromStageId: deal.currentStageId,
				toStageId: firstNonFinal.id,
				toStageCode: firstNonFinal.code,
			},
		});

		if (deal.assignedTo && deal.assignedTo !== userId) {
			await sendNotification(ctx, {
				orgId: args.orgId,
				userId: deal.assignedTo,
				type: "deal.pipeline_changed",
				title: `Deal moved to ${toPipeline.name}: ${deal.title}`,
				entityType: "deal",
				entityId: args.dealId,
			});
		}

		await ctx.scheduler.runAfter(0, internal.ai.internal.rebuildEntityContext, {
			orgId: args.orgId,
			entityType: "deal",
			entityId: args.dealId,
			personCode: deal.personCode,
		});
	},
});

/**
 * markAsLost — close a deal as lost from any stage (no need to move it to
 * a final stage first). The user must type the deal's `dealCode` exactly
 * as a confirmation so a runaway click can never delete real pipeline
 * data — the user said:
 *
 *   "From any stage we will have mark as lost in a deal that too
 *    confirmation box as well … input asking (delete deal-code requried
 *    please to confirm)."
 *
 * Behaviour
 * ─────────
 *   - `deleteCodeConfirmation` MUST exactly equal the deal's `dealCode`
 *     (case-sensitive) — otherwise throw `CONFIRMATION_MISMATCH`.
 *   - Moves the deal into the pipeline's negative-final stage (if one
 *     exists). If no negative-final stage is configured, leaves the
 *     deal at its current stage but stamps `lostAt` so it's filtered
 *     out of open-deal queries.
 *   - Bypasses `markDoneRequiresAllFields` — losing a deal must always
 *     be possible regardless of completeness.
 *   - Logs `lost` activity with `outcomeReason` if provided.
 *
 * RBAC: `deals.close`. Rate limit: shared `deals.update` 120/min budget.
 */
export const markAsLost = orgMutation({
	args: {
		orgId: v.id("orgs"),
		dealId: v.id("deals"),
		deleteCodeConfirmation: v.string(),
		outcomeReason: v.optional(v.string()),
	},
	handler: async (ctx, args) => {
		const { member, userId } = await requireOrgMember(ctx, args.orgId);
		requireRole(member.permissions, "deals.close");
		await enforceRateLimit(ctx, {
			scope: "deals.update",
			key: `${userId}:${args.orgId}`,
			max: 120,
			periodMs: 60_000,
			orgId: args.orgId,
		});

		const deal = await ctx.db.get(args.dealId);
		if (!deal || deal.orgId !== args.orgId || deal.deletedAt !== undefined) {
			throw new ConvexError(ERRORS.NOT_FOUND);
		}
		if (deal.lostAt) {
			throw new ConvexError({
				code: "ALREADY_LOST",
				message: "Deal is already marked lost.",
			});
		}
		if (deal.wonAt) {
			throw new ConvexError({
				code: "ALREADY_WON",
				message: "Deal is already marked won — reopen it first.",
			});
		}

		// Confirmation gate — must match the dealCode exactly.
		if (args.deleteCodeConfirmation.trim() !== deal.dealCode) {
			throw new ConvexError({
				code: "CONFIRMATION_MISMATCH",
				message: `Confirmation didn't match. Type "${deal.dealCode}" exactly to mark this deal as lost.`,
			});
		}

		const pipeline = await ctx.db.get(deal.pipelineId);
		const negativeFinal = pipeline?.stages.find((s) => s.isFinal && s.finalType === "negative");

		const now = Date.now();
		const patch: Record<string, unknown> = {
			lostAt: now,
			outcomeReason: args.outcomeReason,
			updatedAt: now,
		};
		if (negativeFinal) {
			patch.currentStageId = negativeFinal.id;
			patch.stageEnteredAt = now;
		}

		await ctx.db.patch(args.dealId, patch);

		// Counter rebalance — leaving the open pool.
		await applyOrgStat(ctx, args.orgId, "deals.open", -1);
		if (deal.value && deal.value > 0) {
			await applyOrgStat(ctx, args.orgId, "deals.pipelineValue", -deal.value);
		}
		await applyOrgStat(ctx, args.orgId, "deals.lost", +1);

		await logActivity(ctx, {
			orgId: args.orgId,
			userId,
			action: "lost",
			entityType: "deal",
			entityId: args.dealId,
			personCode: deal.personCode,
			description: `Deal lost: ${deal.title}`,
			metadata: {
				dealCode: deal.dealCode,
				...(negativeFinal
					? { toStageId: negativeFinal.id, toCode: negativeFinal.code }
					: {}),
				...(args.outcomeReason ? { outcomeReason: args.outcomeReason } : {}),
			},
		});

		if (deal.assignedTo && deal.assignedTo !== userId) {
			await sendNotification(ctx, {
				orgId: args.orgId,
				userId: deal.assignedTo,
				type: "deal.lost",
				title: `Deal closed lost: ${deal.title}`,
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
