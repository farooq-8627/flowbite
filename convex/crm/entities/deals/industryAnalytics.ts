/**
 * convex/crm/entities/deals/industryAnalytics.ts
 *
 * Stage 4 of /DASHBOARD-V2-PLAN.md (2026-05-29) — backend rollups for
 * the three new per-industry widgets:
 *
 *   - `<InvoiceAgingWidget>` (freelancer / agency) → `getInvoiceAging`.
 *   - `<PropertyFunnelWidget>` (real-estate)     → `getPropertyFunnel`.
 *   - `<ARRCohortWidget>` (B2B SaaS)             → `getArrCohort`.
 *
 * Every query is a pure deterministic rollup — NO LLM. Each ships a
 * public `orgQuery` + an internal `*ForAI` twin per AGENTS.md
 * non-negotiable so a future Stage 5 `render_widget` AI tool can
 * surface these aggregations without auth-propagation issues.
 *
 * Why a separate file (not an extension of `pipelineForecast.ts`):
 * the velocity / forecast file owns ONE rollup tied to the Sales
 * Pipeline Panel. These three are orthogonal industry-flavoured rollups
 * each backing a distinct widget. Co-locating them per-industry would
 * scatter the deals-only aggregation surface across three files; one
 * shared file keeps the pure helpers + the auth wiring next to each
 * other.
 *
 * Production references —
 *   - Invoice aging buckets: standard accounts-receivable practice
 *     (0-30 / 31-60 / 61-90 / 91+). We compress to 4 buckets at
 *     calendar-day boundaries (0-7 / 8-14 / 15-30 / 30+) because solo
 *     freelancers don't need 90-day windows.
 *   - Funnel chart: Attio Reporting 2.0's "Funnel" report type
 *     (https://attio.com/blog/reporting-2-0).
 *   - Cohort chart: monday.com 2026 CRM dashboard guide §"Customer
 *     Lifecycle Dashboards"
 *     (https://monday.com/blog/project-management/crm-dashboards/).
 */

import { v } from "convex/values";
import {
	orgQuery,
	requireOrgMember,
	requireOrgMemberByIds,
} from "../../../_functions/authenticated";
import type { Doc, Id } from "../../../_generated/dataModel";
import { internalQuery, type QueryCtx } from "../../../_generated/server";

// ─── Constants ──────────────────────────────────────────────────────────

const ONE_DAY_MS = 24 * 60 * 60 * 1000;
const COHORT_MONTHS = 6;
const ARR_WINDOW_MS = 200 * ONE_DAY_MS; // ~6.5 months — pulls every wonAt that could land in the last 6 calendar buckets

/**
 * Stage codes / names that the invoice-aging widget treats as
 * "currently invoiced and awaiting payment". Templates that opt into
 * the widget should ship at least one stage matching one of these
 * codes (or a stage whose name matches the regex). The freelancer
 * template uses `INV`, the agency template uses `INVOICED`.
 *
 * Codes are matched case-insensitively against `stage.code`. Names are
 * matched against `stage.name` via the regex below.
 */
const INVOICE_STAGE_CODES = new Set(["INV", "INVOICED", "AWAITING_PAYMENT", "AWAITPAY"]);
const INVOICE_STAGE_NAME_RE = /\b(invoice|invoiced|awaiting\s*payment)\b/i;

/** Bucket boundaries in days. Anything ≥30 days falls into the 30+ bucket. */
const AGING_BUCKETS = [
	{ id: "0-7", maxDays: 7, label: "0–7 days" },
	{ id: "8-14", maxDays: 14, label: "8–14 days" },
	{ id: "15-30", maxDays: 30, label: "15–30 days" },
	{ id: "30+", maxDays: Infinity, label: "30+ days" },
] as const;

// ─── Public types ───────────────────────────────────────────────────────

export type InvoiceAgingBucket = {
	id: "0-7" | "8-14" | "15-30" | "30+";
	label: string;
	count: number;
	value: number;
};

export type InvoiceAgingResult = {
	currency: string;
	total: { count: number; value: number };
	buckets: InvoiceAgingBucket[];
	/** Top-5 most-overdue invoices (by daysInStage desc). */
	mostOverdue: Array<{
		dealId: Id<"deals">;
		dealCode: string;
		title: string;
		value: number;
		daysInStage: number;
		stageEnteredAt: number;
	}>;
	generatedAt: number;
};

export type PropertyFunnelStage = {
	stageId: string;
	stageName: string;
	stageCode: string;
	color?: string;
	count: number;
	value: number;
	/** Width relative to the largest non-final stage (0..1) — drives bar rendering. */
	relativeWidth: number;
	/** Cumulative dropoff from the leading stage to this one, %. */
	dropoffPct: number;
};

