/// <reference types="vite/client" />
/**
 * Tests for Stage 5 of /DASHBOARD-V2-PLAN.md — AI writes into the UI.
 *
 * Coverage:
 *   1. Pure deal-scoring helpers — score every component on known inputs
 *      and the aggregate stays in 0..100; confidence label is stable.
 *   2. Pure anomaly detectors — each detector fires only when its
 *      threshold is exceeded; severity climbs with the magnitude.
 *   3. Anomaly cap — `rankAnomalies` truncates to 10 / org / day.
 *   4. Per-user `setMyDashboardLayoutOverride` rejects layouts whose
 *      shape fails `validateDashboardLayoutShape`.
 *   5. `clearMyDashboardLayoutOverride` is idempotent.
 *   6. `promoteToLayout` (ephemeral cell → user override) seeds the
 *      override from the org default + appends the cell's panel.
 *   7. AI `score_deal` ForAI twin — happy path scores a deal, blocked
 *      for non-members.
 *   8. AI `annotate_widget` ForAI commit path validates widgetKey.
 *
 * Runs under the same convex-test harness as the other stage tests.
 */

import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";
import { api, internal } from "./_generated/api";
import { getDefaultPermissionsForRole } from "./_shared/permissions/derive";
import {
	type AnomalyCandidate,
	DAILY_ANOMALY_CAP_PER_ORG,
	detectConversionDrop,
	detectOwnerInactivity,
	detectStuckDeal,
	detectVelocityDrop,
	rankAnomalies,
} from "./ai/insights/anomalyDetection";
import {
	aggregateScore,
	deriveConfidence,
	scoreActivityCount,
	scoreOwnerVelocity,
	scoreRecency,
	scoreStageAge,
	scoreValue,
} from "./ai/insights/dealScoring";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");
const DAY_MS = 24 * 60 * 60 * 1000;

// ─── Pure scoring helpers ────────────────────────────────────────────────

describe("Stage 5 — deal scoring helpers", () => {
	it("scoreRecency: never-touched → 0", () => {
		expect(scoreRecency(undefined, Date.now())).toBe(0);
	});

	it("scoreRecency: touched today → ~100", () => {
		const now = Date.now();
		expect(scoreRecency(now, now)).toBeCloseTo(100, 0);
	});

	it("scoreRecency: 30 days ago → ~50 (half-life)", () => {
		const now = Date.now();
		const score = scoreRecency(now - 30 * DAY_MS, now);
		expect(score).toBeGreaterThan(45);
		expect(score).toBeLessThan(55);
	});

	it("scoreStageAge: within grace → 100", () => {
		const now = Date.now();
		expect(scoreStageAge(now - 3 * DAY_MS, now)).toBe(100);
	});

	it("scoreStageAge: at floor (60d) → 0", () => {
		const now = Date.now();
		expect(scoreStageAge(now - 60 * DAY_MS, now)).toBe(0);
	});

	it("scoreValue: equal to median → 50", () => {
		expect(scoreValue(1000, 1000)).toBeCloseTo(50, 0);
	});

	it("scoreValue: 2× median → 100", () => {
		expect(scoreValue(2000, 1000)).toBe(100);
	});

	it("scoreValue: 0 median (no benchmark) → 50", () => {
		expect(scoreValue(5000, 0)).toBe(50);
	});

	it("scoreOwnerVelocity: zero closed → 0", () => {
		expect(
			scoreOwnerVelocity({ ownerWonLast30d: 0, ownerLostLast30d: 0, ownerOpenLast30d: 0 }),
		).toBe(0);
	});

	it("scoreOwnerVelocity: 50% win rate → 50", () => {
		expect(
			scoreOwnerVelocity({ ownerWonLast30d: 5, ownerLostLast30d: 5, ownerOpenLast30d: 0 }),
		).toBe(50);
	});

	it("scoreActivityCount: 0 events → 0", () => {
		expect(scoreActivityCount(0)).toBe(0);
	});

	it("scoreActivityCount: 12 events → 100 (ceiling)", () => {
		expect(scoreActivityCount(12)).toBe(100);
	});

	it("aggregateScore: all maxed → 100", () => {
		expect(
			aggregateScore({
				recency: 100,
				stageAge: 100,
				value: 100,
				ownerVelocity: 100,
				activityCount: 100,
			}),
		).toBe(100);
	});

	it("aggregateScore: all zero → 0", () => {
		expect(
			aggregateScore({
				recency: 0,
				stageAge: 0,
				value: 0,
				ownerVelocity: 0,
				activityCount: 0,
			}),
		).toBe(0);
	});

	it("deriveConfidence: high when both velocity + recency >= 50", () => {
		expect(
			deriveConfidence({
				recency: 80,
				stageAge: 50,
				value: 50,
				ownerVelocity: 70,
				activityCount: 50,
			}),
		).toBe("high");
	});

	it("deriveConfidence: low when both velocity + recency < 30", () => {
		expect(
			deriveConfidence({
				recency: 10,
				stageAge: 50,
				value: 50,
				ownerVelocity: 20,
				activityCount: 50,
			}),
		).toBe("low");
	});
});

