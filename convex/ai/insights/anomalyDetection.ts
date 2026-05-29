/**
 * convex/ai/insights/anomalyDetection.ts
 *
 * Stage 5 (`/DASHBOARD-V2-PLAN.md`, locked decision #11) — deterministic
 * anomaly detection. Pure helpers + a per-org scan that returns a
 * capped list of anomaly candidates. The cron in
 * `convex/ai/insights/anomalies.ts` consumes this and writes
 * `dashboardAnnotations` rows.
 *
 * Anomaly kinds (v1):
 *   1. Pipeline velocity drop  — open deal value decreased >= 20 % WoW
 *   2. Conversion rate drop    — won / closed ratio dropped >= 15 pp WoW
 *   3. Stuck deal              — single deal in same stage > 30 days
 *                                AND value > org median
 *   4. Owner inactivity        — assignee has zero won/lost in 30 days
 *                                AND has > 3 open deals
 *
 * Cap: 10 per-org per-day total. The scan returns up to 10 anomaly
 * candidates ordered by severity (critical → warning → info), then by
 * recency. Below the cap, all generated candidates surface; at the cap,
 * "stuck deal" + "owner inactivity" tie-break to whichever is more
 * recent.
 *
 * No "use node" — pure V8 helpers + DB reads.
 */

import type { Doc, Id } from "../../_generated/dataModel";
import type { QueryCtx } from "../../_generated/server";

// ─── Tunable thresholds ──────────────────────────────────────────────────────

const DAY_MS = 24 * 60 * 60 * 1000;
const WEEK_MS = 7 * DAY_MS;
/** Pipeline-velocity drop threshold (fraction). */
const VELOCITY_DROP_FRACTION = 0.2;
/** Conversion-rate drop threshold (percentage points). */
const CONVERSION_DROP_PP = 15;
/** A deal is "stuck" after this many days in the same stage. */
const STUCK_DEAL_DAYS = 30;
/** An owner is "inactive" if they have zero won/lost in this many days. */
const OWNER_INACTIVE_DAYS = 30;
/** And they have more than this many open deals. */
const OWNER_OPEN_DEALS_FLOOR = 3;
/** Daily anomaly cap per org. */
export const DAILY_ANOMALY_CAP_PER_ORG = 10;

// ─── Anomaly candidate shape ─────────────────────────────────────────────────

export type AnomalyCandidate = {
	kind: "pipeline_velocity_drop" | "conversion_rate_drop" | "stuck_deal" | "owner_inactivity";
	severity: "info" | "warning" | "critical";
	widgetKey: string; // empty string = unanchored
	dealId?: Id<"deals">;
	note: string;
	facts?: string[];
	suggestedIntent?: string;
};

const SEVERITY_ORDER: Record<AnomalyCandidate["severity"], number> = {
	critical: 0,
	warning: 1,
	info: 2,
};

// ─── Pure detectors (no DB access) ───────────────────────────────────────────

/**
 * Detect a pipeline-velocity drop. Compares two windows (this week vs
 * last week) of OPEN-deal value and returns a candidate when the drop
 * crosses VELOCITY_DROP_FRACTION.
 */
export function detectVelocityDrop(args: {
	openValueThisWeek: number;
	openValueLastWeek: number;
	currency: string;
}): AnomalyCandidate | null {
	if (args.openValueLastWeek <= 0) return null;
	const drop = (args.openValueLastWeek - args.openValueThisWeek) / args.openValueLastWeek;
	if (drop < VELOCITY_DROP_FRACTION) return null;
	const pct = Math.round(drop * 100);
	const severity: AnomalyCandidate["severity"] =
		drop >= 0.4 ? "critical" : drop >= 0.25 ? "warning" : "info";
	return {
		kind: "pipeline_velocity_drop",
		severity,
		widgetKey: "pipeline.salesPanel",
		note: `Open pipeline value dropped ${pct}% week-over-week.`,
		facts: [
			`Last week: ${formatCurrency(args.openValueLastWeek, args.currency)}`,
			`This week: ${formatCurrency(args.openValueThisWeek, args.currency)}`,
		],
		suggestedIntent: "Show me which deals exited the pipeline this week and explain the drop.",
	};
}

/**
 * Detect a conversion-rate drop (won / (won + lost)) week-over-week.
 */
