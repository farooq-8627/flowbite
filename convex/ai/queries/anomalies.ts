/**
 * convex/ai/queries/anomalies.ts
 *
 * Stage 6 of /SPRINT-PLAN.md (Proactive layer) — week-over-week anomaly
 * detection. Pure DB scan, NO LLM call. The model gets the structured
 * deltas via the AI tool `list_pipeline_anomalies` (Stage 6 always-on
 * layer); LLM-narrated commentary is Stage 7's job (Analytical layer).
 *
 * Three signals exposed today:
 *
 *   - pipelineValueDelta: sum(open deal value) this week vs last week.
 *   - newLeadsDelta:      new leads in the trailing 7d vs the prior 7d.
 *   - dealsWonDelta:      deals with `wonAt` in the trailing 7d vs prior.
 *
 * Anomaly threshold: an entry is reported only when |% change| ≥ 10
 * AND the absolute delta is non-trivial. Tunable per metric below.
 */

import { v } from "convex/values";
import { orgQuery, requireOrgMember, requireOrgMemberByIds } from "../../_functions/authenticated";
import type { Doc, Id } from "../../_generated/dataModel";
import { internalQuery, type QueryCtx } from "../../_generated/server";
import { requireRole } from "../../_shared/permissions/helpers";

const ONE_DAY_MS = 24 * 60 * 60 * 1000;
const RANGE_MS: Record<"7d" | "14d" | "30d", number> = {
	"7d": 7 * ONE_DAY_MS,
	"14d": 14 * ONE_DAY_MS,
	"30d": 30 * ONE_DAY_MS,
};

const THRESHOLD_PCT = 10; // any |% change| ≥ this counts as an anomaly
const MIN_PIPELINE_VALUE_DELTA = 100; // currency-units
const MIN_LEADS_DELTA = 1;
const MIN_DEALS_WON_DELTA = 1;

export type AnomalyDirection = "up" | "down";
export type AnomalySeverity = "info" | "warning" | "critical";

export type AnomalyMetric = "pipelineValue" | "newLeads" | "dealsWon";

export type AnomalyRow = {
	metric: AnomalyMetric;
	currentValue: number;
	previousValue: number;
	absoluteDelta: number;
	percentDelta: number;
	direction: AnomalyDirection;
	severity: AnomalySeverity;
	headline: string;
	suggestedIntent: string;
};

// ─── Pure detector — exported for tests ───────────────────────────────────

export function classifySeverity(percentDelta: number): AnomalySeverity {
	const abs = Math.abs(percentDelta);
	if (abs >= 30) return "critical";
	if (abs >= 15) return "warning";
	return "info";
}

function pct(current: number, previous: number): number {
	if (previous === 0) {
		if (current === 0) return 0;
		return 100 * (current > 0 ? 1 : -1);
	}
	return Math.round(((current - previous) / previous) * 100);
}

function describeDir(percentDelta: number): AnomalyDirection {
	return percentDelta >= 0 ? "up" : "down";
}

function buildPipelineRow(current: number, previous: number, currency: string): AnomalyRow | null {
	const absoluteDelta = current - previous;
	const percentDelta = pct(current, previous);
	if (Math.abs(percentDelta) < THRESHOLD_PCT) return null;
	if (Math.abs(absoluteDelta) < MIN_PIPELINE_VALUE_DELTA) return null;
	const direction = describeDir(percentDelta);
	return {
		metric: "pipelineValue",
		currentValue: current,
		previousValue: previous,
		absoluteDelta,
		percentDelta,
		direction,
		severity: classifySeverity(percentDelta),
		headline:
			direction === "up"
				? `Pipeline value up ${percentDelta}% (${currency} ${absoluteDelta.toLocaleString()}) week-over-week.`
				: `Pipeline value down ${Math.abs(percentDelta)}% (${currency} ${Math.abs(absoluteDelta).toLocaleString()}) week-over-week.`,
		suggestedIntent:
			direction === "up"
				? "Show me which deals drove this pipeline-value increase."
				: "Show me which deals slipped this week and help me get them back on track.",
	};
}

