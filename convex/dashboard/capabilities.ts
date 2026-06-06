/**
 * Dashboard capabilities — the AI-callable surface for the dashboard
 * write paths shipped under Stage 5 of `DASHBOARD-V2-PLAN.md`. Wraps
 * the existing `*ForAI` internal twins under `convex/dashboard/` +
 * `convex/ai/insights/`; never re-implements business logic.
 *
 * Surface (5 caps in the `dashboard` group):
 *
 *   render_widget        pin an ephemeral widget card to the user's
 *                        dashboard (24h TTL, replaces same-conversation
 *                        prior pin idempotently)
 *   annotate_widget      drop an annotation chip alongside a widget
 *                        (severity-tinted, dismissible per-user)
 *   score_deal           recompute one deal's deterministic score via
 *                        the dealScoring helpers; idempotent upsert
 *   explain_deal_score   run the LLM explainer for a deal's score and
 *                        persist the narrative on the dealScores row
 *   list_anomalies       read + optional refresh of the org's anomaly
 *                        feed (dashboardAnnotations source=cron)
 *
 * Group invariants (mirrored in the playbook below):
 *
 *   1. `render_widget` is per-USER (writes `ephemeralDashboardCells`
 *      keyed on userId). The AI never modifies another user's
 *      dashboard. Title is optional; widgetKey MUST be one of
 *      `WIDGET_KEYS` from `convex/_shared/widgetRegistry.ts`.
 *   2. `annotate_widget` is per-ORG but per-user-dismissible — every
 *      member sees the chip until they dismiss it via the UI. Severity
 *      drives the colour band (info/warning/critical).
 *   3. `score_deal` is `safe` (read-only from a side-effects standpoint
 *      — it WRITES a score row but the underlying signals are pure
 *      reads on deals/activity/etc). It's idempotent; calling twice in
 *      a row produces the same score.
 *   4. `explain_deal_score` calls a `"use node"` action that hits the
 *      configured LLM. Quota-gated implicitly via
 *      `ai.briefingRefresh` permission + the briefing model picker
 *      (BYOK → platform → env). Returns the narrative inline.
 *   5. `list_anomalies` defaults to read-only (returns the org's
 *      current dashboardAnnotations rows). Pass `refresh:true` to
 *      run the on-demand scan (gated on `ai.briefingRefresh`).
 *   6. Permission keys: `ai.use` (render + annotate),
 *      `deals.view` (score), `ai.briefingRefresh` (explain + refresh).
 */
