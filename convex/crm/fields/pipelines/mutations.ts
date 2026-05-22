/**
 * Pipelines Mutations — convex/crm/fields/pipelines/mutations.ts
 * STATUS: IMPLEMENTED
 *
 * Public:
 *   - create            — new pipeline (plan-limit gated)
 *   - addStage          — append a stage (auto-suggests code if not provided)
 *   - updateStage       — patch one stage by id (validates code uniqueness)
 *   - removeStage       — remove a stage if empty (no deals reference it)
 *   - reorderStages     — full reorder by stage-id array
 *   - setDefaultStage   — promote any non-final stage to position 0
 *   - deletePipeline    — only when empty + non-default
 *
 * Pattern: every mutation goes through `requireOrgMember + requireRole` for
 * RBAC (`pipelines.manage`), validates org ownership of the target pipeline,
 * and writes through `ctx.db.patch` to keep stage `id`s stable.
 */
import { ConvexError, v } from "convex/values";
import { orgMutation, requireOrgMember } from "../../../_functions/authenticated";
import { getPlanLimits, isWithinLimit, type PlanTier } from "../../../_platform/limits";
import { ERRORS } from "../../../_shared/errors";
import { requireRole } from "../../../_shared/permissions";
import { logActivity } from "../../../activityLogs/helpers";
import { deriveStageCode, validateStageCode } from "./helpers";

const stageShape = v.object({
	id: v.string(),
	name: v.string(),
	code: v.string(),
	order: v.number(),
	color: v.optional(v.string()),
	isDefaultStage: v.optional(v.boolean()),
	isFinal: v.optional(v.boolean()),
	finalType: v.optional(
		v.union(v.literal("positive"), v.literal("negative"), v.literal("neutral")),
	),
	staleAfterDays: v.optional(v.number()),
});

function nanoid12(): string {
	return Math.random().toString(36).slice(2, 14).padEnd(12, "0");
}

/**
 * Build the auto-created Default stage. Always sits at order 0, carries
 * `isDefaultStage: true`, and uses a neutral colour so it reads as
 * "starting point" rather than a particular state.
 */
function makeDefaultStage(): {
	id: string;
	name: string;
	code: string;
	order: number;
	color: string;
	isDefaultStage: true;
} {
	return {
		id: `stage_${nanoid12()}`,
		name: "Default",
		code: "DEFAULT",
		order: 0,
		color: "#94a3b8",
		isDefaultStage: true,
	};
}

/**
 * Collect the Default stage ids of every deal pipeline in the org EXCEPT
 * the one identified by `excludePipelineId`. Used by `pipelines.create` to
 * decide whether an existing deal field is a "Defaults"-only field
 * (currently pinned only to other pipelines' Default stages → extend) or
 * a stage-aware field (pinned to specific non-default stages → leave
 * alone). The exclusion lets us call this with the just-created pipeline
 * id so we don't double-count.
 */
