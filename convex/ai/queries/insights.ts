/**
 * convex/ai/queries/insights.ts
 *
 * Stage 7 of /SPRINT-PLAN.md — Analytical layer.
 *
 * Read API for the `aiInsights` table + a private write helper that the
 * subagent actions (`analyzeMetric`, `analyzeDealClose`) call after
 * Zod-validating their structured output.
 *
 * Why a separate insights module:
 *   - The shape (`InsightBody`) is the single source of truth for the
 *     zod schema used by the actions, the schema validator on the
 *     table, and the UI cards.
 *   - The write path enforces the schema BEFORE persisting so the
 *     table can't be poisoned by a model emitting invalid JSON.
 *
 * Indexes on the table:
 *   by_org_and_kind_and_generated   — the list path (latest by kind).
 *   by_org_and_recordRef_code       — sparse; deal-retrospective lookup.
 *   by_expires                      — TTL sweeper (90 days).
 */

import { v } from "convex/values";
import { z } from "zod";
import { orgQuery, requireOrgMember, requireOrgMemberByIds } from "../../_functions/authenticated";
import { internal } from "../../_generated/api";
import type { Doc, Id } from "../../_generated/dataModel";
import { internalMutation, internalQuery } from "../../_generated/server";

/** The kind discriminator must match the schema literal union. */
const KIND_VALIDATOR = v.union(
	v.literal("metric_analysis"),
	v.literal("deal_retrospective"),
	v.literal("cohort_summary"),
);

/**
 * Zod schema for the `body` column. The single source of truth used by
 * the subagent actions BEFORE they call `writeInsight`. Mirrors the
 * Convex `defineTable` validator — keep them in sync if you extend
 * either side.
 */
export const InsightBodySchema = z.object({
	summary: z.string().min(1).max(2000),
	findings: z.array(z.string().min(1).max(400)).min(1).max(10),
	actionItems: z
		.array(
			z.object({
				label: z.string().min(1).max(80),
				intent: z.string().min(1).max(300).optional(),
			}),
		)
		.max(5),
	confidence: z.union([z.literal("high"), z.literal("medium"), z.literal("low")]),
});

export type InsightBody = z.infer<typeof InsightBodySchema>;

const INSIGHTS_TTL_MS = 90 * 24 * 60 * 60 * 1000;

// ─── Public reads ────────────────────────────────────────────────────────

export const listInsights = orgQuery({
	args: {
		orgId: v.id("orgs"),
		kind: v.optional(KIND_VALIDATOR),
		limit: v.optional(v.number()),
	},
	handler: async (ctx, args) => {
		const { member } = await requireOrgMember(ctx, args.orgId);
		if (!member.permissions.includes("ai.analytics.viewMetrics")) {
			return { count: 0, rows: [] };
		}
		const limit = Math.min(50, Math.max(1, args.limit ?? 10));
		const now = Date.now();

		let rows: Doc<"aiInsights">[] = [];
		if (args.kind) {
			rows = await ctx.db
				.query("aiInsights")
				.withIndex("by_org_and_kind_and_generated", (q) =>
					q.eq("orgId", args.orgId).eq("kind", args.kind!),
				)
				.order("desc")
				.take(limit + 5);
		} else {
			// No kind filter — use a stable client-side sort over a small
			// slice. `take(limit + 5)` per kind keeps the read bounded;
			// then we merge.
			const kinds: Array<"metric_analysis" | "deal_retrospective" | "cohort_summary"> = [
				"metric_analysis",
				"deal_retrospective",
				"cohort_summary",
			];
			const slices = await Promise.all(
				kinds.map((k) =>
					ctx.db
						.query("aiInsights")
						.withIndex("by_org_and_kind_and_generated", (q) =>
							q.eq("orgId", args.orgId).eq("kind", k),
						)
						.order("desc")
						.take(limit),
				),
			);
			rows = slices.flat();
			rows.sort((a, b) => b.generatedAt - a.generatedAt);
		}

		const live = rows.filter((r) => r.expiresAt > now).slice(0, limit);
		return {
			count: live.length,
			rows: live.map((r) => ({
				id: r._id,
				kind: r.kind,
				metric: r.metric,
				range: r.range,
				recordRef: r.recordRef,
				body: r.body,
				generatedAt: r.generatedAt,
				modelUsed: r.modelUsed,
			})),
		};
	},
});

export const getInsight = orgQuery({
	args: { orgId: v.id("orgs"), insightId: v.id("aiInsights") },
	handler: async (ctx, args) => {
		const { member } = await requireOrgMember(ctx, args.orgId);
		if (!member.permissions.includes("ai.analytics.viewMetrics")) return null;
		const row = await ctx.db.get(args.insightId);
		if (!row || row.orgId !== args.orgId) return null;
		if (row.expiresAt < Date.now()) return null;
		return row;
	},
});

