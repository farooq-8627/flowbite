/**
 * convex/ai/insights/dealScoring.ts
 *
 * Stage 5 (`/DASHBOARD-V2-PLAN.md`, locked decision #12) — deterministic
 * deal scoring engine. Pure helpers + per-deal scorer. The cron + AI
 * tool are in `dealScores.ts` — this file is the math.
 *
 * Score model (hybrid layer 1 — deterministic, no LLM):
 *   Each deal scores 0..100 across 5 axes, then we take a weighted sum.
 *
 *   1. recency        — last activity within window (exp decay, 30d half-life)
 *   2. stageAge       — penalty for sitting in the same stage too long
 *   3. value          — relative magnitude vs the org's open-deal median
 *   4. ownerVelocity  — owner's last-30d won-deal ratio
 *   5. activityCount  — notes + messages + tasks last 14d
 *
 * The weighted final score is **higher = healthier**. A score of 90 means
 * the deal is moving briskly with high-value work and an active owner.
 * A score of 20 means the deal is stuck, low-value, or quiet.
 *
 * Confidence label:
 *   - high   — owner velocity + recency both >= 50
 *   - medium — at least one of the two >= 30
 *   - low    — both < 30 (we don't have enough signal — usually a brand-new deal)
 *
 * Why deterministic (per locked decision #12):
 *   monday.com's 2026 CRM dashboard guide treats predictive scoring as a
 *   deterministic input, not a generated narrative. Adding an LLM call to
 *   every deal score would cost $$ and produce non-reproducible numbers.
 *   The on-demand "Why?" LLM explainer (in `dealScores.ts`) layers on top.
 *
 * No "use node" — pure V8 helpers; the cron action that calls these is
 * also V8 (cron runner, not streamText).
 */

import type { Id } from "../../_generated/dataModel";
import type { QueryCtx } from "../../_generated/server";

// ─── Tunable constants ────────────────────────────────────────────────────────

/** Component weights — sum to 100. Surface in tests for regression coverage. */
export const SCORE_WEIGHTS = {
	recency: 0.25,
	stageAge: 0.2,
	value: 0.15,
	ownerVelocity: 0.25,
	activityCount: 0.15,
} as const;

/** Recency exponential decay half-life. */
const RECENCY_HALF_LIFE_DAYS = 30;
/** Stuck-in-stage penalty starts after this many days. */
const STAGE_AGE_GRACE_DAYS = 7;
/** Stuck-in-stage component bottoms out at this many days. */
const STAGE_AGE_FLOOR_DAYS = 60;
/** Activity-count component reaches max at this many events. */
const ACTIVITY_COUNT_CEILING = 12;
/** Owner-velocity window. */
const OWNER_VELOCITY_WINDOW_DAYS = 30;
/** Activity-count window. */
const ACTIVITY_WINDOW_DAYS = 14;

const DAY_MS = 24 * 60 * 60 * 1000;

// ─── Pure component scorers (0..100) ──────────────────────────────────────────

/**
 * Recency component. Exponential decay from the most recent activity.
 * `lastActivityAt = undefined` → 0 (never touched). Same activity within
 * the last day → 100. Half-life of 30 days means a 30d-old deal scores
 * 50, a 60d-old deal scores 25, etc.
 */
export function scoreRecency(lastActivityAt: number | undefined, now: number): number {
	if (!lastActivityAt) return 0;
	const ageDays = Math.max(0, (now - lastActivityAt) / DAY_MS);
	const decayed = 100 * 0.5 ** (ageDays / RECENCY_HALF_LIFE_DAYS);
	return clamp(decayed, 0, 100);
}

/**
 * Stage age component. Linear decay starting after a 7-day grace period;
 * floors at 60 days. A deal that just moved into the stage scores 100;
 * a deal that's been in the same stage for 60+ days scores 0.
 */
export function scoreStageAge(stageEnteredAt: number | undefined, now: number): number {
	if (!stageEnteredAt) return 50; // unknown — neutral
	const ageDays = Math.max(0, (now - stageEnteredAt) / DAY_MS);
	if (ageDays <= STAGE_AGE_GRACE_DAYS) return 100;
	const span = STAGE_AGE_FLOOR_DAYS - STAGE_AGE_GRACE_DAYS;
	const t = (ageDays - STAGE_AGE_GRACE_DAYS) / span;
	return clamp(100 * (1 - t), 0, 100);
}

/**
 * Value component. Compares to the org's open-deal median value (passed
 * in by the rebuild action so we don't recompute per deal). A deal at
 * the median scores 50; one at 2× median scores 100; one at 0 scores 0.
 * Linear above median, capped at 2×.
 */
export function scoreValue(dealValue: number | undefined, orgMedianValue: number): number {
	if (orgMedianValue <= 0) return 50; // org has no benchmark — neutral
	const v = Math.max(0, dealValue ?? 0);
	const ratio = v / orgMedianValue;
	if (ratio <= 0) return 0;
	if (ratio >= 2) return 100;
	return clamp(50 * ratio, 0, 100);
}