export type PropertyFunnelResult = {
	pipelineId: Id<"pipelines">;
	pipelineName: string;
	currency: string;
	stages: PropertyFunnelStage[];
	totals: { open: number; openValue: number; won: number; wonValue: number };
	generatedAt: number;
};

export type ArrCohortBucket = {
	/** ISO month string YYYY-MM matching the cohort. */
	month: string;
	/** Bucket-end timestamp (last day of the month, inclusive). */
	t: number;
	count: number;
	value: number;
};

export type ArrCohortResult = {
	currency: string;
	totals: { count: number; value: number };
	buckets: ArrCohortBucket[];
	generatedAt: number;
};

// ─── Pure helpers (testable in isolation, no DB access) ─────────────────

/** Decide which bucket a `daysInStage` value falls into. Pure. */
export function bucketForDays(daysInStage: number): InvoiceAgingBucket["id"] {
	for (const b of AGING_BUCKETS) {
		if (daysInStage <= b.maxDays) return b.id;
	}
	return "30+";
}

/** Produce a fresh bucket array seeded with zero counts/values. Pure. */
export function emptyAgingBuckets(): InvoiceAgingBucket[] {
	return AGING_BUCKETS.map((b) => ({
		id: b.id,
		label: b.label,
		count: 0,
		value: 0,
	}));
}

/**
 * True if a stage looks like an "invoiced / awaiting-payment" stage.
 * Treats the `code` as authoritative; falls back to the localised
 * `name` regex when no code match. Pure.
 */
export function isInvoiceStage(stage: { code: string; name: string }): boolean {
	if (INVOICE_STAGE_CODES.has(stage.code.toUpperCase())) return true;
	return INVOICE_STAGE_NAME_RE.test(stage.name);
}

/** Build a stable monthly cohort key (YYYY-MM, UTC). Pure. */
export function monthKey(t: number): string {
	const d = new Date(t);
	const y = d.getUTCFullYear();
	const m = String(d.getUTCMonth() + 1).padStart(2, "0");
	return `${y}-${m}`;
}

/** Build the trailing 6-month bucket array oldest→newest. Pure. */
export function buildArrCohortBuckets(now: number): ArrCohortBucket[] {
	const out: ArrCohortBucket[] = [];
	const ref = new Date(now);
	for (let i = COHORT_MONTHS - 1; i >= 0; i--) {
		const d = new Date(Date.UTC(ref.getUTCFullYear(), ref.getUTCMonth() - i + 1, 0));
		const month = monthKey(d.getTime());
		out.push({ month, t: d.getTime(), count: 0, value: 0 });
	}
	return out;
}

/**
 * Compute funnel stage-by-stage counts + dropoff%. Pure.
 *
 * Strategy: drop final stages from the funnel, sort the remaining
 * stages by `order`, and walk in order accumulating the dropoff %
 * relative to the FIRST non-final stage's count. The bar's
 * `relativeWidth` is each stage's count divided by the leading stage's
 * count (clamped to [0,1]).
 */
export function computePropertyFunnel(args: {
	pipeline: Doc<"pipelines">;
	openDeals: readonly Doc<"deals">[];
}): { stages: PropertyFunnelStage[]; openValue: number; openCount: number } {
	const stages = [...args.pipeline.stages]
		.filter((s) => s.isFinal !== true)
		.sort((a, b) => a.order - b.order);

	const countByStage = new Map<string, { count: number; value: number }>();
	for (const s of stages) countByStage.set(s.id, { count: 0, value: 0 });

	let totalOpen = 0;
	let totalOpenValue = 0;
	for (const d of args.openDeals) {
		if (d.deletedAt !== undefined) continue;
		if (d.pipelineId !== args.pipeline._id) continue;
		if (d.wonAt !== undefined || d.lostAt !== undefined) continue;
		const slot = countByStage.get(d.currentStageId);
		if (!slot) continue;
		const value = typeof d.value === "number" && Number.isFinite(d.value) ? d.value : 0;
		slot.count += 1;
		slot.value += value;
		totalOpen += 1;
		totalOpenValue += value;
	}

	const leading = countByStage.get(stages[0]?.id ?? "")?.count ?? 0;
	const out: PropertyFunnelStage[] = stages.map((s) => {
		const slot = countByStage.get(s.id) ?? { count: 0, value: 0 };
		const relativeWidth = leading === 0 ? 0 : Math.min(1, slot.count / leading);
		const dropoffPct = leading === 0 ? 0 : Math.round(((leading - slot.count) / leading) * 100);
		return {
			stageId: s.id,
			stageName: s.name,
			stageCode: s.code,
			...(s.color ? { color: s.color } : {}),
			count: slot.count,
			value: slot.value,
			relativeWidth,
			dropoffPct,
		};
	});
	return { stages: out, openCount: totalOpen, openValue: totalOpenValue };
}