export function detectConversionDrop(args: {
	wonThisWeek: number;
	lostThisWeek: number;
	wonLastWeek: number;
	lostLastWeek: number;
}): AnomalyCandidate | null {
	const ratio = (won: number, lost: number) => {
		const total = won + lost;
		return total === 0 ? null : (won / total) * 100;
	};
	const thisRate = ratio(args.wonThisWeek, args.lostThisWeek);
	const lastRate = ratio(args.wonLastWeek, args.lostLastWeek);
	if (thisRate === null || lastRate === null) return null;
	const dropPp = lastRate - thisRate;
	if (dropPp < CONVERSION_DROP_PP) return null;
	const severity: AnomalyCandidate["severity"] =
		dropPp >= 30 ? "critical" : dropPp >= 20 ? "warning" : "info";
	return {
		kind: "conversion_rate_drop",
		severity,
		widgetKey: "pipeline.salesPanel",
		note: `Win rate dropped ${Math.round(dropPp)} percentage points week-over-week.`,
		facts: [
			`Last week: ${Math.round(lastRate)}% (${args.wonLastWeek} won / ${args.lostLastWeek} lost)`,
			`This week: ${Math.round(thisRate)}% (${args.wonThisWeek} won / ${args.lostThisWeek} lost)`,
		],
		suggestedIntent:
			"Why did the win rate drop this week? Show me the lost deals from this week.",
	};
}

/**
 * Detect a stuck deal. Pure — caller passes the deal + the org-median
 * open-deal value. Returns a candidate only when the deal has been in
 * the same stage > STUCK_DEAL_DAYS and is above-median value (so the
 * surface stays signal-heavy).
 */
export function detectStuckDeal(args: {
	deal: Doc<"deals">;
	now: number;
	orgMedianValue: number;
}): AnomalyCandidate | null {
	if (args.deal.wonAt || args.deal.lostAt) return null;
	const stageEnteredAt = args.deal.stageEnteredAt ?? args.deal.createdAt ?? 0;
	const stuckDays = (args.now - stageEnteredAt) / DAY_MS;
	if (stuckDays < STUCK_DEAL_DAYS) return null;
	const value = typeof args.deal.value === "number" ? args.deal.value : 0;
	if (args.orgMedianValue > 0 && value < args.orgMedianValue) return null;
	const severity: AnomalyCandidate["severity"] = stuckDays >= 60 ? "critical" : "warning";
	return {
		kind: "stuck_deal",
		severity,
		widgetKey: "pipeline.salesPanel",
		dealId: args.deal._id,
		note: `${args.deal.dealCode} has been stuck in the same stage for ${Math.round(stuckDays)} days.`,
		facts: [
			args.deal.title ? `Deal: ${args.deal.title}` : `Deal code: ${args.deal.dealCode}`,
			`Value: ${formatCurrency(value, args.deal.currency ?? "USD")}`,
		],
		suggestedIntent: `Investigate ${args.deal.dealCode} — what's blocking it?`,
	};
}

/**
 * Detect owner inactivity. Pure — caller passes the owner's recent
 * close stats + their open-deal count.
 */
export function detectOwnerInactivity(args: {
	ownerName: string;
	wonLast30d: number;
	lostLast30d: number;
	openDeals: number;
}): AnomalyCandidate | null {
	const closed = args.wonLast30d + args.lostLast30d;
	if (closed > 0) return null;
	if (args.openDeals <= OWNER_OPEN_DEALS_FLOOR) return null;
	const severity: AnomalyCandidate["severity"] = args.openDeals >= 8 ? "warning" : "info";
	return {
		kind: "owner_inactivity",
		severity,
		widgetKey: "",
		note: `${args.ownerName} hasn't closed a deal in 30 days but holds ${args.openDeals} open deals.`,
		facts: ["Closed last 30d: 0", `Open deals: ${args.openDeals}`],
		suggestedIntent: `Show me ${args.ownerName}'s open deals sorted by stage age.`,
	};
}

// ─── Selection & ranking ─────────────────────────────────────────────────────

/**
 * Apply the per-org cap. Sort by severity (critical → warning → info),
 * stable ordering within the same severity (input order preserved
 * because Array.sort is stable on V8). Caller passes the candidates in
 * the order they were generated.
 */
export function rankAnomalies(candidates: AnomalyCandidate[]): AnomalyCandidate[] {
	const sorted = [...candidates].sort(
		(a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity],
	);
	return sorted.slice(0, DAILY_ANOMALY_CAP_PER_ORG);
}

// ─── Per-org scan: runs every cron tick ──────────────────────────────────────

/**
 * Per-org anomaly scan. Reads what's needed; returns the ranked,
 * capped candidate list. The caller (the cron action) writes them to
 * `dashboardAnnotations`.
 *
 * Skips orgs with < 5 open deals (signal too weak) — caller is expected
 * to pre-filter, but we double-guard here.
 */