/**
 * Owner velocity component. Owner's last-30d won-deal ratio
 * (won / (won + lost + still-open)) → 0..100 directly. An owner who
 * hasn't closed anything yet scores 0; an owner closing 50% of their
 * deals scores 50.
 */
export function scoreOwnerVelocity(args: {
	ownerWonLast30d: number;
	ownerLostLast30d: number;
	ownerOpenLast30d: number;
}): number {
	const total = args.ownerWonLast30d + args.ownerLostLast30d + args.ownerOpenLast30d;
	if (total === 0) return 0;
	return clamp((args.ownerWonLast30d / total) * 100, 0, 100);
}

/**
 * Activity count component. Notes + messages + tasks last 14 days.
 * Linear scale up to ACTIVITY_COUNT_CEILING (12 events / 14 days =
 * roughly daily touch).
 */
export function scoreActivityCount(events: number): number {
	const t = Math.min(1, events / ACTIVITY_COUNT_CEILING);
	return clamp(100 * t, 0, 100);
}

// ─── Aggregator ──────────────────────────────────────────────────────────────

export type ScoreComponents = {
	recency: number;
	stageAge: number;
	value: number;
	ownerVelocity: number;
	activityCount: number;
};

export function aggregateScore(c: ScoreComponents): number {
	return clamp(
		c.recency * SCORE_WEIGHTS.recency +
			c.stageAge * SCORE_WEIGHTS.stageAge +
			c.value * SCORE_WEIGHTS.value +
			c.ownerVelocity * SCORE_WEIGHTS.ownerVelocity +
			c.activityCount * SCORE_WEIGHTS.activityCount,
		0,
		100,
	);
}

export function deriveConfidence(c: ScoreComponents): "high" | "medium" | "low" {
	if (c.ownerVelocity >= 50 && c.recency >= 50) return "high";
	if (c.ownerVelocity >= 30 || c.recency >= 30) return "medium";
	return "low";
}

// ─── DB-aware per-deal scorer ────────────────────────────────────────────────

/**
 * Score one deal end-to-end. Returns the components + the rolled-up
 * score + confidence label.
 *
 * Reads:
 *   - deals (the deal row itself)
 *   - notes (last activity + count)
 *   - messages (last activity + count)
 *   - tasks (count, optional last activity)
 *   - deals (org-wide, for owner velocity + median value)
 *
 * Caller is expected to be a V8 query/mutation context — keep reads
 * tight + index-driven so we stay under the per-mutation read cap when
 * the rebuild action loops over an org.
 */
export async function scoreDealForOrg(
	ctx: QueryCtx,
	args: {
		orgId: Id<"orgs">;
		dealId: Id<"deals">;
		now: number;
		/**
		 * Pre-computed org medians + per-owner velocity buckets so the
		 * loop doesn't re-scan the deals table per row. The cron
		 * computes these once per org before scoring deals.
		 */
		orgMedianValue: number;
		ownerVelocityById: Map<string, { won: number; lost: number; open: number }>;
	},
): Promise<{ components: ScoreComponents; score: number; confidence: "high" | "medium" | "low" }> {
	const deal = await ctx.db.get(args.dealId);
	if (!deal) {
		// Caller should not have asked for a missing deal, but never trust
		// upstream — return zeros + low confidence. The cron skips zero-
		// score rows anyway.
		const components: ScoreComponents = {
			recency: 0,
			stageAge: 0,
			value: 0,
			ownerVelocity: 0,
			activityCount: 0,
		};
		return { components, score: 0, confidence: "low" };
	}

	const now = args.now;

	// ── Activity scan: notes + messages + tasks in the last 14 days ─────
	const windowStart = now - ACTIVITY_WINDOW_DAYS * DAY_MS;
	const notes = await ctx.db
		.query("notes")
		.withIndex("by_entity", (q) =>
			q.eq("orgId", args.orgId).eq("entityType", "deal").eq("entityId", args.dealId),
		)
		.collect();
	// `messages` has no compound entity index — use by_org_and_created
	// limited to the activity window so per-deal cost stays bounded
	// (messages older than 14d don't drive the activity-count axis
	// anyway). Filter to this deal's entity in memory.
	const messages = await ctx.db
		.query("messages")
		.withIndex("by_org_and_created", (q) =>
			q.eq("orgId", args.orgId).gte("createdAt", windowStart),
		)
		.filter((q) =>
			q.and(q.eq(q.field("entityType"), "deal"), q.eq(q.field("entityId"), args.dealId)),
		)
		.collect();
	// `tasks` also has no compound entity index — use by_org_and_due
	// (covers ~all tasks since due dates cluster near now) and filter.
	const tasks = await ctx.db
		.query("tasks")
		.withIndex("by_org_and_due", (q) => q.eq("orgId", args.orgId))
		.filter((q) =>
			q.and(q.eq(q.field("entityType"), "deal"), q.eq(q.field("entityId"), args.dealId)),
		)
		.collect();

	const recentNotes = notes.filter((r) => (r.createdAt ?? 0) >= windowStart);
	const recentMessages = messages.filter((r) => (r.createdAt ?? 0) >= windowStart);
	const recentTasks = tasks.filter((r) => (r.createdAt ?? 0) >= windowStart);
	const activityCount = recentNotes.length + recentMessages.length + recentTasks.length;

	// Last activity timestamp across all four sources (deal.updatedAt
	// included so a stage-move counts as activity).
	const lastActivityAt = Math.max(
		deal.updatedAt ?? 0,
		notes.reduce((m, r) => Math.max(m, r.createdAt ?? 0), 0),
		messages.reduce((m, r) => Math.max(m, r.createdAt ?? 0), 0),
		tasks.reduce((m, r) => Math.max(m, r.createdAt ?? 0), 0),
	);

	// Stage entered timestamp — `deal.stageEnteredAt` (required field on
	// the deals table per `convex/schema/crmEntities.ts`).
	const stageEnteredAt = deal.stageEnteredAt ?? deal.createdAt;

	// Owner velocity bucket — keyed on `assignedTo` (the canonical
	// owner field on deals). Owner may not be in the map (no recent
	// activity at all → score 0).
	const ownerKey = deal.assignedTo ? String(deal.assignedTo) : "";
	const ownerBucket = args.ownerVelocityById.get(ownerKey) ?? {
		won: 0,
		lost: 0,
		open: 0,
	};

	const components: ScoreComponents = {
		recency: scoreRecency(lastActivityAt > 0 ? lastActivityAt : undefined, now),
		stageAge: scoreStageAge(stageEnteredAt, now),
		value: scoreValue(deal.value as number | undefined, args.orgMedianValue),
		ownerVelocity: scoreOwnerVelocity({
			ownerWonLast30d: ownerBucket.won,
			ownerLostLast30d: ownerBucket.lost,
			ownerOpenLast30d: ownerBucket.open,
		}),
		activityCount: scoreActivityCount(activityCount),
	};

	return {
		components,
		score: aggregateScore(components),
		confidence: deriveConfidence(components),
	};
}