// ─── Internal readers (shared by public + ForAI handlers) ───────────────

async function readDefaultDealPipeline(
	ctx: QueryCtx,
	orgId: Id<"orgs">,
): Promise<Doc<"pipelines"> | null> {
	const pipelines = await ctx.db
		.query("pipelines")
		.withIndex("by_org", (q) => q.eq("orgId", orgId))
		.collect();
	const dealPipelines = pipelines.filter((p) => p.entityType === "deal");
	if (dealPipelines.length === 0) return null;
	return (
		dealPipelines.find((p) => p.isDefault) ??
		[...dealPipelines].sort((a, b) => a.name.localeCompare(b.name))[0] ??
		null
	);
}

async function readOrgCurrency(ctx: QueryCtx, orgId: Id<"orgs">): Promise<string> {
	const org = await ctx.db.get(orgId);
	return org?.settings?.defaultCurrency ?? "USD";
}

async function readInvoiceAging(
	ctx: QueryCtx,
	args: { orgId: Id<"orgs"> },
): Promise<InvoiceAgingResult> {
	const now = Date.now();
	const currency = await readOrgCurrency(ctx, args.orgId);

	const pipelines = await ctx.db
		.query("pipelines")
		.withIndex("by_org", (q) => q.eq("orgId", args.orgId))
		.collect();
	const dealPipelines = pipelines.filter((p) => p.entityType === "deal");

	// Identify invoice-stage IDs across every deal pipeline. A workspace
	// with multiple deal pipelines may have an invoice-named stage in
	// each (e.g. "Service" pipeline + "Product" pipeline both end with
	// an Invoiced stage). We aggregate across all of them.
	const invoiceStageIds = new Set<string>();
	for (const p of dealPipelines) {
		for (const s of p.stages) {
			if (isInvoiceStage(s)) invoiceStageIds.add(s.id);
		}
	}

	const buckets = emptyAgingBuckets();
	let totalCount = 0;
	let totalValue = 0;
	const candidates: Array<{
		dealId: Id<"deals">;
		dealCode: string;
		title: string;
		value: number;
		daysInStage: number;
		stageEnteredAt: number;
	}> = [];

	if (invoiceStageIds.size > 0) {
		const deals = await ctx.db
			.query("deals")
			.withIndex("by_org", (q) => q.eq("orgId", args.orgId))
			.collect();
		for (const d of deals) {
			if (d.deletedAt !== undefined) continue;
			if (d.wonAt !== undefined || d.lostAt !== undefined) continue;
			if (!invoiceStageIds.has(d.currentStageId)) continue;
			const value = typeof d.value === "number" && Number.isFinite(d.value) ? d.value : 0;
			const daysInStage = Math.max(0, Math.floor((now - d.stageEnteredAt) / ONE_DAY_MS));
			const bucketId = bucketForDays(daysInStage);
			const bucket = buckets.find((b) => b.id === bucketId);
			if (bucket) {
				bucket.count += 1;
				bucket.value += value;
			}
			totalCount += 1;
			totalValue += value;
			candidates.push({
				dealId: d._id,
				dealCode: d.dealCode,
				title: d.title,
				value,
				daysInStage,
				stageEnteredAt: d.stageEnteredAt,
			});
		}
	}

	// Top 5 most-overdue invoices, sorted by daysInStage desc.
	candidates.sort((a, b) => b.daysInStage - a.daysInStage);
	const mostOverdue = candidates.slice(0, 5);

	return {
		currency,
		total: { count: totalCount, value: totalValue },
		buckets,
		mostOverdue,
		generatedAt: now,
	};
}

async function readPropertyFunnel(
	ctx: QueryCtx,
	args: { orgId: Id<"orgs"> },
): Promise<PropertyFunnelResult | null> {
	const now = Date.now();
	const pipeline = await readDefaultDealPipeline(ctx, args.orgId);
	if (!pipeline) return null;
	const currency = await readOrgCurrency(ctx, args.orgId);

	const deals = await ctx.db
		.query("deals")
		.withIndex("by_org_and_pipeline", (q) =>
			q.eq("orgId", args.orgId).eq("pipelineId", pipeline._id),
		)
		.collect();

	const { stages, openCount, openValue } = computePropertyFunnel({
		pipeline,
		openDeals: deals,
	});

	let won = 0;
	let wonValue = 0;
	for (const d of deals) {
		if (d.deletedAt !== undefined) continue;
		if (d.wonAt === undefined) continue;
		const v = typeof d.value === "number" && Number.isFinite(d.value) ? d.value : 0;
		won += 1;
		wonValue += v;
	}

	return {
		pipelineId: pipeline._id,
		pipelineName: pipeline.name,
		currency,
		stages,
		totals: { open: openCount, openValue, won, wonValue },
		generatedAt: now,
	};
}

