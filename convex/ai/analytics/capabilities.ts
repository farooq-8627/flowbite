/**
 * Analytics capabilities — the AI-callable surface for the analytical
 * read paths (briefings, cohorts, member performance, pipeline velocity,
 * insights, anomalies) and the LLM-narrated `analyze_metric` action.
 * Wraps the existing `*ForAI` internal twins under
 * `convex/ai/{queries,actions}/` + `convex/ai/briefingsPublic.ts`;
 * never re-implements business logic.
 *
 * Surface (7 caps in the `analytics` group):
 *
 *   analyze_metric        LLM-narrated metric analysis (writes insights row)
 *   cohort_analysis       latest cohort summary (lead-source / industry / owner)
 *   member_performance    per-member rollup over a range
 *   pipeline_velocity     org-wide pipeline velocity rollup
 *   list_insights         recent aiInsights rows (metric / retrospective / cohort)
 *   get_briefing          latest daily briefing (user) + weekly insight (org)
 *   refresh_briefing      manually trigger a fresh daily briefing
 *
 * Group invariants (mirrored in the playbook):
 *
 *   1. EVERY analytics read returns DETERMINISTIC data — no LLM call —
 *      EXCEPT `analyze_metric` (1 LLM call, persists narrative) and
 *      `refresh_briefing` (schedules an action that does 1 LLM call).
 *      Reads NEVER block on model availability; the LLM-using verbs
 *      surface a friendly fallback when no key is configured.
 *   2. `analyze_metric` is `reversible` because it INSERTS an
 *      aiInsights row (the LLM call itself is read-only). Re-running
 *      with the same metric returns a fresh row — caller dedup is
 *      via the daily cap (`ANALYZE_METRIC_DAILY_CAP`).
 *   3. Permission keys: `ai.analytics.viewMetrics` (insights + analyze),
 *      `ai.cohorts.view` (cohorts), `members.viewPerformance`
 *      (member_performance), `deals.view` (pipeline_velocity),
 *      `ai.briefingRefresh` (refresh_briefing).
 *   4. `get_briefing` defaults to `scope: "today"` (the calling user's
 *      latest daily briefing) — pass `scope: "thisWeek"` for the
 *      weekly-org row (visible to every org member, not user-scoped).
 */
import { z } from "zod";
import { internal } from "../../_generated/api";
import { defineCapability } from "../registry/define";
import { defineGroup } from "../registry/groups";
import { failed, ok } from "../registry/result";

// ─── Closed unions ──────────────────────────────────────────────────────────

const ANALYZE_RANGE = z.enum(["7d", "30d", "90d"]);
const PERFORMANCE_RANGE = z.enum(["7d", "30d", "90d"]);
const COHORT_KIND = z.enum(["leadSource", "industry", "owner"]);
const INSIGHT_KIND = z.enum(["metric_analysis", "deal_retrospective", "cohort_summary"]);
const BRIEFING_SCOPE = z.enum(["today", "thisWeek"]);

// ─── Group playbook ─────────────────────────────────────────────────────────

defineGroup({
	name: "analytics",
	playbook: `Read first → \`get_briefing\` for a one-shot summary of the user's day / week, \`list_insights\` for recent narrated analyses, \`pipeline_velocity\` for the deal-flow rollup, \`cohort_analysis\` / \`member_performance\` for the canned rollups.

Narrate → \`analyze_metric\` runs the LLM on a single metric (e.g. "AI calls per day"). Persists an \`aiInsights\` row + returns the narrative inline. Daily-capped per org; the deterministic fallback ships when the cap is hit OR no key is configured.

Refresh → \`refresh_briefing\` schedules a fresh daily briefing for the calling user. Rate-limited to 5/min/user-org. The action writes the row asynchronously; the user sees it on the next reactive cycle.

Permission gates are tight — \`ai.analytics.viewMetrics\` for insights + analyze, \`ai.cohorts.view\` for cohorts, \`members.viewPerformance\` for member_performance, \`deals.view\` for pipeline_velocity. \`ai.briefingRefresh\` for refresh.`,
});

// ─── analyze_metric ─────────────────────────────────────────────────────────

