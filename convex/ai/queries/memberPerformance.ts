/**
 * convex/ai/queries/memberPerformance.ts
 *
 * Stage 7 of /SPRINT-PLAN.md — Analytical layer.
 *
 * Manager-gated read tool: returns per-member rollups (close rate,
 * deals won, deals lost, pipeline value, recent activity count) over
 * a configurable range (7d / 30d / 90d). Pure deterministic — no LLM.
 *
 * RBAC: gated on `members.viewPerformance` (Stage-7 permission). The
 * tool refuses (returns an empty list) for callers without the key,
 * mirroring the cohorts tool's posture.
 */

import { v } from "convex/values";
import { orgQuery, requireOrgMember, requireOrgMemberByIds } from "../../_functions/authenticated";
import type { Doc, Id } from "../../_generated/dataModel";
import { internalQuery, type QueryCtx } from "../../_generated/server";

const RANGE_MS: Record<"7d" | "30d" | "90d", number> = {
	"7d": 7 * 24 * 60 * 60 * 1000,
	"30d": 30 * 24 * 60 * 60 * 1000,
	"90d": 90 * 24 * 60 * 60 * 1000,
};

export type MemberPerformanceRow = {
	userId: Id<"users">;
	name: string;
	email?: string;
	dealsClosed: number;
	dealsWon: number;
	dealsLost: number;
	closeRate: number;
	pipelineValueOpen: number;
	pipelineValueWon: number;
	activityCount: number;
};

export type MemberPerformanceResult = {
	rangeKey: "7d" | "30d" | "90d";
	rangeStartedAt: number;
	rangeEndedAt: number;
	currency: string;
	count: number;
	rows: MemberPerformanceRow[];
};

// ─── Pure helper ─────────────────────────────────────────────────────────

export function computeMemberPerformance(args: {
	rangeKey: "7d" | "30d" | "90d";
	now: number;
	currency: string;
	members: ReadonlyArray<{
		userId: Id<"users">;
		name: string;
		email?: string;
	}>;
	deals: readonly Doc<"deals">[];
	activityRows: readonly Doc<"activityLogs">[];
}): MemberPerformanceResult {
	const rangeStart = args.now - RANGE_MS[args.rangeKey];
	const rows: MemberPerformanceRow[] = [];

	const dealsByOwner = new Map<string, Doc<"deals">[]>();
	for (const d of args.deals) {
		if (d.deletedAt !== undefined) continue;
		if (!d.assignedTo) continue;
		const key = d.assignedTo as unknown as string;
		const list = dealsByOwner.get(key) ?? [];
		list.push(d);
		dealsByOwner.set(key, list);
	}

	const activityByUser = new Map<string, number>();
	for (const a of args.activityRows) {
		if (a.createdAt < rangeStart) continue;
		const key = a.userId as unknown as string;
		activityByUser.set(key, (activityByUser.get(key) ?? 0) + 1);
	}

	for (const m of args.members) {
		const ownerKey = m.userId as unknown as string;
		const owned = dealsByOwner.get(ownerKey) ?? [];
		const wonInRange = owned.filter((d) => d.wonAt !== undefined && d.wonAt >= rangeStart);
		const lostInRange = owned.filter((d) => d.lostAt !== undefined && d.lostAt >= rangeStart);
		const closed = wonInRange.length + lostInRange.length;
		const closeRate = closed > 0 ? Math.round((wonInRange.length / closed) * 100) : 0;
		const pipelineValueOpen = owned
			.filter((d) => d.wonAt === undefined && d.lostAt === undefined)
			.reduce((acc, d) => acc + (d.value ?? 0), 0);
		const pipelineValueWon = wonInRange.reduce((acc, d) => acc + (d.value ?? 0), 0);

		rows.push({
			userId: m.userId,
			name: m.name,
			email: m.email,
			dealsClosed: closed,
			dealsWon: wonInRange.length,
			dealsLost: lostInRange.length,
			closeRate,
			pipelineValueOpen: Math.round(pipelineValueOpen),
			pipelineValueWon: Math.round(pipelineValueWon),
			activityCount: activityByUser.get(ownerKey) ?? 0,
		});
	}

	rows.sort((a, b) => b.dealsWon - a.dealsWon || b.pipelineValueWon - a.pipelineValueWon);

	return {
		rangeKey: args.rangeKey,
		rangeStartedAt: rangeStart,
		rangeEndedAt: args.now,
		currency: args.currency,
		count: rows.length,
		rows,
	};
}

// ─── DB reader ───────────────────────────────────────────────────────────

async function readMemberPerformance(
	ctx: QueryCtx,
	args: { orgId: Id<"orgs">; rangeKey: "7d" | "30d" | "90d"; now: number },
): Promise<MemberPerformanceResult> {
	const org = await ctx.db.get(args.orgId);
	const currency = org?.settings?.defaultCurrency ?? "USD";

	const [orgMembers, deals, activityRows] = await Promise.all([
		ctx.db
			.query("orgMembers")
			.withIndex("by_orgId_and_userId", (q) => q.eq("orgId", args.orgId))
			.collect(),
		ctx.db
			.query("deals")
			.withIndex("by_org", (q) => q.eq("orgId", args.orgId))
			.collect(),
		ctx.db
			.query("activityLogs")
			.withIndex("by_orgId_and_createdAt", (q) =>
				q.eq("orgId", args.orgId).gte("createdAt", args.now - RANGE_MS[args.rangeKey]),
			)
			.collect(),
	]);

	const live = orgMembers.filter((m) => m.deletedAt === undefined);
	const memberSummaries = await Promise.all(
		live.map(async (m) => {
			const u = await ctx.db.get(m.userId);
			return {
				userId: m.userId,
				name: u?.name ?? u?.email ?? "Unnamed",
				email: u?.email,
			};
		}),
	);

	return computeMemberPerformance({
		rangeKey: args.rangeKey,
		now: args.now,
		currency,
		members: memberSummaries,
		deals,
		activityRows,
	});
}

// ─── Public + ForAI ──────────────────────────────────────────────────────

const RANGE_VALIDATOR = v.optional(v.union(v.literal("7d"), v.literal("30d"), v.literal("90d")));

export const getMemberPerformance = orgQuery({
	args: { orgId: v.id("orgs"), range: RANGE_VALIDATOR },
	handler: async (ctx, args) => {
		const { member } = await requireOrgMember(ctx, args.orgId);
		if (!member.permissions.includes("members.viewPerformance")) return null;
		return readMemberPerformance(ctx, {
			orgId: args.orgId,
			rangeKey: args.range ?? "30d",
			now: Date.now(),
		});
	},
});

export const getMemberPerformanceForAI = internalQuery({
	args: {
		orgId: v.id("orgs"),
		userId: v.id("users"),
		range: RANGE_VALIDATOR,
	},
	handler: async (ctx, args) => {
		const { member } = await requireOrgMemberByIds(ctx, args.orgId, args.userId);
		if (!member.permissions.includes("members.viewPerformance")) return null;
		return readMemberPerformance(ctx, {
			orgId: args.orgId,
			rangeKey: args.range ?? "30d",
			now: Date.now(),
		});
	},
});

export const __test = {
	computeMemberPerformance,
	RANGE_MS,
};