async function readArrCohort(ctx: QueryCtx, args: { orgId: Id<"orgs"> }): Promise<ArrCohortResult> {
	const now = Date.now();
	const windowStart = now - ARR_WINDOW_MS;
	const currency = await readOrgCurrency(ctx, args.orgId);

	const buckets = buildArrCohortBuckets(now);
	const bucketByKey = new Map(buckets.map((b) => [b.month, b]));

	const deals = await ctx.db
		.query("deals")
		.withIndex("by_org", (q) => q.eq("orgId", args.orgId))
		.collect();

	let count = 0;
	let total = 0;
	for (const d of deals) {
		if (d.deletedAt !== undefined) continue;
		if (d.wonAt === undefined) continue;
		if (d.wonAt < windowStart) continue;
		const v = typeof d.value === "number" && Number.isFinite(d.value) ? d.value : 0;
		const key = monthKey(d.wonAt);
		const bucket = bucketByKey.get(key);
		if (!bucket) continue;
		bucket.count += 1;
		bucket.value += v;
		count += 1;
		total += v;
	}

	return {
		currency,
		totals: { count, value: total },
		buckets,
		generatedAt: now,
	};
}

// ─── Public + ForAI ─────────────────────────────────────────────────────

export const getInvoiceAging = orgQuery({
	args: { orgId: v.id("orgs") },
	handler: async (ctx, args) => {
		const { member } = await requireOrgMember(ctx, args.orgId);
		// Same gate as Sales Pipeline Panel — viewer can read aggregations
		// as long as they can read deals; otherwise produce the empty
		// envelope so the widget renders its empty state.
		if (!member.permissions.includes("deals.view")) {
			return {
				currency: "USD",
				total: { count: 0, value: 0 },
				buckets: emptyAgingBuckets(),
				mostOverdue: [],
				generatedAt: Date.now(),
			};
		}
		return readInvoiceAging(ctx, args);
	},
});

export const getInvoiceAgingForAI = internalQuery({
	args: { orgId: v.id("orgs"), userId: v.id("users") },
	handler: async (ctx, args) => {
		const { member } = await requireOrgMemberByIds(ctx, args.orgId, args.userId);
		if (!member.permissions.includes("deals.view")) {
			return {
				currency: "USD",
				total: { count: 0, value: 0 },
				buckets: emptyAgingBuckets(),
				mostOverdue: [],
				generatedAt: Date.now(),
			};
		}
		return readInvoiceAging(ctx, { orgId: args.orgId });
	},
});

export const getPropertyFunnel = orgQuery({
	args: { orgId: v.id("orgs") },
	handler: async (ctx, args) => {
		const { member } = await requireOrgMember(ctx, args.orgId);
		if (!member.permissions.includes("deals.view")) return null;
		return readPropertyFunnel(ctx, args);
	},
});

export const getPropertyFunnelForAI = internalQuery({
	args: { orgId: v.id("orgs"), userId: v.id("users") },
	handler: async (ctx, args) => {
		const { member } = await requireOrgMemberByIds(ctx, args.orgId, args.userId);
		if (!member.permissions.includes("deals.view")) return null;
		return readPropertyFunnel(ctx, { orgId: args.orgId });
	},
});

export const getArrCohort = orgQuery({
	args: { orgId: v.id("orgs") },
	handler: async (ctx, args) => {
		const { member } = await requireOrgMember(ctx, args.orgId);
		if (!member.permissions.includes("deals.view")) {
			return {
				currency: "USD",
				totals: { count: 0, value: 0 },
				buckets: buildArrCohortBuckets(Date.now()),
				generatedAt: Date.now(),
			};
		}
		return readArrCohort(ctx, args);
	},
});

export const getArrCohortForAI = internalQuery({
	args: { orgId: v.id("orgs"), userId: v.id("users") },
	handler: async (ctx, args) => {
		const { member } = await requireOrgMemberByIds(ctx, args.orgId, args.userId);
		if (!member.permissions.includes("deals.view")) {
			return {
				currency: "USD",
				totals: { count: 0, value: 0 },
				buckets: buildArrCohortBuckets(Date.now()),
				generatedAt: Date.now(),
			};
		}
		return readArrCohort(ctx, { orgId: args.orgId });
	},
});

export const __test = {
	bucketForDays,
	emptyAgingBuckets,
	isInvoiceStage,
	monthKey,
	buildArrCohortBuckets,
	computePropertyFunnel,
	AGING_BUCKETS,
	COHORT_MONTHS,
	INVOICE_STAGE_CODES,
	INVOICE_STAGE_NAME_RE,
};