function buildLeadsRow(current: number, previous: number): AnomalyRow | null {
	const absoluteDelta = current - previous;
	const percentDelta = pct(current, previous);
	if (Math.abs(percentDelta) < THRESHOLD_PCT) return null;
	if (Math.abs(absoluteDelta) < MIN_LEADS_DELTA) return null;
	const direction = describeDir(percentDelta);
	return {
		metric: "newLeads",
		currentValue: current,
		previousValue: previous,
		absoluteDelta,
		percentDelta,
		direction,
		severity: classifySeverity(percentDelta),
		headline:
			direction === "up"
				? `New leads up ${percentDelta}% (${absoluteDelta} more) week-over-week.`
				: `New leads down ${Math.abs(percentDelta)}% (${Math.abs(absoluteDelta)} fewer) week-over-week.`,
		suggestedIntent:
			direction === "up"
				? "Where are these new leads coming from?"
				: "Audit my lead sources — why are fewer leads coming in this week?",
	};
}

function buildWonRow(current: number, previous: number): AnomalyRow | null {
	const absoluteDelta = current - previous;
	const percentDelta = pct(current, previous);
	if (Math.abs(percentDelta) < THRESHOLD_PCT) return null;
	if (Math.abs(absoluteDelta) < MIN_DEALS_WON_DELTA) return null;
	const direction = describeDir(percentDelta);
	return {
		metric: "dealsWon",
		currentValue: current,
		previousValue: previous,
		absoluteDelta,
		percentDelta,
		direction,
		severity: classifySeverity(percentDelta),
		headline:
			direction === "up"
				? `Deals won up ${percentDelta}% (${absoluteDelta} more) week-over-week.`
				: `Deals won down ${Math.abs(percentDelta)}% (${Math.abs(absoluteDelta)} fewer) week-over-week.`,
		suggestedIntent:
			direction === "up"
				? "What did we do differently to win more deals this week?"
				: "Why did we win fewer deals this week — show me the lost-deal reasons.",
	};
}

export function detectAnomalies(args: {
	now: number;
	currency: string;
	deals: ReadonlyArray<Doc<"deals">>;
	leads: ReadonlyArray<Doc<"leads">>;
	rangeKey: "7d" | "14d" | "30d";
}): AnomalyRow[] {
	const rangeMs = RANGE_MS[args.rangeKey];
	const currentStart = args.now - rangeMs;
	const previousStart = currentStart - rangeMs;
	const previousEnd = currentStart;

	let currentPipeline = 0;
	let previousPipeline = 0;
	let currentWon = 0;
	let previousWon = 0;
	for (const d of args.deals) {
		if (d.deletedAt !== undefined) continue;
		const isOpen = d.wonAt === undefined && d.lostAt === undefined;
		if (isOpen) {
			currentPipeline += d.value ?? 0;
			if ((d.createdAt ?? d._creationTime) < currentStart) {
				previousPipeline += d.value ?? 0;
			}
		}
		if (d.wonAt !== undefined) {
			if (d.wonAt >= currentStart) currentWon += 1;
			else if (d.wonAt >= previousStart && d.wonAt < previousEnd) previousWon += 1;
		}
	}

	let currentLeads = 0;
	let previousLeads = 0;
	for (const l of args.leads) {
		if (l.deletedAt !== undefined) continue;
		const created = l.createdAt ?? l._creationTime;
		if (created >= currentStart) currentLeads += 1;
		else if (created >= previousStart && created < previousEnd) previousLeads += 1;
	}

	const out: AnomalyRow[] = [];
	const pipelineRow = buildPipelineRow(currentPipeline, previousPipeline, args.currency);
	if (pipelineRow) out.push(pipelineRow);
	const leadsRow = buildLeadsRow(currentLeads, previousLeads);
	if (leadsRow) out.push(leadsRow);
	const wonRow = buildWonRow(currentWon, previousWon);
	if (wonRow) out.push(wonRow);

	return out.sort((a, b) => Math.abs(b.percentDelta) - Math.abs(a.percentDelta));
}

// ─── Public + ForAI queries ───────────────────────────────────────────────

async function loadAnomaliesForOrg(
	ctx: QueryCtx,
	orgId: Id<"orgs">,
	rangeKey: "7d" | "14d" | "30d",
) {
	const org = await ctx.db.get(orgId);
	const currency = org?.settings?.defaultCurrency ?? "USD";

	const deals = await ctx.db
		.query("deals")
		.withIndex("by_org", (q) => q.eq("orgId", orgId))
		.take(2000);
	const leads = await ctx.db
		.query("leads")
		.withIndex("by_org", (q) => q.eq("orgId", orgId))
		.take(2000);

	const rows = detectAnomalies({ now: Date.now(), currency, deals, leads, rangeKey });
	return {
		rangeKey,
		currency,
		count: rows.length,
		rows,
	};
}