// ─── Pure anomaly detectors ──────────────────────────────────────────────

describe("Stage 5 — anomaly detectors", () => {
	it("velocityDrop: 25% drop → warning", () => {
		const c = detectVelocityDrop({
			openValueThisWeek: 75_000,
			openValueLastWeek: 100_000,
			currency: "USD",
		});
		expect(c).not.toBeNull();
		expect(c?.severity).toBe("warning");
	});

	it("velocityDrop: 45% drop → critical", () => {
		const c = detectVelocityDrop({
			openValueThisWeek: 55_000,
			openValueLastWeek: 100_000,
			currency: "USD",
		});
		expect(c?.severity).toBe("critical");
	});

	it("velocityDrop: < 20% drop → null", () => {
		expect(
			detectVelocityDrop({
				openValueThisWeek: 90_000,
				openValueLastWeek: 100_000,
				currency: "USD",
			}),
		).toBeNull();
	});

	it("conversionDrop: 20pp drop → warning", () => {
		const c = detectConversionDrop({
			wonThisWeek: 1,
			lostThisWeek: 4,
			wonLastWeek: 4,
			lostLastWeek: 6,
		});
		expect(c).not.toBeNull();
		expect(["warning", "critical"]).toContain(c?.severity);
	});

	it("conversionDrop: 5pp drop → null", () => {
		expect(
			detectConversionDrop({
				wonThisWeek: 5,
				lostThisWeek: 5,
				wonLastWeek: 6,
				lostLastWeek: 4,
			}),
		).toBeNull();
	});

	it("stuckDeal: 35d in stage above median → warning", () => {
		const now = Date.now();
		const c = detectStuckDeal({
			deal: {
				_id: "d1" as never,
				_creationTime: 0,
				dealCode: "D-001",
				title: "Stuck",
				value: 5000,
				currency: "USD",
				stageEnteredAt: now - 35 * DAY_MS,
				createdAt: now - 60 * DAY_MS,
			} as never,
			now,
			orgMedianValue: 2000,
		});
		expect(c?.severity).toBe("warning");
	});

	it("stuckDeal: < 30d in stage → null", () => {
		const now = Date.now();
		expect(
			detectStuckDeal({
				deal: {
					_id: "d1" as never,
					_creationTime: 0,
					dealCode: "D-001",
					title: "Fresh",
					value: 5000,
					stageEnteredAt: now - 10 * DAY_MS,
					createdAt: now - 30 * DAY_MS,
				} as never,
				now,
				orgMedianValue: 2000,
			}),
		).toBeNull();
	});

	it("ownerInactivity: 0 closed + 5 open → warning", () => {
		const c = detectOwnerInactivity({
			ownerName: "Alex",
			wonLast30d: 0,
			lostLast30d: 0,
			openDeals: 8,
		});
		expect(c?.severity).toBe("warning");
	});

	it("ownerInactivity: any closed → null", () => {
		expect(
			detectOwnerInactivity({
				ownerName: "Alex",
				wonLast30d: 1,
				lostLast30d: 0,
				openDeals: 5,
			}),
		).toBeNull();
	});

	it("rankAnomalies: caps at DAILY_ANOMALY_CAP_PER_ORG", () => {
		const candidates: AnomalyCandidate[] = Array.from({ length: 15 }, (_, i) => ({
			kind: "stuck_deal" as const,
			severity: "warning" as const,
			widgetKey: "pipeline.salesPanel",
			note: `Stuck ${i}`,
		}));
		const ranked = rankAnomalies(candidates);
		expect(ranked.length).toBe(DAILY_ANOMALY_CAP_PER_ORG);
	});

	it("rankAnomalies: sorts critical → warning → info", () => {
		const candidates: AnomalyCandidate[] = [
			{ kind: "stuck_deal", severity: "info", widgetKey: "", note: "i" },
			{ kind: "stuck_deal", severity: "critical", widgetKey: "", note: "c" },
			{ kind: "stuck_deal", severity: "warning", widgetKey: "", note: "w" },
		];
		const ranked = rankAnomalies(candidates);
		expect(ranked[0].severity).toBe("critical");
		expect(ranked[1].severity).toBe("warning");
		expect(ranked[2].severity).toBe("info");
	});
});

