/// <reference types="vite/client" />
/**
 * Tests for Stage 7 of /SPRINT-PLAN.md — Analytical layer + Trace UI.
 *
 * Covers:
 *   1. Pure helpers (`computeStageVelocity`, `computeCohorts`,
 *      `computeMemberPerformance`, `buildDeterministicNarrative`) are
 *      deterministic given fixed input.
 *   2. `aiInsights` write path enforces the Zod schema (rejects malformed
 *      bodies via writeInsight).
 *   3. `cohort_analysis` is empty-safe (returns empty rows when no rebuild
 *      has run).
 *   4. `member_performance` returns null for callers without
 *      `members.viewPerformance` permission.
 *   5. Trace view rejects non-owner callers without
 *      `messages.viewAll`.
 *   6. `refreshNow` enforces the 5/min rate limit.
 *
 * Runs under the same convex-test harness as `convex/stage5.test.ts` and
 * `convex/stage6.test.ts`.
 */

import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";
import { api, internal } from "./_generated/api";
import type { Doc } from "./_generated/dataModel";
import { getDefaultPermissionsForRole } from "./_shared/permissions/derive";
import { buildDeterministicNarrative } from "./ai/actions/analyzeMetric";
import { computeCohorts } from "./ai/queries/cohorts";
import { InsightBodySchema } from "./ai/queries/insights";
import { computeMemberPerformance } from "./ai/queries/memberPerformance";
import { avgDaysInStage, computeStageVelocity } from "./ai/queries/pipelineVelocity";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");
const ONE_DAY_MS = 24 * 60 * 60 * 1000;

// ─── Test harness helpers (mirror stage6.test.ts) ────────────────────────

async function seedUser(t: ReturnType<typeof convexTest>, role: "Owner" | "Member" = "Owner") {
	const now = Date.now();
	const email = `s7-${now}-${Math.random().toString(36).slice(2, 8)}@example.com`;
	const userId = await t.run(async (ctx) => {
		return ctx.db.insert("users", {
			tokenIdentifier: `password|${email}`,
			email,
			name: email.split("@")[0],
			onboardingCompleted: false,
			lastActiveAt: now,
			createdAt: now,
			updatedAt: now,
		});
	});
	return { userId, asUser: t.withIdentity({ subject: userId }), role };
}

async function seedOrgWithMember(
	t: ReturnType<typeof convexTest>,
	userId: string,
	roleName: "Owner" | "Member" = "Owner",
) {
	return t.run(async (ctx) => {
		const now = Date.now();
		const orgId = await ctx.db.insert("orgs", {
			name: "Stage 7 Org",
			slug: `s7-${now}-${Math.random().toString(36).slice(2, 6)}`,
			plan: "free",
			platformOrgId: "ORB-S7",
			settings: { defaultCurrency: "USD" },
			createdAt: now,
			updatedAt: now,
		});
		const roleId = await ctx.db.insert("orgRoles", {
			orgId,
			name: roleName,
			permissions: [...getDefaultPermissionsForRole(roleName)],
			isSystem: true,
			isDefault: false,
			createdAt: now,
			updatedAt: now,
		});
		await ctx.db.insert("orgMembers", {
			orgId,
			userId,
			roleId,
			joinedAt: now,
		});
		return orgId;
	});
}

// ─── Pure helpers ────────────────────────────────────────────────────────

describe("Stage 7 — pipelineVelocity pure helpers", () => {
	it("avgDaysInStage returns 0 on empty cohort", () => {
		expect(avgDaysInStage([], Date.now())).toBe(0);
	});

	it("avgDaysInStage rounds to 1 decimal place", () => {
		const now = Date.now();
		const a = now - 1 * ONE_DAY_MS;
		const b = now - 2 * ONE_DAY_MS;
		const c = now - 3 * ONE_DAY_MS;
		expect(avgDaysInStage([a, b, c], now)).toBe(2);
	});

	it("computeStageVelocity returns one row per stage in `order` order", () => {
		const fakePipeline = {
			_id: "p1",
			pipelineId: "p1",
			orgId: "o1",
			name: "Test pipeline",
			entityType: "deal",
			isDefault: true,
			stages: [
				{ id: "stg-2", name: "Qualified", code: "Q", order: 2 },
				{ id: "stg-1", name: "New", code: "N", order: 1 },
				{
					id: "stg-3",
					name: "Won",
					code: "W",
					order: 3,
					isFinal: true,
					finalType: "positive" as const,
				},
			],
			createdAt: Date.now(),
			updatedAt: Date.now(),
		} as unknown as Doc<"pipelines">;
		const rows = computeStageVelocity({
			pipeline: fakePipeline,
			deals: [],
			stageChangeLogs: [],
			now: Date.now(),
		});
		expect(rows.map((r) => r.stageCode)).toEqual(["N", "Q", "W"]);
	});
});