/**
 * Build the per-org `ownerVelocityById` map in ONE pass over the deals
 * table. Caller passes this into `scoreDealForOrg` for every deal in
 * the org so we don't re-scan the deals table per row.
 *
 * Window: trailing 30 days from `now`. Counts:
 *   - won  — wonAt within window
 *   - lost — lostAt within window
 *   - open — open at end of window AND owner active in window (any
 *            activity timestamp >= windowStart on the deal itself —
 *            createdAt / updatedAt / stageChangedAt)
 */
export async function buildOwnerVelocityMap(
	ctx: QueryCtx,
	args: { orgId: Id<"orgs">; now: number },
): Promise<{
	ownerVelocityById: Map<string, { won: number; lost: number; open: number }>;
	medianValue: number;
}> {
	const map = new Map<string, { won: number; lost: number; open: number }>();
	const allDeals = await ctx.db
		.query("deals")
		.withIndex("by_org", (q) => q.eq("orgId", args.orgId))
		.collect();
	const windowStart = args.now - OWNER_VELOCITY_WINDOW_DAYS * DAY_MS;
	const liveDeals = allDeals.filter((d) => !d.deletedAt);

	for (const d of liveDeals) {
		if (!d.assignedTo) continue;
		const k = String(d.assignedTo);
		if (!map.has(k)) map.set(k, { won: 0, lost: 0, open: 0 });
		const b = map.get(k)!;
		const wonAt = d.wonAt;
		const lostAt = d.lostAt;
		if (wonAt && wonAt >= windowStart) b.won += 1;
		else if (lostAt && lostAt >= windowStart) b.lost += 1;
		else if (!wonAt && !lostAt) {
			const lastTouch = Math.max(d.updatedAt ?? 0, d.stageEnteredAt ?? 0, d.createdAt ?? 0);
			if (lastTouch >= windowStart) b.open += 1;
		}
	}

	// Median open-deal value (used by `scoreValue`).
	const openDealValues = liveDeals
		.filter((d) => !d.wonAt && !d.lostAt)
		.map((d) => (typeof d.value === "number" ? d.value : 0))
		.filter((v) => v > 0)
		.sort((a, b) => a - b);

	const medianValue =
		openDealValues.length === 0
			? 0
			: openDealValues.length % 2 === 1
				? openDealValues[(openDealValues.length - 1) / 2]
				: (openDealValues[openDealValues.length / 2 - 1] +
						openDealValues[openDealValues.length / 2]) /
					2;

	return { ownerVelocityById: map, medianValue };
}

function clamp(v: number, lo: number, hi: number): number {
	if (Number.isNaN(v)) return lo;
	return Math.min(hi, Math.max(lo, v));
}