// ─── ForAI twins ─────────────────────────────────────────────────────────

export const listInsightsForAI = internalQuery({
	args: {
		orgId: v.id("orgs"),
		userId: v.id("users"),
		kind: v.optional(KIND_VALIDATOR),
		limit: v.optional(v.number()),
	},
	handler: async (ctx, args) => {
		const { member } = await requireOrgMemberByIds(ctx, args.orgId, args.userId);
		if (!member.permissions.includes("ai.analytics.viewMetrics")) {
			return { count: 0, rows: [] };
		}
		const limit = Math.min(50, Math.max(1, args.limit ?? 10));
		const now = Date.now();
		const rows = args.kind
			? await ctx.db
					.query("aiInsights")
					.withIndex("by_org_and_kind_and_generated", (q) =>
						q.eq("orgId", args.orgId).eq("kind", args.kind!),
					)
					.order("desc")
					.take(limit + 5)
			: (
					await Promise.all(
						(["metric_analysis", "deal_retrospective", "cohort_summary"] as const).map(
							(k) =>
								ctx.db
									.query("aiInsights")
									.withIndex("by_org_and_kind_and_generated", (q) =>
										q.eq("orgId", args.orgId).eq("kind", k),
									)
									.order("desc")
									.take(limit),
						),
					)
				)
					.flat()
					.sort((a, b) => b.generatedAt - a.generatedAt);
		const live = rows.filter((r) => r.expiresAt > now).slice(0, limit);
		return {
			count: live.length,
			rows: live.map((r) => ({
				id: r._id,
				kind: r.kind,
				metric: r.metric,
				range: r.range,
				recordRef: r.recordRef,
				body: r.body,
				generatedAt: r.generatedAt,
				modelUsed: r.modelUsed,
			})),
		};
	},
});

// ─── Internal write — called from subagent actions only ─────────────────

const RECORD_REF_VALIDATOR = v.optional(
	v.object({
		entityType: v.string(),
		entityId: v.string(),
		code: v.optional(v.string()),
	}),
);

const BODY_VALIDATOR = v.object({
	summary: v.string(),
	findings: v.array(v.string()),
	actionItems: v.array(
		v.object({
			label: v.string(),
			intent: v.optional(v.string()),
		}),
	),
	confidence: v.union(v.literal("high"), v.literal("medium"), v.literal("low")),
});

export const writeInsight = internalMutation({
	args: {
		orgId: v.id("orgs"),
		userId: v.optional(v.id("users")),
		kind: KIND_VALIDATOR,
		metric: v.optional(v.string()),
		range: v.optional(v.union(v.literal("7d"), v.literal("30d"), v.literal("90d"))),
		recordRef: RECORD_REF_VALIDATOR,
		body: BODY_VALIDATOR,
		modelUsed: v.string(),
		inputTokens: v.optional(v.number()),
		outputTokens: v.optional(v.number()),
	},
	handler: async (ctx, args): Promise<Id<"aiInsights">> => {
		const now = Date.now();
		// Defence-in-depth: the action already validated the body via
		// zod, but we re-validate here so a future caller can't bypass
		// the schema and write garbage.
		InsightBodySchema.parse(args.body);
		return ctx.db.insert("aiInsights", {
			orgId: args.orgId,
			userId: args.userId,
			kind: args.kind,
			metric: args.metric,
			range: args.range,
			recordRef: args.recordRef,
			body: args.body,
			modelUsed: args.modelUsed,
			inputTokens: args.inputTokens,
			outputTokens: args.outputTokens,
			generatedAt: now,
			expiresAt: now + INSIGHTS_TTL_MS,
		});
	},
});

export const __test = {
	InsightBodySchema,
	INSIGHTS_TTL_MS,
};

/**
 * Stage 7 — internal mutation that the `commit_analyze_metric` AI tool
 * calls to fire-and-forget the LLM action. Lives here (not in
 * `actions/analyzeMetric.ts`) because that file is `"use node"` and
 * cannot define mutations.
 *
 * Re-validates membership on the trusted `userId` argument before
 * scheduling so a malformed tool path still fails the auth gate.
 */
export const scheduleAnalyzeMetric = internalMutation({
	args: {
		orgId: v.id("orgs"),
		userId: v.id("users"),
		metric: v.string(),
		range: v.union(v.literal("7d"), v.literal("30d"), v.literal("90d")),
	},
	handler: async (ctx, args) => {
		const { member } = await requireOrgMemberByIds(ctx, args.orgId, args.userId);
		if (!member.permissions.includes("ai.analytics.viewMetrics")) {
			throw new Error("ai.analytics.viewMetrics required");
		}
		await ctx.scheduler.runAfter(0, internal.ai.actions.analyzeMetric.run, {
			orgId: args.orgId,
			userId: args.userId,
			metric: args.metric,
			range: args.range,
		});
		return { scheduled: true };
	},
});