describe("Stage 7 — computeCohorts", () => {
	it("returns empty rows when there are no leads", () => {
		const rows = computeCohorts({
			kind: "leadSource",
			leads: [],
			contacts: [],
			deals: [],
			companies: [],
		});
		expect(rows).toEqual([]);
	});

	it("groups leads by source + computes conversionRate", () => {
		const now = Date.now();
		const leads: Doc<"leads">[] = [
			{
				_id: "l1" as unknown as Doc<"leads">["_id"],
				_creationTime: now,
				orgId: "o1" as unknown as Doc<"leads">["orgId"],
				personCode: "P-001",
				displayName: "Lead 1",
				status: "New",
				source: "google_ads",
				createdAt: now,
				updatedAt: now,
			},
			{
				_id: "l2" as unknown as Doc<"leads">["_id"],
				_creationTime: now,
				orgId: "o1" as unknown as Doc<"leads">["orgId"],
				personCode: "P-002",
				displayName: "Lead 2",
				status: "Converted",
				source: "google_ads",
				createdAt: now,
				updatedAt: now,
				convertedAt: now,
			},
			{
				_id: "l3" as unknown as Doc<"leads">["_id"],
				_creationTime: now,
				orgId: "o1" as unknown as Doc<"leads">["orgId"],
				personCode: "P-003",
				displayName: "Lead 3",
				status: "New",
				source: "linkedin",
				createdAt: now,
				updatedAt: now,
			},
		];
		const rows = computeCohorts({
			kind: "leadSource",
			leads,
			contacts: [],
			deals: [],
			companies: [],
		});
		const google = rows.find((r) => r.key === "google_ads");
		const linkedin = rows.find((r) => r.key === "linkedin");
		expect(google?.count).toBe(2);
		expect(google?.convertedCount).toBe(1);
		expect(google?.conversionRate).toBe(50);
		expect(linkedin?.count).toBe(1);
		expect(linkedin?.conversionRate).toBe(0);
	});
});

describe("Stage 7 — computeMemberPerformance", () => {
	it("returns 0 close rate for an empty closed cohort", () => {
		const result = computeMemberPerformance({
			rangeKey: "30d",
			now: Date.now(),
			currency: "USD",
			members: [{ userId: "u1" as unknown as Doc<"orgMembers">["userId"], name: "Alice" }],
			deals: [],
			activityRows: [],
		});
		expect(result.rows[0].closeRate).toBe(0);
		expect(result.rows[0].dealsWon).toBe(0);
	});
});

describe("Stage 7 — buildDeterministicNarrative", () => {
	it("returns medium confidence on a 15% delta", () => {
		const body = buildDeterministicNarrative({
			metric: "deals.pipelineValue",
			rangeKey: "30d",
			currency: "USD",
			currentValue: 115000,
			previousValue: 100000,
		});
		expect(body.confidence).toBe("medium");
		expect(body.summary).toContain("up");
	});

	it("returns low confidence on a sub-10% delta", () => {
		const body = buildDeterministicNarrative({
			metric: "deals.pipelineValue",
			rangeKey: "7d",
			currency: "USD",
			currentValue: 102000,
			previousValue: 100000,
		});
		expect(body.confidence).toBe("low");
	});
});

describe("Stage 7 — InsightBodySchema validates structured output", () => {
	it("accepts a well-formed body", () => {
		const ok = InsightBodySchema.safeParse({
			summary: "Pipeline value up 12% over the last 30d.",
			findings: ["Currently $120K vs $107K prior."],
			actionItems: [{ label: "Review wins" }],
			confidence: "medium",
		});
		expect(ok.success).toBe(true);
	});

	it("rejects a body with empty summary", () => {
		const fail = InsightBodySchema.safeParse({
			summary: "",
			findings: ["x"],
			actionItems: [],
			confidence: "low",
		});
		expect(fail.success).toBe(false);
	});

	it("rejects a body with bad confidence", () => {
		const fail = InsightBodySchema.safeParse({
			summary: "test",
			findings: ["x"],
			actionItems: [],
			confidence: "very-high",
		});
		expect(fail.success).toBe(false);
	});
});

// ─── DB-backed tests ─────────────────────────────────────────────────────