import { z } from "zod";
import { internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import { isWidgetKey } from "../_shared/widgetRegistry";
import { defineCapability } from "../ai/registry/define";
import { defineGroup } from "../ai/registry/groups";
import { failed, ok } from "../ai/registry/result";

// ─── Closed unions ──────────────────────────────────────────────────────────

const SEVERITY = z.enum(["info", "warning", "critical"]);
const ANOMALY_RANGE = z.enum(["7d", "14d", "30d"]);

// ─── Group playbook ─────────────────────────────────────────────────────────

defineGroup({
	name: "dashboard",
	playbook: `Read first → \`list_anomalies\` (org anomaly feed) or \`describe_workspace\` (widget catalogue + active layout). Use the user-facing \`render_widget\` to surface an ephemeral preview card on the user's dashboard; \`annotate_widget\` to drop a chip alongside a widget shell.

Score → \`score_deal\` recomputes ONE deal's deterministic score (recency / stage age / value / owner velocity / activity count). Idempotent. Use after a stage move or large value change. \`explain_deal_score\` runs the LLM explainer; persists the narrative on the score row + returns it inline.

Anomalies → \`list_anomalies\` returns the org's current dashboardAnnotations rows (filtered out per-user-dismissed). Pass \`refresh:true\` to run the on-demand scan (gated on \`ai.briefingRefresh\`).

Widgets must be one of the registered \`WIDGET_KEYS\` (see \`describe_workspace\`); the mutation rejects unknown keys loudly.`,
});

// ─── render_widget ──────────────────────────────────────────────────────────

const renderWidget = defineCapability<{
	widgetKey: string;
	title?: string;
	args?: Record<string, unknown>;
	dataSnapshot?: Record<string, unknown>;
}>({
	name: "render_widget",
	module: "dashboard",
	group: "dashboard",
	permission: "ai.use",
	risk: "reversible",
	channels: ["chat", "mcp", "rest"],
	spec: {
		whenToCall:
			"Pin an ephemeral widget card to the calling user's dashboard (24h TTL). Replaces any prior pin from the same chat thread + widget — re-running the same widget in one conversation does NOT accumulate pins. The user can promote it to a permanent panel via 'Pin to my dashboard'.",
		whenNotToCall:
			"the user wants to ALWAYS see this widget — that's a layout edit (Settings → Dashboard or `update_dashboard_layout`), not an ephemeral pin. The widgetKey isn't registered — call describe_workspace first to discover the catalogue.",
		requiredClarifications: ["widgetKey"],
		synonyms: ["pin widget", "show dashboard card", "render widget"],
		goodExample: {
			widgetKey: "deals.pipeline",
			title: "Q3 push",
			args: { range: "30d" },
		},
		badExample: {
			args: { widgetKey: "made.up.key" },
			why: "widgetKey must be one of the registered keys. Call describe_workspace first.",
		},
	},
	drive: {
		onSuccess: "Confirm in one short sentence — 'Pinned <label> to your dashboard for 24h.'.",
		onValidationError:
			"If widgetKey was rejected, call describe_workspace to enumerate the registered keys.",
	},
	input: z.object({
		widgetKey: z.string().min(1).describe("One of WIDGET_KEYS (see describe_workspace)."),
		title: z.string().max(80).optional().describe("Optional override label for the cell."),
		args: z
			.record(z.string(), z.unknown())
			.optional()
			.describe("Optional widget args (e.g. range filters)."),
		dataSnapshot: z
			.record(z.string(), z.unknown())
			.optional()
			.describe("Optional pre-computed data snapshot (≤4KB serialized)."),
	}),
	run: async (cap, args) => {
		const { ctx, principal, conversationId } = cap;
		if (!isWidgetKey(args.widgetKey)) {
			return failed(
				"needs_repair",
				`Unknown widget '${args.widgetKey}'. Call describe_workspace to enumerate registered keys.`,
			);
		}
		const cellId = (await ctx.runMutation(
			internal.dashboard.ephemeralCells.mutations.pinForAI,
			{
				orgId: principal.orgId,
				userId: principal.userId,
				conversationId,
				widgetKey: args.widgetKey,
				title: args.title,
				args: args.args ?? {},
				dataSnapshot: args.dataSnapshot,
			},
		)) as Id<"ephemeralDashboardCells">;
		return ok({
			headline: `Pinned ${args.title ?? args.widgetKey} to your dashboard for 24h.`,
			changes: [
				{ label: "Widget", value: args.widgetKey, emphasis: "added" },
				...(args.title
					? [{ label: "Title", value: args.title, emphasis: "added" as const }]
					: []),
			],
			data: { cellId, widgetKey: args.widgetKey },
		});
	},
});

// ─── annotate_widget ────────────────────────────────────────────────────────

const annotateWidget = defineCapability<{
	widgetKey?: string;
	dealId?: string;
	severity: "info" | "warning" | "critical";
	note: string;
	facts?: string[];
	suggestedIntent?: string;
}>({
	name: "annotate_widget",
	module: "dashboard",
	group: "dashboard",
	permission: "ai.use",
	risk: "reversible",
	channels: ["chat", "mcp", "rest"],
	spec: {
		whenToCall:
			"Drop a per-org annotation chip alongside a widget OR anchored to a specific deal. Severity drives the colour band (info/warning/critical). Pass `widgetKey` for a widget-anchored chip OR `dealId` for a deal-anchored chip; omitting both attaches it to the org-wide ribbon.",
		whenNotToCall:
			"the user wants a permanent NOTE on a record — call add_note. The user wants a CHAT MESSAGE — call send_message.",
		requiredClarifications: ["severity", "note"],
		synonyms: ["annotation", "chip", "callout", "highlight"],
		goodExample: {
			widgetKey: "deals.pipeline",
			severity: "warning",
			note: "Q3 forecast trending below target — review weekly.",
			facts: ["Forecast at 78% of plan", "3 deals slipped from this quarter"],
		},
	},
	drive: {
		onSuccess: "Confirm with the severity + the widget/deal anchor.",
	},
	input: z.object({
		widgetKey: z.string().optional().describe("Widget shell to anchor the chip to."),
		dealId: z.string().optional().describe("Deal _id to anchor the chip to."),
		severity: SEVERITY,
		note: z.string().min(1).max(200),
		facts: z.array(z.string().max(200)).max(5).optional(),
		suggestedIntent: z.string().max(300).optional(),
	}),
	run: async (cap, args) => {
		const { ctx, principal, conversationId } = cap;
		if (args.widgetKey && !isWidgetKey(args.widgetKey)) {
			return failed(
				"needs_repair",
				`Unknown widget '${args.widgetKey}'. Call describe_workspace to enumerate registered keys.`,
			);
		}
		const annotationId = (await ctx.runMutation(
			internal.dashboard.annotations.mutations.createFromToolForAI,
			{
				orgId: principal.orgId,
				userId: principal.userId,
				conversationId,
				widgetKey: args.widgetKey ?? "",
				dealId: args.dealId as Id<"deals"> | undefined,
				severity: args.severity,
				note: args.note,
				facts: args.facts,
				suggestedIntent: args.suggestedIntent,
			},
		)) as Id<"dashboardAnnotations">;
		return ok({
			headline: `${args.severity[0].toUpperCase() + args.severity.slice(1)} chip pinned${args.widgetKey ? ` to ${args.widgetKey}` : ""}.`,
			changes: [
				{ label: "Severity", value: args.severity, emphasis: "added" },
				{ label: "Note", value: args.note, emphasis: "added" },
			],
			data: { annotationId, severity: args.severity, widgetKey: args.widgetKey },
		});
	},
});

// ─── score_deal ─────────────────────────────────────────────────────────────

const scoreDeal = defineCapability<{ dealCode: string }>({
	name: "score_deal",
	module: "dashboard",
	group: "dashboard",
	permission: "deals.view",
	risk: "safe",
	channels: ["chat", "mcp", "rest"],
	spec: {
		whenToCall:
			"Recompute one deal's deterministic score (0-100) via the org's owner-velocity + value-median signals. Idempotent — re-running yields the same score for the same deal state. Use after a stage move, value change, or activity surge.",
		whenNotToCall:
			"the user wants to know WHY a deal scored that way — call explain_deal_score (1 LLM call). The user wants the org-wide score map — call describe_workspace (the dashboard already shows it).",
		requiredClarifications: ["dealCode"],
		synonyms: ["score deal", "rate deal", "compute deal score", "deal health"],
		goodExample: { dealCode: "D-007" },
	},
	drive: {
		onSuccess: "Reply with the score + confidence + the strongest component.",
		onEmpty:
			"If the deal is closed (won/lost) or soft-deleted, score is null — say so plainly.",
	},
	input: z.object({
		dealCode: z.string().min(1).describe("Public deal code (D-NNN)."),
	}),
	run: async (cap, args) => {
		const { ctx, principal } = cap;

		// Resolve the dealCode → dealId via the standard helper.
		let dealId: Id<"deals">;
		try {
			const resolved = (await ctx.runMutation(internal.ai.aiEntityPatch.resolveEntityCode, {
				orgId: principal.orgId,
				userId: principal.userId,
				entityType: "deal",
				code: args.dealCode,
			})) as { entityId: string };
			dealId = resolved.entityId as Id<"deals">;
		} catch {
			return failed("not_found", `No deal found with code ${args.dealCode}.`);
		}

		const result = (await ctx.runMutation(
			internal.ai.insights.dealScores.scoreSingleDealForAI,
			{
				orgId: principal.orgId,
				userId: principal.userId,
				dealId,
			},
		)) as {
			score: number;
			confidence: "high" | "medium" | "low";
			components: {
				recency: number;
				stageAge: number;
				value: number;
				ownerVelocity: number;
				activityCount: number;
			};
			dealCode: string;
			title: string;
		} | null;

		if (!result) {
			return ok({
				headline: `${args.dealCode} is closed or soft-deleted — no live score.`,
				data: { score: null },
			});
		}

		// Pick strongest component for the headline.
		const entries = Object.entries(result.components) as Array<[string, number]>;
		entries.sort((a, b) => b[1] - a[1]);
		const strongest = entries[0];
		const weakest = entries[entries.length - 1];

		return ok({
			headline: `${args.dealCode} scored ${result.score}/100 (${result.confidence} confidence).`,
			changes: [
				{ label: "Score", value: String(result.score), emphasis: "added" },
				{ label: "Confidence", value: result.confidence, emphasis: "added" },
				{
					label: "Strongest signal",
					value: `${strongest[0]}: ${strongest[1]}`,
					emphasis: "added",
				},
				{
					label: "Weakest signal",
					value: `${weakest[0]}: ${weakest[1]}`,
					emphasis: "added",
				},
			],
			data: result,
			suggestedNext: [
				{
					label: "Explain why",
					intent: `Why did ${args.dealCode} score that way?`,
				},
			],
		});
	},
});

// ─── explain_deal_score ─────────────────────────────────────────────────────

const explainDealScore = defineCapability<{ dealCode: string }>({
	name: "explain_deal_score",
	module: "dashboard",
	group: "dashboard",
	permission: "ai.briefingRefresh",
	risk: "reversible",
	channels: ["chat", "mcp", "rest"],
	spec: {
		whenToCall:
			"Run the LLM explainer for a deal's score. Reads the deterministic score + components, builds a coach-style narrative (2-3 sentences + a concrete next step), persists it to the dealScores row, and returns the text. 1 LLM call per invocation.",
		whenNotToCall:
			"the score isn't computed yet — call score_deal first. The user wants the SCORE itself — score_deal returns it without an LLM call.",
		requiredClarifications: ["dealCode"],
		synonyms: ["explain score", "why this score", "score reasoning"],
		goodExample: { dealCode: "D-007" },
	},
	drive: {
		onSuccess: "Surface the narrative inline — the chat card carries the full text.",
		onDenied:
			"Tell the user they need ai.briefingRefresh to run the explainer (Owner / Admin by default).",
	},
	input: z.object({
		dealCode: z.string().min(1),
	}),
	run: async (cap, args) => {
		const { ctx, principal } = cap;

		// Resolve dealCode → dealId.
		let dealId: Id<"deals">;
		try {
			const resolved = (await ctx.runMutation(internal.ai.aiEntityPatch.resolveEntityCode, {
				orgId: principal.orgId,
				userId: principal.userId,
				entityType: "deal",
				code: args.dealCode,
			})) as { entityId: string };
			dealId = resolved.entityId as Id<"deals">;
		} catch {
			return failed("not_found", `No deal found with code ${args.dealCode}.`);
		}

		const result = (await ctx.runAction(internal.ai.insights.explainDealScore.run, {
			orgId: principal.orgId,
			userId: principal.userId,
			dealId,
		})) as { ok: true; text: string; modelUsed?: string } | { ok: false; error: string };

		if (!result.ok) {
			return failed("business_error", result.error);
		}

		return ok({
			headline: `Why ${args.dealCode} scored that way:`,
			facts: [result.text],
			data: { dealCode: args.dealCode, text: result.text, modelUsed: result.modelUsed },
		});
	},
});

// ─── list_anomalies ─────────────────────────────────────────────────────────

const listAnomalies = defineCapability<{
	range?: "7d" | "14d" | "30d";
	refresh?: boolean;
}>({
	name: "list_anomalies",
	module: "dashboard",
	group: "dashboard",
	permission: "deals.view",
	risk: "safe",
	channels: ["chat", "mcp", "rest"],
	spec: {
		whenToCall:
			"Read the org's current anomaly feed (stuck deals, stale leads, value spikes/drops). Pass `refresh:true` to run the on-demand scan (gated on `ai.briefingRefresh`); otherwise reads the last cron snapshot.",
		whenNotToCall: "the user wants to dismiss an anomaly — that's a per-user UI dismissal.",
		synonyms: ["anomalies", "what's odd", "what's stuck", "warning signals"],
		goodExample: { range: "7d", refresh: false },
	},
	drive: {
		onSuccess:
			"Narrate the count + the top 3 by severity. The result card carries the full list.",
		onEmpty: "No anomalies in the selected range — workspace looks healthy.",
	},
	input: z.object({
		range: ANOMALY_RANGE.optional(),
		refresh: z
			.boolean()
			.optional()
			.describe("Force a fresh scan (requires ai.briefingRefresh)."),
	}),
	run: async (cap, args) => {
		const { ctx, principal } = cap;

		let refreshed = 0;
		if (args.refresh) {
			const refreshResult = (await ctx.runMutation(
				internal.ai.insights.anomalies.refreshForOrgForAI,
				{
					orgId: principal.orgId,
					userId: principal.userId,
				},
			)) as { written: number; skipped?: string };
			refreshed = refreshResult.written ?? 0;
		}

		const result = (await ctx.runQuery(internal.ai.queries.anomalies.getOrgAnomaliesForAI, {
			orgId: principal.orgId,
			userId: principal.userId,
			range: args.range,
		})) as {
			rangeKey: string;
			currency: string;
			count: number;
			rows: Array<{
				metric: string;
				severity: string;
				headline: string;
				suggestedIntent: string;
			}>;
		};

		if (result.count === 0) {
			return ok({
				headline:
					refreshed > 0
						? `Refreshed — no anomalies in the last ${args.range ?? "7d"}.`
						: `No anomalies in the last ${args.range ?? "7d"}.`,
				data: { ...result, refreshed },
			});
		}
		return ok({
			headline: `${result.count} anomal${result.count === 1 ? "y" : "ies"} in the last ${args.range ?? "7d"}${refreshed > 0 ? ` (just refreshed)` : ""}.`,
			changes: result.rows.slice(0, 5).map((r) => ({
				label: r.severity,
				value: r.headline,
				emphasis: "unchanged" as const,
			})),
			data: { ...result, refreshed },
		});
	},
});

// ─── Public surface ─────────────────────────────────────────────────────────

export const DASHBOARD_CAPABILITIES = [
	renderWidget,
	annotateWidget,
	scoreDeal,
	explainDealScore,
	listAnomalies,
];
