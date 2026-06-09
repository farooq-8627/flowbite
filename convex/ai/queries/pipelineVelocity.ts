/**
 * convex/ai/queries/pipelineVelocity.ts
 *
 * Stage 7 of /SPRINT-PLAN.md — Analytical layer.
 *
 * Pure deterministic pipeline-velocity rollup. NO LLM. The query reads
 * `deals` rows directly (one indexed scan per pipeline) and the last
 * 90 days of `activityLogs` for the org (one indexed scan filtered by
 * action `stage_changed`) to compute, per stage:
 *
 *   - dealsInStage              — OPEN deals currently sitting in the stage.
 *   - avgDaysInStage            — mean (now − stageEnteredAt) for those OPEN
 *                                 deals, in calendar days.
 *   - dealsExitingStage         — count of stage_changed transitions OUT of
 *                                 this stage in the last 90 days.
 *   - dealsExitingToFinal       — subset where the destination stage was a
 *                                 final stage (won OR lost).
 *   - dropoffPct                — % of exits that went to a `lost` final
 *                                 stage. Honest 0 when there were no exits.
 *
 * Output is an envelope per pipeline so the dashboard can render multiple
 * pipelines side by side.
 *
 * Why a 90-day window: short enough that the read is bounded (matches
 * `activityLogs.archiveOld` 90-day retention), long enough that small
 * orgs still see meaningful dropoff numbers.
 *
 * Per AGENTS.md non-negotiable rule, the public `orgQuery` has a
 * `*ForAI` internal twin that takes a trusted `userId` argument so it
 * can be invoked from the AI tool layer (where scheduled-action auth
 * does not propagate).
 */

import { v } from "convex/values";
import { orgQuery, requireOrgMember, requireOrgMemberByIds } from "../../_functions/authenticated";
import type { Doc, Id } from "../../_generated/dataModel";
import { internalQuery, type QueryCtx } from "../../_generated/server";

/** 90-day rolling window for stage-transition stats. */
const VELOCITY_WINDOW_MS = 90 * 24 * 60 * 60 * 1000;
const ONE_DAY_MS = 24 * 60 * 60 * 1000;

export type PipelineStageVelocity = {
	stageId: string;
	stageName: string;
	stageCode: string;
	isFinal: boolean;
	finalType?: "positive" | "negative" | "neutral";
	dealsInStage: number;
	avgDaysInStage: number;
	dealsExitingStage: number;
	dealsExitingToFinal: number;
	dropoffPct: number;
};

export type PipelineVelocityResult = {
	pipelineId: Id<"pipelines">;
	pipelineName: string;
	entityType: string;
	isDefault: boolean;
	stages: PipelineStageVelocity[];
	totals: {
		dealsOpen: number;
		dealsWon: number;
		dealsLost: number;
		avgPipelineDaysOpen: number;
	};
	windowStartedAt: number;
	windowEndedAt: number;
};

// ─── Pure helpers (testable in isolation) ────────────────────────────────

/**
 * Compute mean number of full days elapsed from `stageEnteredAt` to `now`
 * across an OPEN-deal cohort. Returns 0 on an empty cohort.
 */
export function avgDaysInStage(stageEnteredAts: readonly number[], now: number): number {
	if (stageEnteredAts.length === 0) return 0;
	let totalDays = 0;
	for (const t of stageEnteredAts) {
		const days = Math.max(0, (now - t) / ONE_DAY_MS);
		totalDays += days;
	}
	return Math.round((totalDays / stageEnteredAts.length) * 10) / 10;
}

/**
 * Pure stage-velocity computer. Given the pipeline definition, the
 * org's deals, and the org's stage-change activity within the window,
 * returns one velocity row per stage.
 *
 * Exported for the Stage 7 unit tests — no DB access.
 */