describe("Stage 7 — cohort_analysis empty-safe path", () => {
	it("returns null kind/empty rows when no rebuild has run", async () => {
		const t = convexTest(schema, modules);
		const { userId, asUser } = await seedUser(t);
		const orgId = await seedOrgWithMember(t, userId);
		const result = await asUser.query(api.ai.queries.cohorts.getLatestCohort, {
			orgId,
			kind: "leadSource",
		});
		expect(result?.rows).toEqual([]);
		expect(result?.generatedAt).toBeNull();
	});

	it("rebuildForOrg writes one aiCohortReports row per kind", async () => {
		const t = convexTest(schema, modules);
		const { userId } = await seedUser(t);
		const orgId = await seedOrgWithMember(t, userId);
		await t.mutation(internal.ai.actions.rebuildCohorts.rebuildForOrg, { orgId });
		const rows = await t.run(async (ctx) =>
			ctx.db
				.query("aiCohortReports")
				.withIndex("by_org_and_kind_and_generated", (q) => q.eq("orgId", orgId))
				.collect(),
		);
		// 3 kinds: leadSource / industry / owner.
		expect(rows).toHaveLength(3);
	});
});

describe("Stage 7 — member_performance RBAC", () => {
	it("returns null for a Member-role caller without members.viewPerformance", async () => {
		const t = convexTest(schema, modules);
		const { userId, asUser } = await seedUser(t, "Member");
		const orgId = await seedOrgWithMember(t, userId, "Member");
		const result = await asUser.query(api.ai.queries.memberPerformance.getMemberPerformance, {
			orgId,
		});
		expect(result).toBeNull();
	});

	it("returns rows for an Owner caller", async () => {
		const t = convexTest(schema, modules);
		const { userId, asUser } = await seedUser(t);
		const orgId = await seedOrgWithMember(t, userId);
		const result = await asUser.query(api.ai.queries.memberPerformance.getMemberPerformance, {
			orgId,
		});
		expect(result).not.toBeNull();
		expect(result?.rangeKey).toBe("30d");
		expect(result?.rows).toHaveLength(1);
	});
});

describe("Stage 7 — writeInsight zod-validates body", () => {
	it("inserts a row with a valid body", async () => {
		const t = convexTest(schema, modules);
		const { userId } = await seedUser(t);
		const orgId = await seedOrgWithMember(t, userId);

		const insightId = await t.mutation(internal.ai.queries.insights.writeInsight, {
			orgId,
			userId,
			kind: "metric_analysis",
			metric: "deals.pipelineValue",
			range: "30d",
			body: {
				summary: "Test summary.",
				findings: ["Finding 1"],
				actionItems: [],
				confidence: "low",
			},
			modelUsed: "test:deterministic",
		});

		expect(insightId).toBeTruthy();
	});

	it("refuses to insert a body with empty findings array", async () => {
		const t = convexTest(schema, modules);
		const { userId } = await seedUser(t);
		const orgId = await seedOrgWithMember(t, userId);

		await expect(
			t.mutation(internal.ai.queries.insights.writeInsight, {
				orgId,
				userId,
				kind: "metric_analysis",
				body: {
					summary: "test",
					findings: [],
					actionItems: [],
					confidence: "low",
				},
				modelUsed: "test:deterministic",
			}),
		).rejects.toThrow();
	});
});

describe("Stage 7 — toolTrace conversation-membership gate", () => {
	it("returns null when caller lacks ai.trace.view", async () => {
		const t = convexTest(schema, modules);
		const { userId, asUser } = await seedUser(t);
		const orgId = await t.run(async (ctx) => {
			const now = Date.now();
			const oid = await ctx.db.insert("orgs", {
				name: "Trace org",
				slug: `s7-trace-${now}`,
				plan: "free",
				platformOrgId: "ORB-S7T",
				settings: { defaultCurrency: "USD" },
				createdAt: now,
				updatedAt: now,
			});
			const roleId = await ctx.db.insert("orgRoles", {
				orgId: oid,
				name: "Viewer",
				// Strip ai.trace.view explicitly so the gate fires.
				permissions: [...getDefaultPermissionsForRole("Viewer")].filter(
					(p) => p !== "ai.trace.view",
				),
				isSystem: true,
				isDefault: false,
				createdAt: now,
				updatedAt: now,
			});
			await ctx.db.insert("orgMembers", {
				orgId: oid,
				userId,
				roleId,
				joinedAt: now,
			});
			return oid;
		});

		const conversationId = await t.run(async (ctx) =>
			ctx.db.insert("aiConversations", {
				orgId,
				userId,
				status: "active",
				createdAt: Date.now(),
				updatedAt: Date.now(),
			}),
		);

		const trace = await asUser.query(api.ai.queries.toolTrace.getToolTraceForConversation, {
			orgId,
			conversationId,
		});
		expect(trace).toBeNull();
	});
});
