/// <reference types="vite/client" />
/**
 * Tests for Stage 6 of /SPRINT-PLAN.md — Proactive layer.
 *
 * Coverage areas:
 *   1. Pure ranker (`computeRanking` + `classifyConfidence` +
 *      `computeDealMedianValue`) is deterministic given fixed input.
 *   2. `rebuildForUser` materialises ranked rows into `aiNextActions`
 *      and is idempotent (running twice produces the same row count).
 *   3. `listForUser` returns rows newest-first by score, hides snoozed
 *      rows, and respects the `limit` arg.
 *   4. `dismissNextAction` deletes the row + adds the fingerprint to
 *      `users.preferences.aiPulseDismissed`.
 *   5. `snoozeNextAction` patches `snoozedUntil` so the row drops out
 *      of `listForUser` for the snooze window.
 *   6. `rebuildAllOrgs` action (cron entry) doesn't blow up on an empty
 *      workspace.
 *   7. `detectAnomalies` (pure) reports week-over-week deltas above the
 *      10% threshold and skips noise.
 *
 * Runs under the same convex-test harness as `convex/stage5.test.ts`.
 */

import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";
import { api, internal } from "./_generated/api";
import type { Doc } from "./_generated/dataModel";
import { getDefaultPermissionsForRole } from "./_shared/permissions/derive";
import { __test as anomaliesTest, detectAnomalies } from "./ai/queries/anomalies";
import {
	classifyConfidence,
	computeDealMedianValue,
	computeRanking,
	__test as nextActionsTest,
} from "./ai/queries/nextActions";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");

// ─── Test harness helpers (mirror stage5.test.ts) ─────────────────────────