const analyzeMetric = defineCapability<{
	metric: string;
	range?: "7d" | "30d" | "90d";
}>({
	name: "analyze_metric",
	module: "analytics",
	group: "analytics",
	permission: "ai.analytics.viewMetrics",
	risk: "reversible",
	channels: ["chat", "mcp", "rest"],
	spec: {
		whenToCall:
			"LLM-narrate a single metric over a range (default 30d). Persists an `aiInsights` row + returns the narrative. Daily-capped per org; the deterministic fallback narrative ships when the cap is hit OR no model key is configured.",
		whenNotToCall:
			"the user wants a CANNED rollup — call cohort_analysis / member_performance / pipeline_velocity (cheaper, no LLM). The user wants the WEEKLY org insight — call get_briefing with scope='thisWeek'.",
		requiredClarifications: ["metric"],
		synonyms: ["narrate metric", "analyze metric", "explain metric trend"],
		goodExample: { metric: "deals.won", range: "30d" },
	},
	drive: {
		onSuccess: "Surface the narrative inline; the result card carries the insight _id.",
	},
	input: z.object({
		metric: z.string().min(1).describe("Metric key (e.g. 'deals.won', 'leads.created')."),
		range: ANALYZE_RANGE.optional(),
	}),
	run: async (cap, args) => {
		const { ctx, principal } = cap;
		const result = (await ctx.runAction(internal.ai.actions.analyzeMetric.run, {
			orgId: principal.orgId,
			userId: principal.userId,
			metric: args.metric,
			range: args.range,
		})) as { insightId: string; cached: false };

		return ok({
			headline: `Insight written for ${args.metric} (${args.range ?? "30d"}).`,
			data: { insightId: result.insightId, metric: args.metric, range: args.range ?? "30d" },
			display: { kind: "insight", insightId: result.insightId },
			suggestedNext: [
				{
					label: "List recent insights",
					intent: "Show the recent AI insights",
				},
			],
		});
	},
});

// ─── cohort_analysis ────────────────────────────────────────────────────────

const cohortAnalysis = defineCapability<{ kind: "leadSource" | "industry" | "owner" }>({
	name: "cohort_analysis",
	module: "analytics",
	group: "analytics",
	permission: "ai.cohorts.view",
	risk: "safe",
	channels: ["chat", "mcp", "rest"],
	spec: {
		whenToCall:
			"Read the latest cohort rollup for one of: `leadSource` (which channels convert), `industry` (verticals leading), `owner` (per-rep cohort). Backed by the nightly `rebuildCohorts` action; reads the cached row.",
		whenNotToCall:
			"the user wants a per-member breakdown (member_performance is denser) or a pipeline-flow rollup (pipeline_velocity).",
		requiredClarifications: ["kind"],
		synonyms: ["cohort", "by source", "by industry", "by owner"],
		goodExample: { kind: "leadSource" },
	},
	drive: {
		onSuccess: "Narrate the top 3 cohorts by win-rate; the result card carries the full table.",
		onEmpty: "No cohort data yet — the nightly cron hasn't populated this kind for the org.",
	},
	input: z.object({
		kind: COHORT_KIND,
	}),
	run: async (cap, args) => {
		const { ctx, principal } = cap;
		const cohort = (await ctx.runQuery(internal.ai.queries.cohorts.getLatestCohortForAI, {
			orgId: principal.orgId,
			userId: principal.userId,
			kind: args.kind,
		})) as {
			kind: string;
			rows: Array<{ key: string; count: number; winRate?: number }>;
		} | null;
		if (!cohort) {
			return ok({
				headline: `No ${args.kind} cohort data available yet.`,
				data: null,
			});
		}
		const top = (cohort.rows ?? []).slice(0, 5);
		return ok({
			headline: `${args.kind} cohort — ${cohort.rows.length} bucket${cohort.rows.length === 1 ? "" : "s"}.`,
			changes: top.map((r) => ({
				label: r.key,
				value: `${r.count} record${r.count === 1 ? "" : "s"}${r.winRate !== undefined ? ` · ${(r.winRate * 100).toFixed(1)}% win` : ""}`,
				emphasis: "unchanged" as const,
			})),
			data: cohort,
		});
	},
});

// ─── member_performance ─────────────────────────────────────────────────────