export function computeStageVelocity(args: {
	pipeline: Doc<"pipelines">;
	deals: readonly Doc<"deals">[];
	stageChangeLogs: readonly {
		entityId: string;
		metadata?: Record<string, string | number | boolean> | undefined;
	}[];
	now: number;
}): PipelineStageVelocity[] {
	const { pipeline, deals, stageChangeLogs, now } = args;
	const dealById = new Map(deals.map((d) => [d._id as unknown as string, d]));

	// Group OPEN deals by current stage.
	const openByStage = new Map<string, Doc<"deals">[]>();
	for (const d of deals) {
		if (d.deletedAt !== undefined) continue;
		if (d.wonAt !== undefined || d.lostAt !== undefined) continue;
		if (d.pipelineId !== pipeline._id) continue;
		const list = openByStage.get(d.currentStageId) ?? [];
		list.push(d);
		openByStage.set(d.currentStageId, list);
	}

	// Pre-compute final-stage lookups by id and by code.
	const finalById = new Map<string, { isFinal: boolean; finalType?: string }>();
	const finalByCode = new Map<string, { isFinal: boolean; finalType?: string }>();
	for (const s of pipeline.stages) {
		const flag = { isFinal: s.isFinal === true, finalType: s.finalType };
		finalById.set(s.id, flag);
		if (s.code) finalByCode.set(s.code, flag);
	}

	// Group stage-change exits by source stage. We only count rows where the
	// deal still exists (so we have its pipelineId) AND the source stage
	// belongs to this pipeline. metadata.fromStageId / fromCode is recorded
	// in `convex/crm/entities/deals/mutations.ts:moveToStageImpl`.
	const exitsByFromStage = new Map<string, { total: number; toFinalNegative: number }>();
	for (const log of stageChangeLogs) {
		const deal = dealById.get(log.entityId);
		if (!deal) continue;
		if (deal.pipelineId !== pipeline._id) continue;
		const md = log.metadata ?? {};
		const fromStageId = typeof md.fromStageId === "string" ? md.fromStageId : undefined;
		if (!fromStageId) continue;
		const toStageId = typeof md.toStageId === "string" ? md.toStageId : undefined;
		const acc = exitsByFromStage.get(fromStageId) ?? { total: 0, toFinalNegative: 0 };
		acc.total += 1;
		if (toStageId) {
			const flag = finalById.get(toStageId);
			if (flag?.isFinal && flag.finalType === "negative") acc.toFinalNegative += 1;
		}
		exitsByFromStage.set(fromStageId, acc);
	}

	const sortedStages = [...pipeline.stages].sort((a, b) => a.order - b.order);
	return sortedStages.map((s) => {
		const open = openByStage.get(s.id) ?? [];
		const exits = exitsByFromStage.get(s.id) ?? { total: 0, toFinalNegative: 0 };
		const dropoffPct =
			exits.total > 0 ? Math.round((exits.toFinalNegative / exits.total) * 100) : 0;
		return {
			stageId: s.id,
			stageName: s.name,
			stageCode: s.code,
			isFinal: s.isFinal === true,
			finalType: s.finalType,
			dealsInStage: open.length,
			avgDaysInStage: avgDaysInStage(
				open.map((d) => d.stageEnteredAt),
				now,
			),
			dealsExitingStage: exits.total,
			dealsExitingToFinal: exits.toFinalNegative,
			dropoffPct,
		};
	});
}

// ─── DB readers ──────────────────────────────────────────────────────────

async function readPipelineVelocity(
	ctx: QueryCtx,
	args: { orgId: Id<"orgs">; now: number },
): Promise<PipelineVelocityResult[]> {
	const pipelines = await ctx.db
		.query("pipelines")
		.withIndex("by_org", (q) => q.eq("orgId", args.orgId))
		.collect();
	const deals = await ctx.db
		.query("deals")
		.withIndex("by_org", (q) => q.eq("orgId", args.orgId))
		.collect();

	const windowStart = args.now - VELOCITY_WINDOW_MS;
	const recentLogs = await ctx.db
		.query("activityLogs")
		.withIndex("by_orgId_and_createdAt", (q) =>
			q.eq("orgId", args.orgId).gte("createdAt", windowStart),
		)
		.collect();
	const stageChangeLogs = recentLogs.filter(
		(l) => l.entityType === "deal" && l.action === "stage_changed",
	);

	return pipelines
		.filter((p) => p.entityType === "deal" && p.deletedAt === undefined)
		.map((p) => {
			const stages = computeStageVelocity({
				pipeline: p,
				deals,
				stageChangeLogs: stageChangeLogs.map((l) => ({
					entityId: l.entityId,
					metadata: l.metadata,
				})),
				now: args.now,
			});
			const pipelineDeals = deals.filter(
				(d) => d.pipelineId === p._id && d.deletedAt === undefined,
			);
			const open = pipelineDeals.filter(
				(d) => d.wonAt === undefined && d.lostAt === undefined,
			);
			const won = pipelineDeals.filter((d) => d.wonAt !== undefined);
			const lost = pipelineDeals.filter((d) => d.lostAt !== undefined);
			const avgPipelineDaysOpen = avgDaysInStage(
				open.map((d) => d.stageEnteredAt),
				args.now,
			);
			return {
				pipelineId: p._id,
				pipelineName: p.name,
				entityType: p.entityType,
				isDefault: p.isDefault === true,
				stages,
				totals: {
					dealsOpen: open.length,
					dealsWon: won.length,
					dealsLost: lost.length,
					avgPipelineDaysOpen,
				},
				windowStartedAt: windowStart,
				windowEndedAt: args.now,
			};
		});
}

// ─── Public + ForAI ──────────────────────────────────────────────────────

export const getOrgPipelineVelocity = orgQuery({
	args: { orgId: v.id("orgs") },
	handler: async (ctx, args) => {
		const { member } = await requireOrgMember(ctx, args.orgId);
		// Pipeline velocity reveals deal value flow → reuse `deals.view` as
		// the gate so a viewer can still see the velocity card.
		if (!member.permissions.includes("deals.view")) {
			return { pipelines: [], generatedAt: Date.now() };
		}
		const pipelines = await readPipelineVelocity(ctx, { orgId: args.orgId, now: Date.now() });
		return { pipelines, generatedAt: Date.now() };
	},
});

export const getOrgPipelineVelocityForAI = internalQuery({
	args: {
		orgId: v.id("orgs"),
		userId: v.id("users"),
	},
	handler: async (ctx, args) => {
		const { member } = await requireOrgMemberByIds(ctx, args.orgId, args.userId);
		if (!member.permissions.includes("deals.view")) {
			return { pipelines: [], generatedAt: Date.now() };
		}
		const pipelines = await readPipelineVelocity(ctx, { orgId: args.orgId, now: Date.now() });
		return { pipelines, generatedAt: Date.now() };
	},
});

export const __test = {
	avgDaysInStage,
	computeStageVelocity,
	VELOCITY_WINDOW_MS,
	ONE_DAY_MS,
};