async function seedUser(t: ReturnType<typeof convexTest>) {
	const now = Date.now();
	const email = `alice-${now}-${Math.random().toString(36).slice(2, 6)}@example.com`;
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
	settings: Record<string, unknown> = {},
) {
	return t.run(async (ctx) => {
		const now = Date.now();
		const orgId = await ctx.db.insert("orgs", {
			name: "Stage 6 Org",
			slug: `stage6-${now}-${Math.random().toString(36).slice(2, 6)}`,
			plan: "free",
			platformOrgId: "ORB-S6",
			settings: { defaultCurrency: "USD", ...settings },
			createdAt: now,
			updatedAt: now,
		});
		const roleId = await ctx.db.insert("orgRoles", {
			orgId,
			name: "Owner",
			permissions: [...getDefaultPermissionsForRole("Owner")],
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

const ONE_DAY_MS = 24 * 60 * 60 * 1000;

function fakeTask(over: Partial<Doc<"tasks">>): Doc<"tasks"> {
	return {
		_id: "t1" as unknown as Doc<"tasks">["_id"],
		_creationTime: Date.now(),
		orgId: "o1" as unknown as Doc<"tasks">["orgId"],
		taskCode: "T-001",
		type: "todo",
		personCode: "P-001",
		entityType: "lead",
		entityId: "e1",
		title: "Call Sara",
		dueAt: Date.now(),
		assignedTo: "u1" as unknown as Doc<"tasks">["assignedTo"],
		status: "pending",
		createdAt: Date.now(),
		...over,
	};
}

function fakeLead(over: Partial<Doc<"leads">>): Doc<"leads"> {
	return {
		_id: "l1" as unknown as Doc<"leads">["_id"],
		_creationTime: Date.now(),
		orgId: "o1" as unknown as Doc<"leads">["orgId"],
		personCode: "P-001",
		displayName: "Sara Khan",
		status: "New",
		source: "manual",
		createdAt: Date.now() - 30 * ONE_DAY_MS,
		updatedAt: Date.now() - 30 * ONE_DAY_MS,
		...over,
	};
}

function fakeDeal(over: Partial<Doc<"deals">>): Doc<"deals"> {
	const now = Date.now();
	return {
		_id: "d1" as unknown as Doc<"deals">["_id"],
		_creationTime: now,
		orgId: "o1" as unknown as Doc<"deals">["orgId"],
		dealCode: "D-001",
		title: "Acme Annual",
		pipelineId: "p1" as unknown as Doc<"deals">["pipelineId"],
		currentStageId: "qualified",
		stageEnteredAt: now,
		source: "manual",
		createdAt: now,
		updatedAt: now,
		value: 5000,
		...over,
	};
}

// ─── Pure ranker tests ────────────────────────────────────────────────────

describe("Stage 6 — pure ranker", () => {
	it("classifyConfidence buckets scores into high/medium/low", () => {
		expect(classifyConfidence(80)).toBe("high");
		expect(classifyConfidence(60)).toBe("high");
		expect(classifyConfidence(45)).toBe("medium");
		expect(classifyConfidence(30)).toBe("medium");
		expect(classifyConfidence(15)).toBe("low");
		expect(classifyConfidence(0)).toBe("low");
	});

	it("scores an overdue reminder higher than a stale lead", () => {
		const now = Date.now();
		const overdueTask = fakeTask({ dueAt: now - 2 * ONE_DAY_MS });
		const staleLead = fakeLead({ updatedAt: now - 8 * ONE_DAY_MS });
		const rows = computeRanking({
			now,
			reminders: [overdueTask],
			leads: [staleLead],
			deals: [],
			dealMedianValue: 0,
		});
		expect(rows[0].recordKind).toBe("reminder");
		expect(rows[0].reasonCode).toBe("reminder_overdue");
		expect(rows[0].confidence).toBe("high");
		expect(rows[1].recordKind).toBe("lead");
		expect(rows[1].reasonCode).toBe("lead_stale_7d");
	});

	it("classifies a 14-day-stale lead as the hot variant", () => {
		const now = Date.now();
		const lead = fakeLead({
			updatedAt: now - 15 * ONE_DAY_MS,
			personCode: "P-007",
		});
		const rows = computeRanking({
			now,
			reminders: [],
			leads: [lead],
			deals: [],
			dealMedianValue: 0,
		});
		expect(rows).toHaveLength(1);
		expect(rows[0].reasonCode).toBe("lead_stale_14d");
		expect(rows[0].score).toBe(55);
	});

	it("skips Won/Lost/Converted leads", () => {
		const now = Date.now();
		const won = fakeLead({ status: "Won", updatedAt: now - 30 * ONE_DAY_MS });
		const lost = fakeLead({ status: "Lost", updatedAt: now - 30 * ONE_DAY_MS });
		const converted = fakeLead({ status: "Converted", updatedAt: now - 30 * ONE_DAY_MS });
		const rows = computeRanking({
			now,
			reminders: [],
			leads: [won, lost, converted],
			deals: [],
			dealMedianValue: 0,
		});
		expect(rows).toHaveLength(0);
	});

	it("boosts a high-value stuck deal by +20", () => {
		const now = Date.now();
		const baseDeal = fakeDeal({
			stageEnteredAt: now - 22 * ONE_DAY_MS,
			value: 1000,
			dealCode: "D-base",
		});
		const bigDeal = fakeDeal({
			stageEnteredAt: now - 22 * ONE_DAY_MS,
			value: 100_000,
			dealCode: "D-big",
		});
		const median = computeDealMedianValue([baseDeal, bigDeal]);
		const rows = computeRanking({
			now,
			reminders: [],
			leads: [],
			deals: [baseDeal, bigDeal],
			dealMedianValue: median,
		});
		const big = rows.find((r) => r.recordCode === "D-big");
		const small = rows.find((r) => r.recordCode === "D-base");
		expect(big).toBeDefined();
		expect(small).toBeDefined();
		expect(big?.reasonCode).toBe("deal_stuck_high_value");
		expect(big?.score).toBeGreaterThan(small?.score ?? 0);
		expect(big?.score).toBeLessThanOrEqual(100);
	});

	it("filters reminders flagged with excludeFromAI", () => {
		const now = Date.now();
		const r = fakeTask({ dueAt: now - ONE_DAY_MS, excludeFromAI: true });
		const rows = computeRanking({
			now,
			reminders: [r],
			leads: [],
			deals: [],
			dealMedianValue: 0,
		});
		expect(rows).toHaveLength(0);
	});

	it("respects the cap parameter", () => {
		const now = Date.now();
		const reminders = Array.from({ length: 5 }, (_, i) =>
			fakeTask({
				_id: `t${i}` as unknown as Doc<"tasks">["_id"],
				taskCode: `T-${String(i).padStart(3, "0")}`,
				dueAt: now - (i + 1) * ONE_DAY_MS,
			}),
		);
		const rows = computeRanking({
			now,
			reminders,
			leads: [],
			deals: [],
			dealMedianValue: 0,
			cap: 3,
		});
		expect(rows).toHaveLength(3);
	});

	it("computeDealMedianValue handles empty + single-deal cases", () => {
		expect(computeDealMedianValue([])).toBe(0);
		expect(computeDealMedianValue([fakeDeal({ value: 100 })])).toBe(100);
		expect(
			computeDealMedianValue([
				fakeDeal({ value: 100 }),
				fakeDeal({ value: 300, dealCode: "D-2" }),
			]),
		).toBe(200);
	});

	it("exposes tunable constants for downstream tests", () => {
		expect(nextActionsTest.STALE_LEAD_DAYS).toBe(7);
		expect(nextActionsTest.STUCK_DEAL_HOT_DAYS).toBe(21);
		expect(nextActionsTest.NEXT_ACTIONS_PER_USER_CAP).toBe(100);
	});
});

// ─── Materialisation tests ────────────────────────────────────────────────

describe("Stage 6 — rebuildForUser materialises rows", () => {
	it("inserts ranked rows for a user with a stale lead + an overdue reminder", async () => {
		const t = convexTest(schema, modules);
		const { userId, asUser } = await seedUser(t);
		const orgId = await seedOrgWithMember(t, userId);

		const now = Date.now();
		await t.run(async (ctx) => {
			await ctx.db.insert("leads", {
				orgId,
				personCode: "P-001",
				displayName: "Sara Khan",
				status: "New",
				source: "manual",
				assignedTo: userId,
				createdAt: now - 20 * ONE_DAY_MS,
				updatedAt: now - 20 * ONE_DAY_MS,
			});
			await ctx.db.insert("tasks", {
				orgId,
				taskCode: "T-001",
				type: "todo",
				personCode: "P-001",
				entityType: "lead",
				entityId: "ignored",
				title: "Call Sara",
				dueAt: now - ONE_DAY_MS,
				assignedTo: userId,
				status: "pending",
				createdAt: now - 5 * ONE_DAY_MS,
			});
		});

		await t.action(internal.ai.actions.rankNextActions.rebuildForUserNow, {
			orgId,
			userId,
		});

		const out = await asUser.query(api.ai.queries.nextActions.listForUser, {
			orgId,
			limit: 10,
		});
		expect(out.count).toBe(2);
		const codes = out.rows.map((r) => r.recordCode);
		expect(codes).toContain("T-001");
		expect(codes).toContain("P-001");
	});

	it("is idempotent — running rebuild twice produces the same row count", async () => {
		const t = convexTest(schema, modules);
		const { userId, asUser } = await seedUser(t);
		const orgId = await seedOrgWithMember(t, userId);

		const now = Date.now();
		await t.run(async (ctx) => {
			await ctx.db.insert("leads", {
				orgId,
				personCode: "P-002",
				displayName: "Ahmed",
				status: "New",
				source: "manual",
				assignedTo: userId,
				createdAt: now - 15 * ONE_DAY_MS,
				updatedAt: now - 15 * ONE_DAY_MS,
			});
		});

		await t.action(internal.ai.actions.rankNextActions.rebuildForUserNow, {
			orgId,
			userId,
		});
		const first = await asUser.query(api.ai.queries.nextActions.listForUser, {
			orgId,
			limit: 10,
		});

		await t.action(internal.ai.actions.rankNextActions.rebuildForUserNow, {
			orgId,
			userId,
		});
		const second = await asUser.query(api.ai.queries.nextActions.listForUser, {
			orgId,
			limit: 10,
		});

		expect(second.count).toBe(first.count);
		expect(second.rows.map((r) => r.recordCode).sort()).toEqual(
			first.rows.map((r) => r.recordCode).sort(),
		);
	});

	it("listForUser respects the limit arg", async () => {
		const t = convexTest(schema, modules);
		const { userId, asUser } = await seedUser(t);
		const orgId = await seedOrgWithMember(t, userId);

		const now = Date.now();
		await t.run(async (ctx) => {
			for (let i = 0; i < 5; i++) {
				await ctx.db.insert("tasks", {
					orgId,
					taskCode: `T-${String(i).padStart(3, "0")}`,
					type: "todo",
					personCode: "P-001",
					entityType: "lead",
					entityId: "x",
					title: `Reminder ${i}`,
					dueAt: now - (i + 1) * ONE_DAY_MS,
					assignedTo: userId,
					status: "pending",
					createdAt: now - 5 * ONE_DAY_MS,
				});
			}
		});

		await t.action(internal.ai.actions.rankNextActions.rebuildForUserNow, {
			orgId,
			userId,
		});

		const out = await asUser.query(api.ai.queries.nextActions.listForUser, {
			orgId,
			limit: 2,
		});
		expect(out.count).toBe(2);
		expect(out.rows).toHaveLength(2);
	});
});

// ─── Dismiss + snooze ─────────────────────────────────────────────────────

describe("Stage 6 — dismissNextAction + snoozeNextAction", () => {
	it("dismissNextAction deletes the row + records the fingerprint", async () => {
		const t = convexTest(schema, modules);
		const { userId, asUser } = await seedUser(t);
		const orgId = await seedOrgWithMember(t, userId);

		const now = Date.now();
		await t.run(async (ctx) => {
			await ctx.db.insert("leads", {
				orgId,
				personCode: "P-100",
				displayName: "Test Lead",
				status: "New",
				source: "manual",
				assignedTo: userId,
				createdAt: now - 20 * ONE_DAY_MS,
				updatedAt: now - 20 * ONE_DAY_MS,
			});
		});
		await t.action(internal.ai.actions.rankNextActions.rebuildForUserNow, {
			orgId,
			userId,
		});

		const before = await asUser.query(api.ai.queries.nextActions.listForUser, {
			orgId,
			limit: 5,
		});
		expect(before.count).toBe(1);
		const actionId = before.rows[0].id;

		await asUser.mutation(api.ai.queries.nextActions.dismissNextAction, {
			orgId,
			actionId,
		});

		const after = await asUser.query(api.ai.queries.nextActions.listForUser, {
			orgId,
			limit: 5,
		});
		expect(after.count).toBe(0);

		const user = await t.run(async (ctx) => ctx.db.get(userId));
		const dismissed = user?.preferences?.aiPulseDismissed ?? {};
		const keys = Object.keys(dismissed);
		expect(keys).toHaveLength(1);
		expect(keys[0]).toContain("P-100");
		expect(keys[0]).toContain("lead_stale_14d");
	});

	it("snoozeNextAction patches snoozedUntil so the row drops out of listForUser", async () => {
		const t = convexTest(schema, modules);
		const { userId, asUser } = await seedUser(t);
		const orgId = await seedOrgWithMember(t, userId);

		const now = Date.now();
		await t.run(async (ctx) => {
			await ctx.db.insert("leads", {
				orgId,
				personCode: "P-200",
				displayName: "Snooze Lead",
				status: "New",
				source: "manual",
				assignedTo: userId,
				createdAt: now - 20 * ONE_DAY_MS,
				updatedAt: now - 20 * ONE_DAY_MS,
			});
		});
		await t.action(internal.ai.actions.rankNextActions.rebuildForUserNow, {
			orgId,
			userId,
		});
		const before = await asUser.query(api.ai.queries.nextActions.listForUser, {
			orgId,
			limit: 5,
		});
		const actionId = before.rows[0].id;

		const result = await asUser.mutation(api.ai.queries.nextActions.snoozeNextAction, {
			orgId,
			actionId,
			days: 7,
		});
		expect(result.snoozedUntil).toBeGreaterThan(now);

		const after = await asUser.query(api.ai.queries.nextActions.listForUser, {
			orgId,
			limit: 5,
		});
		expect(after.count).toBe(0);
	});

	it("dismissNextAction refuses cross-tenant + non-owner calls", async () => {
		const t = convexTest(schema, modules);
		const { userId, asUser } = await seedUser(t);
		const { userId: otherUserId } = await seedUser(t);
		const orgId = await seedOrgWithMember(t, userId);
		await seedOrgWithMember(t, otherUserId);

		const now = Date.now();
		await t.run(async (ctx) => {
			await ctx.db.insert("aiNextActions", {
				orgId,
				userId,
				recordKind: "lead",
				recordCode: "P-X",
				score: 50,
				confidence: "medium",
				reasonCode: "lead_stale_7d",
				reasonText: "test",
				suggestedIntent: "test",
				expiresAt: now + ONE_DAY_MS,
				createdAt: now,
			});
		});

		const list = await asUser.query(api.ai.queries.nextActions.listForUser, {
			orgId,
			limit: 5,
		});
		const actionId = list.rows[0].id;

		// Try to dismiss as the OTHER user — should reject because they
		// aren't a member of `orgId`. requireOrgMember throws first.
		const otherAsUser = t.withIdentity({ subject: otherUserId });
		await expect(
			otherAsUser.mutation(api.ai.queries.nextActions.dismissNextAction, {
				orgId,
				actionId,
			}),
		).rejects.toThrow();
	});
});

// ─── Cron action (rebuildAllOrgs) ─────────────────────────────────────────

describe("Stage 6 — rebuildAllOrgs cron entry", () => {
	it("is a no-op on an empty workspace", async () => {
		const t = convexTest(schema, modules);
		const result = await t.action(internal.ai.actions.rankNextActions.rebuildAllOrgs, {});
		expect(result.memberships).toBe(0);
		expect(result.scheduled).toBe(0);
	});

	it("enumerates active memberships when an org has a member", async () => {
		const t = convexTest(schema, modules);
		const { userId } = await seedUser(t);
		await seedOrgWithMember(t, userId);

		const memberships = await t.query(
			internal.ai.actions.rankNextActions.listActiveOrgMemberships,
			{},
		);
		expect(memberships.length).toBe(1);
		expect(memberships[0].userId).toBe(userId);
	});
});

// ─── Anomalies ────────────────────────────────────────────────────────────

describe("Stage 6 — pure anomaly detector", () => {
	it("ignores deltas below the 10% threshold", () => {
		const now = Date.now();
		const fourteenDaysAgo = now - 14 * ONE_DAY_MS;
		const sevenDaysAgo = now - 7 * ONE_DAY_MS;
		const leads: Doc<"leads">[] = [
			fakeLead({ createdAt: sevenDaysAgo + 1, _creationTime: sevenDaysAgo + 1 }),
			fakeLead({
				personCode: "P-2",
				createdAt: fourteenDaysAgo + 1,
				_creationTime: fourteenDaysAgo + 1,
			}),
		];
		const rows = detectAnomalies({
			now,
			currency: "USD",
			deals: [],
			leads,
			rangeKey: "7d",
		});
		expect(rows).toHaveLength(0);
	});

	it("flags a >10% week-over-week increase in new leads", () => {
		const now = Date.now();
		const sevenDaysAgo = now - 7 * ONE_DAY_MS;
		const fourteenDaysAgo = now - 14 * ONE_DAY_MS;
		// Current week = 5 leads, prior week = 1 lead → +400% delta.
		const currentLeads = Array.from({ length: 5 }, (_, i) =>
			fakeLead({
				personCode: `P-cur-${i}`,
				createdAt: sevenDaysAgo + (i + 1) * 1000,
				_creationTime: sevenDaysAgo + (i + 1) * 1000,
			}),
		);
		const priorLeads = [
			fakeLead({
				personCode: "P-prev-0",
				createdAt: fourteenDaysAgo + 1000,
				_creationTime: fourteenDaysAgo + 1000,
			}),
		];
		const rows = detectAnomalies({
			now,
			currency: "USD",
			deals: [],
			leads: [...currentLeads, ...priorLeads],
			rangeKey: "7d",
		});
		const leadAnomaly = rows.find((r) => r.metric === "newLeads");
		expect(leadAnomaly).toBeDefined();
		expect(leadAnomaly?.direction).toBe("up");
		expect(leadAnomaly?.percentDelta).toBeGreaterThanOrEqual(10);
	});

	it("classifies severity by absolute % delta", () => {
		expect(anomaliesTest.classifySeverity(5)).toBe("info");
		expect(anomaliesTest.classifySeverity(-20)).toBe("warning");
		expect(anomaliesTest.classifySeverity(40)).toBe("critical");
		expect(anomaliesTest.classifySeverity(-50)).toBe("critical");
	});
});

// ─── Per-category RBAC (2026-06-06) ───────────────────────────────────────
//
// The ranked store mixes lead / deal / reminder rows in one list, so
// `listForUser` must filter to the kinds the member's ROLE permits — not
// dump every kind once the user can see any one of them. These tests pin
// that contract: a tasks-only role sees reminders but not stale leads, and
// a role with no relevant view permission sees nothing at all.

describe("Stage 6 — listForUser per-category RBAC", () => {
	async function seedOrgWithPerms(
		t: ReturnType<typeof convexTest>,
		userId: string,
		permissions: string[],
	) {
		return t.run(async (ctx) => {
			const now = Date.now();
			const orgId = await ctx.db.insert("orgs", {
				name: "RBAC Org",
				slug: `rbac-${now}-${Math.random().toString(36).slice(2, 6)}`,
				plan: "free",
				platformOrgId: "ORB-RBAC",
				settings: { defaultCurrency: "USD" },
				createdAt: now,
				updatedAt: now,
			});
			const roleId = await ctx.db.insert("orgRoles", {
				orgId,
				name: "Custom",
				permissions,
				isSystem: false,
				isDefault: false,
				createdAt: now,
				updatedAt: now,
			});
			await ctx.db.insert("orgMembers", { orgId, userId, roleId, joinedAt: now });
			return orgId;
		});
	}

	async function seedStaleLeadAndOverdueTask(
		t: ReturnType<typeof convexTest>,
		orgId: string,
		userId: string,
	) {
		const now = Date.now();
		await t.run(async (ctx) => {
			await ctx.db.insert("leads", {
				orgId: orgId as unknown as Doc<"leads">["orgId"],
				personCode: "P-001",
				displayName: "Sara Khan",
				status: "New",
				source: "manual",
				assignedTo: userId as unknown as Doc<"leads">["assignedTo"],
				createdAt: now - 20 * ONE_DAY_MS,
				updatedAt: now - 20 * ONE_DAY_MS,
			});
			await ctx.db.insert("tasks", {
				orgId: orgId as unknown as Doc<"tasks">["orgId"],
				taskCode: "T-001",
				type: "todo",
				personCode: "P-001",
				entityType: "lead",
				entityId: "ignored",
				title: "Call Sara",
				dueAt: now - ONE_DAY_MS,
				assignedTo: userId as unknown as Doc<"tasks">["assignedTo"],
				status: "pending",
				createdAt: now - 5 * ONE_DAY_MS,
			});
		});
	}

	it("hides record kinds the member's role can't view (tasks.view only)", async () => {
		const t = convexTest(schema, modules);
		const { userId, asUser } = await seedUser(t);
		const orgId = await seedOrgWithPerms(t, userId, ["tasks.view"]);
		await seedStaleLeadAndOverdueTask(t, orgId, userId);

		await t.action(internal.ai.actions.rankNextActions.rebuildForUserNow, { orgId, userId });

		const out = await asUser.query(api.ai.queries.nextActions.listForUser, {
			orgId,
			limit: 10,
		});
		const codes = out.rows.map((r) => r.recordCode);
		expect(codes).toContain("T-001"); // reminder visible — has tasks.view
		expect(codes).not.toContain("P-001"); // lead hidden — no leads.view
	});

	it("returns empty (no throw) when the role has no relevant view permission", async () => {
		const t = convexTest(schema, modules);
		const { userId, asUser } = await seedUser(t);
		const orgId = await seedOrgWithPerms(t, userId, ["members.view"]);
		await seedStaleLeadAndOverdueTask(t, orgId, userId);

		await t.action(internal.ai.actions.rankNextActions.rebuildForUserNow, { orgId, userId });

		const out = await asUser.query(api.ai.queries.nextActions.listForUser, {
			orgId,
			limit: 10,
		});
		expect(out.count).toBe(0);
		expect(out.rows).toEqual([]);
	});
});