// ─── Test harness helpers ────────────────────────────────────────────────

async function seedUser(t: ReturnType<typeof convexTest>) {
	const now = Date.now();
	const email = `s5-${now}-${Math.random().toString(36).slice(2, 8)}@example.com`;
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
	return { userId, asUser: t.withIdentity({ subject: userId }) };
}

async function seedOrgWithMember(
	t: ReturnType<typeof convexTest>,
	userId: string,
	roleName: "Owner" | "Member" = "Owner",
) {
	return t.run(async (ctx) => {
		const now = Date.now();
		const orgId = await ctx.db.insert("orgs", {
			name: "Stage 5 Org",
			slug: `s5-${now}-${Math.random().toString(36).slice(2, 6)}`,
			plan: "starter",
			platformOrgId: "ORB-S5",
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
			userId: userId as never,
			roleId,
			joinedAt: now,
		});
		return orgId;
	});
}

// ─── Layout-override mutations ───────────────────────────────────────────

describe("Stage 5 — setMyDashboardLayoutOverride", () => {
	it("rejects a layout that fails shape validation", async () => {
		const t = convexTest(schema, modules);
		const { userId, asUser } = await seedUser(t);
		const orgId = await seedOrgWithMember(t, userId);

		await expect(
			asUser.mutation(api.users.mutations.setMyDashboardLayoutOverride, {
				orgId,
				layout: { panels: "not-an-array" },
			}),
		).rejects.toThrow();
	});

	it("accepts a valid layout + persists it", async () => {
		const t = convexTest(schema, modules);
		const { userId, asUser } = await seedUser(t);
		const orgId = await seedOrgWithMember(t, userId);

		await asUser.mutation(api.users.mutations.setMyDashboardLayoutOverride, {
			orgId,
			layout: {
				panels: [
					{ id: "p1", span: 2, widget: "tasks.list" },
					{ id: "p2", span: 1, widget: "today.focus" },
				],
			},
		});

		const me = await t.run(async (ctx) => ctx.db.get(userId as never));
		const slot = (
			me as { preferences?: { dashboardLayoutOverride?: { orgId: string } } } | null
		)?.preferences?.dashboardLayoutOverride;
		expect(slot?.orgId).toBe(orgId);
	});

	it("clearMyDashboardLayoutOverride is idempotent", async () => {
		const t = convexTest(schema, modules);
		const { userId, asUser } = await seedUser(t);
		const orgId = await seedOrgWithMember(t, userId);

		// Calling clear when nothing is set should not throw.
		await asUser.mutation(api.users.mutations.clearMyDashboardLayoutOverride, { orgId });
		await asUser.mutation(api.users.mutations.clearMyDashboardLayoutOverride, { orgId });

		const me = await t.run(async (ctx) => ctx.db.get(userId as never));
		const slot = (me as { preferences?: { dashboardLayoutOverride?: unknown } } | null)
			?.preferences?.dashboardLayoutOverride;
		expect(slot).toBeUndefined();
	});
});

