/**
 * convex/ai/queries/cohorts.ts
 *
 * Stage 7 of /SPRINT-PLAN.md — cohort rollups (leadSource / industry /
 * owner). The query side is read-only — it returns the latest persisted
 * `aiCohortReports` row for a given cohort kind. Rebuild lives in the
 * cron action `convex/ai/actions/rebuildCohorts.ts` so the read path is
 * a single indexed lookup with zero LLM cost.
 *
 * The pure rollup helpers exposed via `__test` are reused by the action
 * + the unit tests so the deterministic part is testable in isolation.
 */

import { v } from "convex/values";
import { orgQuery, requireOrgMember, requireOrgMemberByIds } from "../../_functions/authenticated";
import type { Doc, Id } from "../../_generated/dataModel";
import { internalQuery, type QueryCtx } from "../../_generated/server";

export type CohortKind = "leadSource" | "industry" | "owner";

export type CohortRow = {
	key: string;
	label?: string;
	count: number;
	convertedCount: number;
	conversionRate: number;
	avgDealValue: number;
	totalValue: number;
};

export type CohortReport = {
	kind: CohortKind;
	rows: CohortRow[];
	periodStart: number;
	periodEnd: number;
	generatedAt: number | null;
	expiresAt: number | null;
	source: "stored" | "live";
};

// ─── Pure rollup helpers ─────────────────────────────────────────────────

/**
 * Round to 1 decimal place, defending against `NaN` / `Infinity` from
 * empty buckets so the row-shape is stable for the caller.
 */
function safeRound(n: number): number {
	if (!Number.isFinite(n)) return 0;
	return Math.round(n * 10) / 10;
}

/**
 * Pure rollup over a (lead, deal) population. The leads carry the
 * cohort dimension (source / industry / owner); the deals contribute
 * `avgDealValue` + `totalValue`. Conversion rate = leads with
 * `convertedAt` set ÷ leads in the cohort.
 *
 * Exported for tests + the rebuild cron.
 */
export function computeCohorts(args: {
	kind: CohortKind;
	leads: readonly Doc<"leads">[];
	contacts: readonly Doc<"contacts">[];
	deals: readonly Doc<"deals">[];
	companies: readonly Doc<"companies">[];
	memberLabelById?: Record<string, string>;
}): CohortRow[] {
	const memberLabel = args.memberLabelById ?? {};

	type Bucket = {
		key: string;
		label?: string;
		count: number;
		convertedCount: number;
		dealValueTotal: number;
		dealCount: number;
	};
	const bucketByKey = new Map<string, Bucket>();

	function ensureBucket(key: string, label?: string): Bucket {
		const existing = bucketByKey.get(key);
		if (existing) return existing;
		const created: Bucket = {
			key,
			label,
			count: 0,
			convertedCount: 0,
			dealValueTotal: 0,
			dealCount: 0,
		};
		bucketByKey.set(key, created);
		return created;
	}

	// Index helpers used while bucketing leads/deals.
	const companyById = new Map<string, Doc<"companies">>();
	for (const c of args.companies) {
		if (c.deletedAt === undefined) {
			companyById.set(c._id as unknown as string, c);
		}
	}

	const personIndustry = new Map<string, string | undefined>();
	if (args.kind === "industry") {
		// A lead's industry comes from its associated company, not the lead
		// row itself. We map personCode → industry once.
		for (const l of args.leads) {
			if (!l.companyId) continue;
			const company = companyById.get(l.companyId as unknown as string);
			personIndustry.set(l.personCode, company?.industry);
		}
		for (const c of args.contacts) {
			if (!c.companyId) continue;
			const company = companyById.get(c.companyId as unknown as string);
			personIndustry.set(c.personCode, company?.industry);
		}
	}

	for (const lead of args.leads) {
		if (lead.deletedAt !== undefined) continue;
		let key: string;
		let label: string | undefined;
		if (args.kind === "leadSource") {
			key = (lead.source ?? "").trim() || "(no source)";
			label = key;
		} else if (args.kind === "industry") {
			const industry = personIndustry.get(lead.personCode);
			key = (industry ?? "").trim() || "(no industry)";
			label = key;
		} else {
			// owner
			const ownerId = lead.assignedTo as unknown as string | undefined;
			key = ownerId ?? "(unassigned)";
			label = ownerId ? (memberLabel[ownerId] ?? key) : "Unassigned";
		}
		const bucket = ensureBucket(key, label);
		bucket.count += 1;
		if (lead.convertedAt !== undefined) bucket.convertedCount += 1;
	}

	// Match deals back to a cohort key — same logic as the lead bucket.
	for (const deal of args.deals) {
		if (deal.deletedAt !== undefined) continue;
		if (typeof deal.value !== "number" || deal.value <= 0) continue;
		let key: string | undefined;
		if (args.kind === "leadSource") {
			key = (deal.source ?? "").trim() || "(no source)";
		} else if (args.kind === "industry") {
			if (deal.companyId) {
				const company = companyById.get(deal.companyId as unknown as string);
				key = (company?.industry ?? "").trim() || "(no industry)";
			} else {
				key = "(no industry)";
			}
		} else {
			const ownerId = deal.assignedTo as unknown as string | undefined;
			key = ownerId ?? "(unassigned)";
		}
		if (!key) continue;
		const bucket = ensureBucket(key);
		bucket.dealValueTotal += deal.value;
		bucket.dealCount += 1;
	}

	const rows: CohortRow[] = [];
	for (const bucket of bucketByKey.values()) {
		rows.push({
			key: bucket.key,
			label: bucket.label,
			count: bucket.count,
			convertedCount: bucket.convertedCount,
			conversionRate:
				bucket.count > 0 ? safeRound((bucket.convertedCount / bucket.count) * 100) : 0,
			avgDealValue:
				bucket.dealCount > 0 ? safeRound(bucket.dealValueTotal / bucket.dealCount) : 0,
			totalValue: Math.round(bucket.dealValueTotal),
		});
	}

	rows.sort((a, b) => b.count - a.count || b.totalValue - a.totalValue);
	return rows;
}