async function getOtherDefaultStageIds(
	// biome-ignore lint/suspicious/noExplicitAny: ctx.db is generic across mutations; concrete types live in convex-generated server code
	ctx: { db: any },
	orgId: unknown,
	excludePipelineId: unknown,
): Promise<Set<string>> {
	const pipelines = (await ctx.db
		.query("pipelines")
		// biome-ignore lint/suspicious/noExplicitAny: index callback param is implicitly any in Convex internals
		.withIndex("by_org_and_entity", (q: any) => q.eq("orgId", orgId).eq("entityType", "deal"))
		.collect()) as Array<{
		_id: unknown;
		stages: Array<{ id: string; isDefaultStage?: boolean }>;
	}>;
	const out = new Set<string>();
	for (const p of pipelines) {
		if (p._id === excludePipelineId) continue;
		const def = p.stages.find((s) => s.isDefaultStage === true);
		if (def) out.add(def.id);
	}
	return out;
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

		// Plan-tier limit (single-source from convex/_platform/limits.ts).
		const org = await ctx.db.get(args.orgId);
		const tier: PlanTier = (org?.plan as PlanTier | undefined) ?? "free";
		const limits = getPlanLimits(tier);
		const existingForType = await ctx.db
			.query("pipelines")
			.withIndex("by_org_and_entity", (q) =>
				q.eq("orgId", args.orgId).eq("entityType", args.entityType),
			)
			.collect();
		if (!isWithinLimit(existingForType.length, limits.maxPipelinesPerEntityType)) {
			throw new ConvexError({
				code: "PLAN_LIMIT_EXCEEDED",
				message: `Your ${tier} plan allows ${limits.maxPipelinesPerEntityType} ${args.entityType} pipeline(s). Upgrade to add more.`,
			});
		}

		if (args.isDefault) {
			const existingDefault = await ctx.db
				.query("pipelines")
				.withIndex("by_org_and_entity_and_default", (q) =>
					q
						.eq("orgId", args.orgId)
						.eq("entityType", args.entityType)
						.eq("isDefault", true),
				)
				.first();
			if (existingDefault) {
				await ctx.db.patch(existingDefault._id, {
					isDefault: false,
					updatedAt: Date.now(),
				});
			}
		}

		// Always start with the auto-created Default stage. If the caller
		// supplies extra stages (e.g. seeded from an industry template),
		// append them after — re-numbered so the Default sits at order 0
		// and never collides with anything else.
		const callerStages = args.stages ?? [];
		const defaultStage = callerStages.find((s) => s.isDefaultStage === true);

		const stages: typeof callerStages = [];
		if (defaultStage) {
			// Caller already provided a Default stage (industry template
			// path). Make sure it's at order 0 and keep the rest re-numbered.
			stages.push({ ...defaultStage, order: 0, isDefaultStage: true });
			let idx = 1;
			for (const s of callerStages) {
				if (s.id === defaultStage.id) continue;
				stages.push({ ...s, order: idx, isDefaultStage: false });
				idx += 1;
			}
		} else {
			// Auto-inject a Default stage.
			stages.push(makeDefaultStage());
			let idx = 1;
			for (const s of callerStages) {
				stages.push({ ...s, order: idx, isDefaultStage: false });
				idx += 1;
			}
		}

		// Final defensive validation — every code in the supplied stages must
		// be unique within the pipeline. (Caller is supposed to ensure this
		// already, but we guard so we never persist garbage.)
		const seen = new Set<string>();
		for (const s of stages) {
			const err = validateStageCode(s.code, seen);
			if (err) throw new ConvexError({ code: "INVALID_STAGE_CODE", message: err });
			seen.add(s.code);
		}

		const pipelineId = await ctx.db.insert("pipelines", {
			orgId: args.orgId,
			name: args.name,
			entityType: args.entityType,
			isDefault: args.isDefault ?? false,
			stages,
			createdAt: Date.now(),
			updatedAt: Date.now(),
		});

		// Default-stage backfill (deal pipelines only).
		//
		// Locked decision (2026-05-20): every deal field MUST be pinned to
		// at least one stage. When an org creates a NEW deal pipeline,
		// existing deal fields with empty / missing `showInStages` need to
		// be pinned to this new pipeline's Default stage so they show up
		// in the Defaults tab. We also extend already-pinned fields so
		// the field appears across every pipeline's Defaults tab.
		if (args.entityType === "deal") {
			const newDefaultStage = stages.find((s) => s.isDefaultStage === true);
			if (newDefaultStage) {
				const dealFields = await ctx.db
					.query("fieldDefinitions")
					.withIndex("by_org_and_entity", (q) =>
						q.eq("orgId", args.orgId).eq("entityType", "deal"),
					)
					.collect();
				const now = Date.now();
				for (const f of dealFields) {
					const existing = f.showInStages ?? [];
					if (existing.includes(newDefaultStage.id)) continue;
					if (existing.length === 0) {
						// Field was unpinned (legacy "show everywhere") — pin
						// it to the new Default stage. Idempotent for fresh
						// pipelines, also seeds them up.
						await ctx.db.patch(f._id, {
							showInStages: [newDefaultStage.id],
							updatedAt: now,
						});
					} else {
						// Already pinned to other Default stages — extend so
						// the field appears in every pipeline's Defaults tab
						// (which is what owners expect: identity fields are
						// org-wide defaults, not per-pipeline).
						const otherDefaults = await getOtherDefaultStageIds(
							ctx,
							args.orgId,
							pipelineId,
						);
						const stillDefault = existing.every((id) => otherDefaults.has(id));
						if (stillDefault) {
							await ctx.db.patch(f._id, {
								showInStages: [...existing, newDefaultStage.id],
								updatedAt: now,
							});
						}
					}
				}
			}
		}

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
			code: v.optional(v.string()),
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

		// Validate / derive the stage code
		const usedCodes = new Set(pipeline.stages.map((s) => s.code));
		let code: string;
		if (args.stage.code) {
			const err = validateStageCode(args.stage.code, usedCodes);
			if (err) throw new ConvexError({ code: "INVALID_STAGE_CODE", message: err });
			code = args.stage.code;
		} else {
			code = deriveStageCode(args.stage, usedCodes);
		}

		const newStage = {
			id: `stage_${nanoid12()}`,
			name: args.stage.name,
			code,
			order: pipeline.stages.length,
			color: args.stage.color,
			// Never auto-flag user-added stages as the Default stage —
			// only `pipelines.create` mints the Default stage.
			isDefaultStage: false,
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
			metadata: { stageId: newStage.id, stageCode: code },
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
		code: v.optional(v.string()),
		color: v.optional(v.string()),
		staleAfterDays: v.optional(v.number()),
	},
	handler: async (ctx, args) => {
		const { member } = await requireOrgMember(ctx, args.orgId);
		requireRole(member.permissions, "pipelines.manage");

		const pipeline = await ctx.db.get(args.pipelineId);
		if (!pipeline || pipeline.orgId !== args.orgId) throw new ConvexError(ERRORS.NOT_FOUND);

		const target = pipeline.stages.find((s) => s.id === args.stageId);
		if (!target) throw new ConvexError({ code: "INVALID_STAGE", message: "Stage not found" });

		// Validate the new code against EVERY OTHER stage's codes
		if (args.code !== undefined) {
			const otherCodes = new Set(
				pipeline.stages.filter((s) => s.id !== args.stageId).map((s) => s.code),
			);
			const err = validateStageCode(args.code, otherCodes);
			if (err) throw new ConvexError({ code: "INVALID_STAGE_CODE", message: err });
		}

		const stages = pipeline.stages.map((s) => {
			if (s.id !== args.stageId) return s;
			return {
				...s,
				name: args.name ?? s.name,
				code: args.code ?? s.code,
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

		const target = pipeline.stages.find((s) => s.id === args.stageId);
		if (!target) throw new ConvexError({ code: "INVALID_STAGE", message: "Stage not found" });
		if (target.isDefaultStage) {
			throw new ConvexError({
				code: "DEFAULT_STAGE_PROTECTED",
				message: "The Default stage cannot be removed — every pipeline has one.",
			});
		}

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

		// The Default stage is always at order 0 — re-pin it to the front
		// regardless of where the caller dragged it. This matches the UX
		// spec: the Default stage cannot be reordered.
		const defaultStage = pipeline.stages.find((s) => s.isDefaultStage === true);
		const stageMap = new Map(pipeline.stages.map((s) => [s.id, s]));

		const requestedIds = args.stageIds.filter((id) => !defaultStage || id !== defaultStage.id);
		const orderedIds = defaultStage ? [defaultStage.id, ...requestedIds] : requestedIds;

		const reordered = orderedIds.map((id, i) => {
			const stage = stageMap.get(id);
			if (!stage)
				throw new ConvexError({ code: "INVALID_STAGE", message: `Stage ${id} not found` });
			return { ...stage, order: i };
		});

		await ctx.db.patch(args.pipelineId, { stages: reordered, updatedAt: Date.now() });
	},
});

/**
 * @deprecated The Default stage is auto-created on `pipelines.create` and
 * cannot be reassigned. This mutation now only allows renaming the existing
 * Default stage's *label* (since the role itself is fixed).
 *
 * Kept for backwards-compat with old callers that promote a stage. Today
 * we throw `DEFAULT_STAGE_FIXED` if the target stage isn't already the
 * default — UI is expected to use `updateStage` to rename the default
 * stage instead.
 */
export const setDefaultStage = orgMutation({
	args: {
		orgId: v.id("orgs"),
		pipelineId: v.id("pipelines"),
		stageId: v.string(),
	},
	handler: async (ctx, args) => {
		const { member } = await requireOrgMember(ctx, args.orgId);
		requireRole(member.permissions, "pipelines.manage");

		const pipeline = await ctx.db.get(args.pipelineId);
		if (!pipeline || pipeline.orgId !== args.orgId) throw new ConvexError(ERRORS.NOT_FOUND);

		const target = pipeline.stages.find((s) => s.id === args.stageId);
		if (!target) throw new ConvexError({ code: "INVALID_STAGE", message: "Stage not found" });
		if (target.isDefaultStage) {
			// Already the default — no-op (idempotent).
			return;
		}
		throw new ConvexError({
			code: "DEFAULT_STAGE_FIXED",
			message:
				"The Default stage is fixed per pipeline. Edit the label of the existing Default stage instead of promoting another stage.",
		});
	},
});

/**
 * Update top-level pipeline metadata. Today: rename, change the
 * stage-transition policy, allowSkipStages flag, markDoneRequiresAllFields
 * flag. Stages are managed by the dedicated stage mutations above.
 *
 * RBAC: pipelines.manage.
 */
export const update = orgMutation({
	args: {
		orgId: v.id("orgs"),
		pipelineId: v.id("pipelines"),
		name: v.optional(v.string()),
		stageTransitionPolicy: v.optional(
			v.union(v.literal("block"), v.literal("warn"), v.literal("off")),
		),
		allowSkipStages: v.optional(v.boolean()),
		markDoneRequiresAllFields: v.optional(v.boolean()),
	},
	handler: async (ctx, args) => {
		const { member, userId } = await requireOrgMember(ctx, args.orgId);
		requireRole(member.permissions, "pipelines.manage");

		const pipeline = await ctx.db.get(args.pipelineId);
		if (!pipeline || pipeline.orgId !== args.orgId) throw new ConvexError(ERRORS.NOT_FOUND);

		const patch: Record<string, unknown> = { updatedAt: Date.now() };
		if (args.name !== undefined) {
			const trimmed = args.name.trim();
			if (trimmed.length === 0) {
				throw new ConvexError({
					code: "INVALID_NAME",
					message: "Pipeline name cannot be empty",
				});
			}
			patch.name = trimmed;
		}
		if (args.stageTransitionPolicy !== undefined) {
			patch.stageTransitionPolicy = args.stageTransitionPolicy;
		}
		if (args.allowSkipStages !== undefined) {
			patch.allowSkipStages = args.allowSkipStages;
		}
		if (args.markDoneRequiresAllFields !== undefined) {
			patch.markDoneRequiresAllFields = args.markDoneRequiresAllFields;
		}

		if (Object.keys(patch).length === 1) return; // only updatedAt — nothing to do

		await ctx.db.patch(args.pipelineId, patch);

		await logActivity(ctx, {
			orgId: args.orgId,
			userId,
			action: "pipeline_updated",
			entityType: "pipeline",
			entityId: args.pipelineId,
			description: `Pipeline updated: ${pipeline.name}`,
			metadata: {
				...(args.name !== undefined ? { newName: args.name } : {}),
				...(args.stageTransitionPolicy !== undefined
					? { newStageTransitionPolicy: args.stageTransitionPolicy }
					: {}),
				...(args.allowSkipStages !== undefined
					? { newAllowSkipStages: args.allowSkipStages }
					: {}),
				...(args.markDoneRequiresAllFields !== undefined
					? { newMarkDoneRequiresAllFields: args.markDoneRequiresAllFields }
					: {}),
			},
		});
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