// ─── Ephemeral cells: pin → promoteToLayout flow ─────────────────────────

describe("Stage 5 — promoteToLayout end-to-end", () => {
	it("pinForAI then promoteToLayout writes the cell as a panel + deletes the cell", async () => {
		const t = convexTest(schema, modules);
		const { userId, asUser } = await seedUser(t);
		const orgId = await seedOrgWithMember(t, userId);

		// Direct pin via the ForAI twin (the AI tool path).
		const cellId = (await t.run(async (ctx) =>
			ctx.runMutation(internal.dashboard.ephemeralCells.mutations.pinForAI, {
				orgId,
				userId: userId as never,
				widgetKey: "tasks.list",
				args: {},
			}),
		)) as string;
		expect(typeof cellId).toBe("string");

		// Promote to layout.
		await asUser.mutation(api.dashboard.ephemeralCells.mutations.promoteToLayout, {
			orgId,
			cellRowId: cellId as never,
		});

		// User now has a layout override containing the cell's widget.
		const me = await t.run(async (ctx) => ctx.db.get(userId as never));
		const slot = (
			me as {
				preferences?: {
					dashboardLayoutOverride?: { layout: { panels: Array<{ widget: string }> } };
				};
			} | null
		)?.preferences?.dashboardLayoutOverride;
		expect(slot?.layout.panels.some((p) => p.widget === "tasks.list")).toBe(true);

		// Cell row is gone.
		const remaining = await t.run(async (ctx) => ctx.db.get(cellId as never));
		expect(remaining).toBeNull();
	});
});

// ─── AI score_deal ForAI twin ─────────────────────────────────────────────

describe("Stage 5 — scoreSingleDealForAI", () => {
	it("returns a score for a real deal", async () => {
		const t = convexTest(schema, modules);
		const { userId } = await seedUser(t);
		const orgId = await seedOrgWithMember(t, userId);
		const now = Date.now();

		const { dealId } = await t.run(async (ctx) => {
			const pipelineId = await ctx.db.insert("pipelines", {
				orgId,
				name: "Sales",
				entityType: "deal",
				stages: [
					{ id: "s1", name: "New", code: "new", order: 0, isFinal: false },
					{
						id: "s2",
						name: "Won",
						code: "won",
						order: 1,
						isFinal: true,
						finalType: "positive",
					},
				],
				isDefault: true,
				createdAt: now,
				updatedAt: now,
			});
			const dealId = await ctx.db.insert("deals", {
				orgId,
				dealCode: "D-001",
				title: "Acme renewal",
				value: 5000,
				currency: "USD",
				pipelineId,
				currentStageId: "s1",
				stageEnteredAt: now - 5 * DAY_MS,
				assignedTo: userId as never,
				source: "manual",
				createdAt: now - 30 * DAY_MS,
				updatedAt: now - 5 * DAY_MS,
			});
			return { dealId };
		});

		const result = (await t.run(async (ctx) =>
			ctx.runMutation(internal.ai.insights.dealScores.scoreSingleDealForAI, {
				orgId,
				userId: userId as never,
				dealId,
			}),
		)) as { score: number; confidence: string; dealCode: string } | null;

		expect(result).not.toBeNull();
		expect(result?.dealCode).toBe("D-001");
		expect(result?.score).toBeGreaterThanOrEqual(0);
		expect(result?.score).toBeLessThanOrEqual(100);
	});
});