// ─── DB read of the latest persisted row ─────────────────────────────────

async function readLatestCohort(
	ctx: QueryCtx,
	args: { orgId: Id<"orgs">; kind: CohortKind },
): Promise<CohortReport> {
	const row = await ctx.db
		.query("aiCohortReports")
		.withIndex("by_org_and_kind_and_generated", (q) =>
			q.eq("orgId", args.orgId).eq("kind", args.kind),
		)
		.order("desc")
		.first();
	if (!row) {
		return {
			kind: args.kind,
			rows: [],
			periodStart: 0,
			periodEnd: 0,
			generatedAt: null,
			expiresAt: null,
			source: "stored",
		};
	}
	return {
		kind: row.kind,
		rows: row.rows,
		periodStart: row.periodStart,
		periodEnd: row.periodEnd,
		generatedAt: row.generatedAt,
		expiresAt: row.expiresAt,
		source: "stored",
	};
}

// ─── Public + ForAI ──────────────────────────────────────────────────────

const KIND_VALIDATOR = v.union(v.literal("leadSource"), v.literal("industry"), v.literal("owner"));

export const getLatestCohort = orgQuery({
	args: { orgId: v.id("orgs"), kind: KIND_VALIDATOR },
	handler: async (ctx, args) => {
		const { member } = await requireOrgMember(ctx, args.orgId);
		if (!member.permissions.includes("ai.cohorts.view")) {
			return null;
		}
		return readLatestCohort(ctx, { orgId: args.orgId, kind: args.kind });
	},
});

export const getLatestCohortForAI = internalQuery({
	args: {
		orgId: v.id("orgs"),
		userId: v.id("users"),
		kind: KIND_VALIDATOR,
	},
	handler: async (ctx, args) => {
		const { member } = await requireOrgMemberByIds(ctx, args.orgId, args.userId);
		if (!member.permissions.includes("ai.cohorts.view")) {
			return null;
		}
		return readLatestCohort(ctx, { orgId: args.orgId, kind: args.kind });
	},
});

/**
 * Internal raw scan helper — used by the `rebuildCohorts` cron action
 * to load the lead / deal / company population in one indexed pass per
 * table. NOT exposed to AI tools (no auth bridge needed; the rebuild
 * action is privileged).
 */
export const collectOrgCohortData = internalQuery({
	args: { orgId: v.id("orgs") },
	handler: async (ctx, args) => {
		const [leads, contacts, deals, companies, members] = await Promise.all([
			ctx.db
				.query("leads")
				.withIndex("by_org", (q) => q.eq("orgId", args.orgId))
				.collect(),
			ctx.db
				.query("contacts")
				.withIndex("by_org", (q) => q.eq("orgId", args.orgId))
				.collect(),
			ctx.db
				.query("deals")
				.withIndex("by_org", (q) => q.eq("orgId", args.orgId))
				.collect(),
			ctx.db
				.query("companies")
				.withIndex("by_org", (q) => q.eq("orgId", args.orgId))
				.collect(),
			ctx.db
				.query("orgMembers")
				.withIndex("by_orgId_and_userId", (q) => q.eq("orgId", args.orgId))
				.collect(),
		]);

		const memberLabelById: Record<string, string> = {};
		for (const m of members) {
			const u = await ctx.db.get(m.userId);
			if (u?.name) memberLabelById[m.userId as unknown as string] = u.name;
			else if (u?.email) memberLabelById[m.userId as unknown as string] = u.email;
		}
		return { leads, contacts, deals, companies, memberLabelById };
	},
});

export const __test = {
	computeCohorts,
};