const memberPerformance = defineCapability<{ range?: "7d" | "30d" | "90d" }>({
	name: "member_performance",
	module: "analytics",
	group: "analytics",
	permission: "members.viewPerformance",
	risk: "safe",
	channels: ["chat", "mcp", "rest"],
	spec: {
		whenToCall:
			"Read the per-member performance rollup over the last `range` window (default 30d). Returns one row per member with deals-won / leads-converted / activity-count.",
		whenNotToCall:
			"the user wants a per-COHORT view (cohort_analysis with kind:'owner' is similar but cohort-shaped) or a single-member drill-down (combine list_tasks + list_org_notes per-user).",
		synonyms: ["who's winning", "team performance", "leaderboard"],
		goodExample: { range: "30d" },
	},
	drive: {
		onSuccess: "Narrate the top 3 by deals-won. The result card carries the full table.",
		onEmpty: "No performance data yet — the workspace may have no closed deals in the range.",
	},
	input: z.object({
		range: PERFORMANCE_RANGE.optional(),
	}),
	run: async (cap, args) => {
		const { ctx, principal } = cap;
		const result = (await ctx.runQuery(
			internal.ai.queries.memberPerformance.getMemberPerformanceForAI,
			{
				orgId: principal.orgId,
				userId: principal.userId,
				range: args.range,
			},
		)) as {
			rangeKey: string;
			rows: Array<{
				userId: string;
				name?: string;
				dealsWon?: number;
				activityCount?: number;
			}>;
		} | null;
		if (!result) {
			return failed(
				"denied",
				"You don't have permission to view member performance (requires: members.viewPerformance).",
			);
		}
		if (result.rows.length === 0) {
			return ok({
				headline: `No member performance data for the last ${result.rangeKey}.`,
				data: result,
			});
		}
		const top = [...result.rows]
			.sort((a, b) => (b.dealsWon ?? 0) - (a.dealsWon ?? 0))
			.slice(0, 5);
		return ok({
			headline: `${result.rows.length} member${result.rows.length === 1 ? "" : "s"} ranked over ${result.rangeKey}.`,
			changes: top.map((m) => ({
				label: m.name ?? m.userId,
				value: `${m.dealsWon ?? 0} won · ${m.activityCount ?? 0} activities`,
				emphasis: "unchanged" as const,
			})),
			data: result,
		});
	},
});

// ─── pipeline_velocity ──────────────────────────────────────────────────────

const pipelineVelocity = defineCapability<Record<string, never>>({
	name: "pipeline_velocity",
	module: "analytics",
	group: "analytics",
	permission: "deals.view",
	risk: "safe",
	channels: ["chat", "mcp", "rest"],
	spec: {
		whenToCall:
			"Read the org-wide pipeline-velocity rollup — for each pipeline, average days-in-stage + deal-flow counts. Drives the dashboard's velocity tab.",
		whenNotToCall:
			"the user wants a per-deal score — call score_deal. The user wants forecast revisions — that's the `revise_forecast` v2 backlog item (B.34).",
		synonyms: ["pipeline velocity", "deal flow", "stage velocity", "days in stage"],
		goodExample: {},
	},
	drive: {
		onSuccess: "Narrate per-pipeline avg-days-in-stage. The result card carries the breakdown.",
	},
	input: z.object({}),
	run: async (cap) => {
		const { ctx, principal } = cap;
		const result = (await ctx.runQuery(
			internal.ai.queries.pipelineVelocity.getOrgPipelineVelocityForAI,
			{
				orgId: principal.orgId,
				userId: principal.userId,
			},
		)) as {
			pipelines: Array<{
				pipelineCode?: string;
				pipelineName?: string;
				avgDays?: number;
				deals?: number;
			}>;
			generatedAt: number;
		};
		if (result.pipelines.length === 0) {
			return ok({
				headline: "No pipeline-velocity data yet.",
				data: result,
			});
		}
		return ok({
			headline: `${result.pipelines.length} pipeline${result.pipelines.length === 1 ? "" : "s"} measured.`,
			changes: result.pipelines.slice(0, 5).map((p) => ({
				label: p.pipelineName ?? p.pipelineCode ?? "(unnamed)",
				value: `avg ${(p.avgDays ?? 0).toFixed(1)}d/stage · ${p.deals ?? 0} deals`,
				emphasis: "unchanged" as const,
			})),
			data: result,
		});
	},
});

// ─── list_insights ──────────────────────────────────────────────────────────

const listInsights = defineCapability<{
	kind?: "metric_analysis" | "deal_retrospective" | "cohort_summary";
	limit?: number;
}>({
	name: "list_insights",
	module: "analytics",
	group: "analytics",
	permission: "ai.analytics.viewMetrics",
	risk: "safe",
	channels: ["chat", "mcp", "rest"],
	spec: {
		whenToCall:
			"List recent `aiInsights` rows for the org. Filter by `kind` (metric / retrospective / cohort). Use to surface insights the AI has already written without re-running an LLM.",
		whenNotToCall: "the user wants a FRESH analysis — call analyze_metric.",
		synonyms: ["recent insights", "list AI analyses", "show insights"],
		goodExample: { kind: "metric_analysis", limit: 10 },
	},
	drive: {
		onSuccess: "Narrate the count + top 3 by recency.",
		onEmpty: "No insights yet — call analyze_metric to generate one.",
	},
	input: z.object({
		kind: INSIGHT_KIND.optional(),
		limit: z.number().int().min(1).max(50).optional().default(10),
	}),
	run: async (cap, args) => {
		const { ctx, principal } = cap;
		const result = (await ctx.runQuery(internal.ai.queries.insights.listInsightsForAI, {
			orgId: principal.orgId,
			userId: principal.userId,
			kind: args.kind,
			limit: args.limit,
		})) as { count: number; rows: Array<{ id: string; kind: string; generatedAt: number }> };
		if (result.count === 0) {
			return ok({
				headline: "No insights yet.",
				data: result,
			});
		}
		return ok({
			headline: `${result.count} insight${result.count === 1 ? "" : "s"}${args.kind ? ` (${args.kind})` : ""}.`,
			changes: result.rows.slice(0, 5).map((r) => ({
				label: r.kind,
				value: new Date(r.generatedAt).toISOString().slice(0, 10),
				emphasis: "unchanged" as const,
			})),
			data: result,
		});
	},
});