export async function scanOrgForAnomalies(
	ctx: QueryCtx,
	args: { orgId: Id<"orgs">; now: number; currency: string },
): Promise<AnomalyCandidate[]> {
	const candidates: AnomalyCandidate[] = [];

	const allDeals = await ctx.db
		.query("deals")
		.withIndex("by_org", (q) => q.eq("orgId", args.orgId))
		.collect();
	const liveDeals = allDeals.filter((d) => !d.deletedAt);
	const openDeals = liveDeals.filter((d) => !d.wonAt && !d.lostAt);

	// Bail out for tiny orgs — anomaly signals are meaningless on
	// fewer than 5 open deals.
	if (openDeals.length < 5) return [];

	const thisWeekStart = args.now - WEEK_MS;
	const lastWeekStart = args.now - 2 * WEEK_MS;

	// ── Pipeline velocity ────────────────────────────────────────────
	const sumOpenAt = (cutoff: number) =>
		liveDeals
			.filter((d) => {
				if (d.wonAt && d.wonAt < cutoff) return false;
				if (d.lostAt && d.lostAt < cutoff) return false;
				return (d.createdAt ?? 0) <= cutoff;
			})
			.reduce((s, d) => s + (typeof d.value === "number" ? d.value : 0), 0);
	const openValueThisWeek = sumOpenAt(args.now);
	const openValueLastWeek = sumOpenAt(thisWeekStart);
	const velocity = detectVelocityDrop({
		openValueThisWeek,
		openValueLastWeek,
		currency: args.currency,
	});
	if (velocity) candidates.push(velocity);

	// ── Conversion rate ──────────────────────────────────────────────
	const wonThisWeek = liveDeals.filter(
		(d) => d.wonAt !== undefined && d.wonAt >= thisWeekStart && d.wonAt <= args.now,
	).length;
	const lostThisWeek = liveDeals.filter(
		(d) => d.lostAt !== undefined && d.lostAt >= thisWeekStart && d.lostAt <= args.now,
	).length;
	const wonLastWeek = liveDeals.filter(
		(d) => d.wonAt !== undefined && d.wonAt >= lastWeekStart && d.wonAt < thisWeekStart,
	).length;
	const lostLastWeek = liveDeals.filter(
		(d) => d.lostAt !== undefined && d.lostAt >= lastWeekStart && d.lostAt < thisWeekStart,
	).length;
	const conversion = detectConversionDrop({
		wonThisWeek,
		lostThisWeek,
		wonLastWeek,
		lostLastWeek,
	});
	if (conversion) candidates.push(conversion);

	// ── Stuck deals ──────────────────────────────────────────────────
	const openValues = openDeals
		.map((d) => (typeof d.value === "number" ? d.value : 0))
		.filter((v) => v > 0)
		.sort((a, b) => a - b);
	const orgMedianValue =
		openValues.length === 0
			? 0
			: openValues.length % 2 === 1
				? openValues[(openValues.length - 1) / 2]
				: (openValues[openValues.length / 2 - 1] + openValues[openValues.length / 2]) / 2;

	for (const deal of openDeals) {
		const stuck = detectStuckDeal({ deal, now: args.now, orgMedianValue });
		if (stuck) candidates.push(stuck);
	}

	// ── Owner inactivity ─────────────────────────────────────────────
	const inactivityWindow = args.now - OWNER_INACTIVE_DAYS * DAY_MS;
	const ownerStats = new Map<
		string,
		{ won: number; lost: number; open: number; userId: Id<"users"> }
	>();
	for (const d of liveDeals) {
		if (!d.assignedTo) continue;
		const k = String(d.assignedTo);
		if (!ownerStats.has(k)) {
			ownerStats.set(k, { won: 0, lost: 0, open: 0, userId: d.assignedTo });
		}
		const b = ownerStats.get(k)!;
		if (d.wonAt && d.wonAt >= inactivityWindow) b.won += 1;
		else if (d.lostAt && d.lostAt >= inactivityWindow) b.lost += 1;
		else if (!d.wonAt && !d.lostAt) b.open += 1;
	}
	for (const [, stats] of ownerStats) {
		if (stats.won + stats.lost > 0) continue;
		if (stats.open <= OWNER_OPEN_DEALS_FLOOR) continue;
		const user = await ctx.db.get(stats.userId);
		const ownerName = user?.name ?? "An assignee";
		const inactivity = detectOwnerInactivity({
			ownerName,
			wonLast30d: stats.won,
			lostLast30d: stats.lost,
			openDeals: stats.open,
		});
		if (inactivity) candidates.push(inactivity);
	}

	return rankAnomalies(candidates);
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatCurrency(value: number, currency: string): string {
	try {
		return new Intl.NumberFormat("en-US", {
			style: "currency",
			currency: currency || "USD",
			maximumFractionDigits: 0,
		}).format(value);
	} catch {
		return `${currency} ${Math.round(value)}`;
	}
}