export const getOrgAnomalies = orgQuery({
	args: {
		orgId: v.id("orgs"),
		range: v.optional(v.union(v.literal("7d"), v.literal("14d"), v.literal("30d"))),
	},
	handler: async (ctx, args) => {
		const { member } = await requireOrgMember(ctx, args.orgId);
		requireRole(member.permissions, "deals.view");
		return loadAnomaliesForOrg(ctx, args.orgId, args.range ?? "7d");
	},
});

export const getOrgAnomaliesForAI = internalQuery({
	args: {
		orgId: v.id("orgs"),
		userId: v.id("users"),
		range: v.optional(v.union(v.literal("7d"), v.literal("14d"), v.literal("30d"))),
	},
	handler: async (ctx, args) => {
		const { member } = await requireOrgMemberByIds(ctx, args.orgId, args.userId);
		requireRole(member.permissions, "deals.view");
		return loadAnomaliesForOrg(ctx, args.orgId, args.range ?? "7d");
	},
});

// ─── Stale records (the §2.1 P-2 surface) ─────────────────────────────────

export type StaleRecord = {
	personCode: string;
	displayName: string;
	daysSinceLastActivity: number;
	suggestedIntent: string;
};

async function loadStaleLeadsForUser(
	ctx: QueryCtx,
	orgId: Id<"orgs">,
	userId: Id<"users">,
	thresholdDays: number,
	limit: number,
): Promise<StaleRecord[]> {
	const cutoff = Date.now() - thresholdDays * ONE_DAY_MS;
	const closed = new Set(["Won", "Lost", "Converted"]);
	const leads = await ctx.db
		.query("leads")
		.withIndex("by_org_and_assignee", (q) => q.eq("orgId", orgId).eq("assignedTo", userId))
		.take(500);
	const stale = leads.filter((l) => {
		if (l.deletedAt !== undefined) return false;
		if (closed.has(l.status)) return false;
		const lastTouch = l.updatedAt ?? l.createdAt ?? Date.now();
		return lastTouch < cutoff;
	});
	stale.sort((a, b) => (a.updatedAt ?? 0) - (b.updatedAt ?? 0));
	const out: StaleRecord[] = [];
	for (const l of stale.slice(0, limit)) {
		const days = Math.floor(
			(Date.now() - (l.updatedAt ?? l.createdAt ?? Date.now())) / ONE_DAY_MS,
		);
		out.push({
			personCode: l.personCode,
			displayName: l.displayName,
			daysSinceLastActivity: days,
			suggestedIntent: `Help me re-engage ${l.personCode} (${l.displayName}) — last contact was ${days} days ago.`,
		});
	}
	return out;
}

export const listStaleLeadsForUser = orgQuery({
	args: {
		orgId: v.id("orgs"),
		thresholdDays: v.optional(v.number()),
		limit: v.optional(v.number()),
	},
	handler: async (ctx, args) => {
		const { userId, member } = await requireOrgMember(ctx, args.orgId);
		requireRole(member.permissions, "leads.view");
		const days = Math.max(1, Math.min(args.thresholdDays ?? 7, 180));
		const limit = Math.max(1, Math.min(args.limit ?? 20, 100));
		const rows = await loadStaleLeadsForUser(ctx, args.orgId, userId, days, limit);
		return { thresholdDays: days, count: rows.length, rows };
	},
});

export const listStaleLeadsForUserForAI = internalQuery({
	args: {
		orgId: v.id("orgs"),
		userId: v.id("users"),
		thresholdDays: v.optional(v.number()),
		limit: v.optional(v.number()),
	},
	handler: async (ctx, args) => {
		const { member } = await requireOrgMemberByIds(ctx, args.orgId, args.userId);
		requireRole(member.permissions, "leads.view");
		const days = Math.max(1, Math.min(args.thresholdDays ?? 7, 180));
		const limit = Math.max(1, Math.min(args.limit ?? 20, 100));
		const rows = await loadStaleLeadsForUser(ctx, args.orgId, args.userId, days, limit);
		return { thresholdDays: days, count: rows.length, rows };
	},
});

// ─── Test exports ─────────────────────────────────────────────────────────

export const __test = {
	classifySeverity,
	detectAnomalies,
	pct,
	THRESHOLD_PCT,
	MIN_PIPELINE_VALUE_DELTA,
};