// ─── get_briefing ───────────────────────────────────────────────────────────

const getBriefing = defineCapability<{ scope?: "today" | "thisWeek" }>({
	name: "get_briefing",
	module: "analytics",
	group: "analytics",
	permission: "ai.use",
	risk: "safe",
	channels: ["chat", "mcp", "rest"],
	spec: {
		whenToCall:
			"Read the latest unexpired briefing. `scope:'today'` (default) returns the user's daily briefing; `scope:'thisWeek'` returns the org's weekly insight (visible to every member).",
		whenNotToCall:
			"the user wants to FORCE a refresh — call refresh_briefing. The user wants a per-metric narrative — call analyze_metric.",
		synonyms: ["my briefing", "what's the daily", "this week's insight"],
		goodExample: { scope: "today" },
	},
	drive: {
		onSuccess: "Surface the briefing summary inline.",
		onEmpty: "No briefing yet — call refresh_briefing to generate one.",
	},
	input: z.object({
		scope: BRIEFING_SCOPE.optional(),
	}),
	run: async (cap, args) => {
		const { ctx, principal } = cap;
		const scope = args.scope ?? "today";
		if (scope === "today") {
			const briefing = (await ctx.runQuery(internal.ai.briefingsPublic.todayForUserForAI, {
				orgId: principal.orgId,
				userId: principal.userId,
			})) as { _id: string; summary?: string; generatedAt: number } | null;
			if (!briefing) {
				return ok({
					headline: "No daily briefing available yet.",
					data: null,
				});
			}
			return ok({
				headline: "Today's briefing.",
				facts: briefing.summary ? [briefing.summary] : undefined,
				data: briefing,
			});
		}
		const briefing = (await ctx.runQuery(internal.ai.briefingsPublic.thisWeekForOrgForAI, {
			orgId: principal.orgId,
			userId: principal.userId,
		})) as { _id: string; summary?: string; generatedAt: number } | null;
		if (!briefing) {
			return ok({
				headline: "No weekly briefing available yet.",
				data: null,
			});
		}
		return ok({
			headline: "This week's org insight.",
			facts: briefing.summary ? [briefing.summary] : undefined,
			data: briefing,
		});
	},
});

// ─── refresh_briefing ───────────────────────────────────────────────────────

const refreshBriefing = defineCapability<Record<string, never>>({
	name: "refresh_briefing",
	module: "analytics",
	group: "analytics",
	permission: "ai.briefingRefresh",
	risk: "reversible",
	channels: ["chat", "mcp", "rest"],
	spec: {
		whenToCall:
			"Schedule a fresh daily briefing for the calling user. Rate-limited to 5/min/user-org. Returns immediately; the briefing lands on the next reactive cycle.",
		whenNotToCall:
			"the user wants the WEEKLY org insight regenerated — that's gated on a separate per-day rate-limit (not yet exposed here).",
		synonyms: ["refresh briefing", "regenerate briefing", "new briefing"],
		goodExample: {},
	},
	drive: {
		onSuccess: "Confirm the briefing is being regenerated.",
		onDenied: "Tell the user they need ai.briefingRefresh (Owner / Admin by default).",
	},
	input: z.object({}),
	run: async (cap) => {
		const { ctx, principal } = cap;
		await ctx.runMutation(internal.ai.briefingsPublic.refreshNowForAI, {
			orgId: principal.orgId,
			userId: principal.userId,
		});
		return ok({
			headline: "Briefing refresh scheduled — should land in a few seconds.",
			data: { scheduled: true },
		});
	},
});

// ─── Public surface ─────────────────────────────────────────────────────────

export const ANALYTICS_CAPABILITIES = [
	analyzeMetric,
	cohortAnalysis,
	memberPerformance,
	pipelineVelocity,
	listInsights,
	getBriefing,
	refreshBriefing,
];
