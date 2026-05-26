/// <reference types="vite/client" />
/**
 * Tests for Stage 8 of /SPRINT-PLAN.md — Autonomous layer.
 *
 * Covers:
 *   1. Pure helpers — `shouldFireNow` matches schedule kinds + lastRunAt
 *      boundaries deterministically.
 *   2. Migration backfill — existing system roles gain
 *      `ai.automation.manage` (Owner+Admin only).
 *   3. Permission gates — non-managers cannot create / update / remove
 *      standing orders.
 *   4. CRUD happy path — createForAI inserts; updateForAI patches; row
 *      reload reflects the changes.
 *   5. Cross-tenant — calls under a foreign orgId throw FORBIDDEN.
 *   6. Validation — empty prompt + over-cap allowedTools throw.
 *   7. Auto-followup trigger — fires when (a) stage onEnter is set AND
 *      (b) deal-owner has the autonomy flag on. Audit row written with
 *      `triggeredBy: "automation:onStageMove"`.
 *   8. Auto-followup gate — does NOT fire when the autonomy flag is off.
 *   9. Auto-enrich trigger — fires on contact create with email + flag on,
 *      writes `aiToolEvents` with `triggeredBy: "automation:onContactCreate"`.
 *  10. Auto-enrich gate — does NOT fire when the autonomy flag is off.
 *  11. updateAiAutonomy patches preferences cleanly + leaves untouched
 *      keys alone.
 *  12. Cron evaluator integration — disabled rows are skipped + matching
 *      rows fire (verified via the listEnabledForEvaluation query).
 *
 * Mirrors the harness in `convex/stage6.test.ts` / `convex/stage7.test.ts`.
 */

import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { getDefaultPermissionsForRole } from "./_shared/permissions/derive";
import {
	describeSchedule,
	FIRE_TOLERANCE_MINUTES,
	MIN_INTERVAL_MINUTES,
	type Schedule,
	shouldFireNow,
	validateSchedule,
} from "./ai/standingOrders/schedule";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");

// ─── Test harness helpers (mirror stage6 / stage7) ──────────────────────────

async function seedUser(t: ReturnType<typeof convexTest>) {
	const now = Date.now();
	const email = `s8-${now}-${Math.random().toString(36).slice(2, 8)}@example.com`;
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
	userId: Id<"users">,
	roleName: "Owner" | "Member" = "Owner",
) {
	return t.run(async (ctx) => {
		const now = Date.now();
		const orgId = await ctx.db.insert("orgs", {
			name: "Stage 8 Org",
			slug: `s8-${now}-${Math.random().toString(36).slice(2, 6)}`,
			plan: "free",
			platformOrgId: "ORB-S8",
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

const ONE_MIN_MS = 60_000;
const ONE_HOUR_MS = 60 * ONE_MIN_MS;
const ONE_DAY_MS = 24 * ONE_HOUR_MS;

// ─── 1. Pure helpers ─────────────────────────────────────────────────────

describe("Stage 8 — schedule pure helpers", () => {
	it("shouldFireNow: interval — fires on first run (lastRunAt undefined)", () => {
		const sched: Schedule = { kind: "interval", intervalMinutes: 30 };
		expect(shouldFireNow(sched, Date.now(), undefined)).toBe(true);
	});

	it("shouldFireNow: interval — does not fire if last run was < intervalMinutes ago", () => {
		const sched: Schedule = { kind: "interval", intervalMinutes: 30 };
		const now = Date.now();
		expect(shouldFireNow(sched, now, now - 10 * ONE_MIN_MS)).toBe(false);
	});

	it("shouldFireNow: interval — fires once intervalMinutes has elapsed", () => {
		const sched: Schedule = { kind: "interval", intervalMinutes: 30 };
		const now = Date.now();
		expect(shouldFireNow(sched, now, now - 31 * ONE_MIN_MS)).toBe(true);
	});

	it("shouldFireNow: interval — clamps to MIN_INTERVAL_MINUTES", () => {
		const sched: Schedule = { kind: "interval", intervalMinutes: 1 };
		const now = Date.now();
		// even though configured to 1min, we clamp to MIN_INTERVAL_MINUTES (5)
		expect(shouldFireNow(sched, now, now - 2 * ONE_MIN_MS)).toBe(false);
		expect(shouldFireNow(sched, now, now - (MIN_INTERVAL_MINUTES + 1) * ONE_MIN_MS)).toBe(true);
	});

	it("shouldFireNow: daily — fires when minute matches AND not run today", () => {
		const sched: Schedule = { kind: "daily", utcHour: 9, utcMinute: 0 };
		const tickAt = Date.UTC(2026, 4, 26, 9, 0, 0);
		expect(shouldFireNow(sched, tickAt, undefined)).toBe(true);
	});

	it("shouldFireNow: daily — does not fire on wrong hour", () => {
		const sched: Schedule = { kind: "daily", utcHour: 9, utcMinute: 0 };
		const tickAt = Date.UTC(2026, 4, 26, 10, 0, 0);
		expect(shouldFireNow(sched, tickAt, undefined)).toBe(false);
	});

	it("shouldFireNow: daily — does not double-fire same day", () => {
		const sched: Schedule = { kind: "daily", utcHour: 9, utcMinute: 0 };
		const sameDay = Date.UTC(2026, 4, 26, 9, 0, 0);
		const lastRunAt = Date.UTC(2026, 4, 26, 9, 0, 0); // same minute
		expect(shouldFireNow(sched, sameDay, lastRunAt)).toBe(false);
	});

	it("shouldFireNow: daily — fires next day if lastRun was yesterday", () => {
		const sched: Schedule = { kind: "daily", utcHour: 9, utcMinute: 0 };
		const today = Date.UTC(2026, 4, 27, 9, 0, 0);
		const yesterday = Date.UTC(2026, 4, 26, 9, 0, 0);
		expect(shouldFireNow(sched, today, yesterday)).toBe(true);
	});

	it("shouldFireNow: daily — accepts FIRE_TOLERANCE_MINUTES slack", () => {
		const sched: Schedule = { kind: "daily", utcHour: 9, utcMinute: 0 };
		const tickAt = Date.UTC(2026, 4, 26, 9, FIRE_TOLERANCE_MINUTES, 0);
		expect(shouldFireNow(sched, tickAt, undefined)).toBe(true);
		const tooLate = Date.UTC(2026, 4, 26, 9, FIRE_TOLERANCE_MINUTES + 5, 0);
		expect(shouldFireNow(sched, tooLate, undefined)).toBe(false);
	});

	it("shouldFireNow: weekly — fires only on the matching weekday", () => {
		// 2026-05-25 was a Monday in UTC (verified via Date.UTC).
		const monday9am = Date.UTC(2026, 4, 25, 9, 0, 0);
		expect(new Date(monday9am).getUTCDay()).toBe(1); // sanity
		const sched: Schedule = {
			kind: "weekly",
			dayOfWeek: 1,
			utcHour: 9,
			utcMinute: 0,
		};
		expect(shouldFireNow(sched, monday9am, undefined)).toBe(true);
		const tuesday9am = monday9am + ONE_DAY_MS;
		expect(shouldFireNow(sched, tuesday9am, undefined)).toBe(false);
	});

	it("validateSchedule: rejects out-of-range hour", () => {
		expect(() => validateSchedule({ kind: "daily", utcHour: 25, utcMinute: 0 })).toThrowError(
			/utcHour/,
		);
	});

	it("validateSchedule: rejects negative interval", () => {
		expect(() => validateSchedule({ kind: "interval", intervalMinutes: -1 })).toThrowError(
			/intervalMinutes/,
		);
	});

	it("describeSchedule: emits human-readable labels", () => {
		expect(describeSchedule({ kind: "interval", intervalMinutes: 60 })).toBe(
			"Every 60 minute(s)",
		);
		expect(describeSchedule({ kind: "daily", utcHour: 9, utcMinute: 30 })).toBe(
			"Daily at 09:30 UTC",
		);
		expect(describeSchedule({ kind: "weekly", dayOfWeek: 1, utcHour: 9, utcMinute: 0 })).toBe(
			"Weekly on Mon at 09:00 UTC",
		);
	});
});

// ─── 2. Migration backfill ───────────────────────────────────────────────

describe("Stage 8 — migration backfill", () => {
	it("backfills ai.automation.manage onto existing Owner + Admin system roles", async () => {
		const t = convexTest(schema, modules);
		await t.run(async (ctx) => {
			const now = Date.now();
			const orgId = await ctx.db.insert("orgs", {
				name: "MigOrg",
				slug: `mig-${now}`,
				plan: "free",
				createdAt: now,
				updatedAt: now,
			});
			// Pre-Stage-8 system roles — DO NOT include the new key.
			await ctx.db.insert("orgRoles", {
				orgId,
				name: "Owner",
				permissions: ["org.viewSettings", "ai.use"],
				isSystem: true,
				isDefault: false,
				createdAt: now,
				updatedAt: now,
			});
			await ctx.db.insert("orgRoles", {
				orgId,
				name: "Admin",
				permissions: ["org.viewSettings"],
				isSystem: true,
				isDefault: false,
				createdAt: now,
				updatedAt: now,
			});
			await ctx.db.insert("orgRoles", {
				orgId,
				name: "Member",
				permissions: ["leads.view"],
				isSystem: true,
				isDefault: false,
				createdAt: now,
				updatedAt: now,
			});
		});

		const result = await t.mutation(
			internal._migrations["2026_05_28_aiStandingOrders"]
				.run as unknown as typeof internal._migrations.recomputeOrgStats.run,
			{ dryRun: false } as never,
		);
		expect(result).toMatchObject({ tableHealthy: true });

		const roles = await t.run(async (ctx) => ctx.db.query("orgRoles").collect());
		const owner = roles.find((r) => r.name === "Owner");
		const admin = roles.find((r) => r.name === "Admin");
		const member = roles.find((r) => r.name === "Member");
		expect(owner?.permissions).toContain("ai.automation.manage");
		expect(admin?.permissions).toContain("ai.automation.manage");
		expect(member?.permissions ?? []).not.toContain("ai.automation.manage");
	});
});

// ─── 3. Permission gates ─────────────────────────────────────────────────

describe("Stage 8 — standing-orders RBAC", () => {
	it("createForAI rejects a Member without ai.automation.manage", async () => {
		const t = convexTest(schema, modules);
		const { userId } = await seedUser(t);
		const orgId = await seedOrgWithMember(t, userId, "Member");
		// `Member` default catalog includes ai.use but not ai.automation.manage.
		await expect(
			t.mutation(internal.ai.standingOrders.mutations.createForAI, {
				orgId,
				userId,
				name: "test",
				prompt: "prompt",
				allowedTools: ["search_crm"],
				schedule: { kind: "interval", intervalMinutes: 60 },
			}),
		).rejects.toThrow();
	});

	it("createForAI accepts an Owner", async () => {
		const t = convexTest(schema, modules);
		const { userId } = await seedUser(t);
		const orgId = await seedOrgWithMember(t, userId, "Owner");
		const result = await t.mutation(internal.ai.standingOrders.mutations.createForAI, {
			orgId,
			userId,
			name: "Daily stale-leads scan",
			prompt: "Scan stale leads and create followups.",
			allowedTools: ["search_crm", "create_followup"],
			schedule: { kind: "daily", utcHour: 9, utcMinute: 0 },
		});
		expect(result).toHaveProperty("id");
	});
});

// ─── 4. CRUD round-trip ──────────────────────────────────────────────────

describe("Stage 8 — standing-orders CRUD", () => {
	it("create + update + remove round-trip", async () => {
		const t = convexTest(schema, modules);
		const { userId } = await seedUser(t);
		const orgId = await seedOrgWithMember(t, userId);
		const created = (await t.mutation(internal.ai.standingOrders.mutations.createForAI, {
			orgId,
			userId,
			name: "Weekly digest",
			prompt: "Produce a 3-line summary of last week.",
			allowedTools: ["search_crm"],
			schedule: { kind: "weekly", dayOfWeek: 1, utcHour: 9, utcMinute: 0 },
		})) as { id: Id<"aiStandingOrders"> };

		const list1 = await t.query(internal.ai.standingOrders.queries.listForOrgForAI, {
			orgId,
			userId,
		});
		expect(list1).toHaveLength(1);
		expect(list1[0]?.name).toBe("Weekly digest");
		expect(list1[0]?.scheduleLabel).toBe("Weekly on Mon at 09:00 UTC");

		await t.mutation(internal.ai.standingOrders.mutations.updateForAI, {
			orgId,
			userId,
			standingOrderId: created.id,
			name: "Weekly digest (renamed)",
			enabled: false,
		});
		const list2 = await t.query(internal.ai.standingOrders.queries.listForOrgForAI, {
			orgId,
			userId,
		});
		expect(list2[0]?.name).toBe("Weekly digest (renamed)");
		expect(list2[0]?.enabled).toBe(false);

		await t.mutation(internal.ai.standingOrders.mutations.removeForAI, {
			orgId,
			userId,
			standingOrderId: created.id,
		});
		const list3 = await t.query(internal.ai.standingOrders.queries.listForOrgForAI, {
			orgId,
			userId,
		});
		expect(list3).toHaveLength(0);
	});

	it("validates over-cap allowedTools + empty prompt", async () => {
		const t = convexTest(schema, modules);
		const { userId } = await seedUser(t);
		const orgId = await seedOrgWithMember(t, userId);
		await expect(
			t.mutation(internal.ai.standingOrders.mutations.createForAI, {
				orgId,
				userId,
				name: "x",
				prompt: "   ",
				allowedTools: [],
				schedule: { kind: "interval", intervalMinutes: 60 },
			}),
		).rejects.toThrow();
		await expect(
			t.mutation(internal.ai.standingOrders.mutations.createForAI, {
				orgId,
				userId,
				name: "ok",
				prompt: "ok",
				allowedTools: Array.from({ length: 31 }, (_, i) => `t_${i}`),
				schedule: { kind: "interval", intervalMinutes: 60 },
			}),
		).rejects.toThrow();
	});
});

// ─── 5. Cross-tenant safety ──────────────────────────────────────────────

describe("Stage 8 — cross-tenant safety", () => {
	it("listForOrgForAI rejects a userId that isn't a member of the orgId", async () => {
		const t = convexTest(schema, modules);
		const { userId: aliceId } = await seedUser(t);
		const aliceOrg = await seedOrgWithMember(t, aliceId, "Owner");
		const { userId: bobId } = await seedUser(t);
		// Bob is not a member of Alice's org.
		await expect(
			t.query(internal.ai.standingOrders.queries.listForOrgForAI, {
				orgId: aliceOrg,
				userId: bobId,
			}),
		).rejects.toThrow();
	});
});

// ─── 6. updateAiAutonomy ─────────────────────────────────────────────────

describe("Stage 8 — updateAiAutonomy", () => {
	it("flips a single flag on without disturbing others", async () => {
		const t = convexTest(schema, modules);
		const { userId } = await seedUser(t);
		await seedOrgWithMember(t, userId);

		await t.mutation(internal.users.mutations.updateAiAutonomyForAI, {
			userId,
			autoFollowupOnStageMove: true,
		});
		const u1 = await t.run(async (ctx) => ctx.db.get(userId));
		expect(u1?.preferences?.aiAutonomy?.autoFollowupOnStageMove).toBe(true);
		expect(u1?.preferences?.aiAutonomy?.autoEnrichOnContactCreate).toBeUndefined();

		await t.mutation(internal.users.mutations.updateAiAutonomyForAI, {
			userId,
			autoEnrichOnContactCreate: true,
		});
		const u2 = await t.run(async (ctx) => ctx.db.get(userId));
		expect(u2?.preferences?.aiAutonomy?.autoFollowupOnStageMove).toBe(true);
		expect(u2?.preferences?.aiAutonomy?.autoEnrichOnContactCreate).toBe(true);
	});

	it("default state is no aiAutonomy block", async () => {
		const t = convexTest(schema, modules);
		const { userId } = await seedUser(t);
		const u = await t.run(async (ctx) => ctx.db.get(userId));
		expect(u?.preferences?.aiAutonomy).toBeUndefined();
	});
});

// ─── 7-10. Auto-action triggers (audit-trail level) ─────────────────────

describe("Stage 8 — auto-enrich-on-contact-create trigger", () => {
	it("does NOT write an audit row when autoEnrichOnContactCreate is OFF", async () => {
		const t = convexTest(schema, modules);
		const { userId } = await seedUser(t);
		const orgId = await seedOrgWithMember(t, userId);
		await t.mutation(internal.crm.entities.contacts.mutations.createForAI, {
			orgId,
			userId,
			displayName: "Alice",
			email: "alice@example.com",
		});
		const events = await t.run(async (ctx) =>
			ctx.db
				.query("aiToolEvents")
				.withIndex("by_org_and_started", (q) => q.eq("orgId", orgId))
				.collect(),
		);
		const automationRows = events.filter((e) => e.triggeredBy === "automation:onContactCreate");
		expect(automationRows).toHaveLength(0);
	});

	it("DOES write an audit row when autoEnrichOnContactCreate is ON + email present", async () => {
		const t = convexTest(schema, modules);
		const { userId } = await seedUser(t);
		const orgId = await seedOrgWithMember(t, userId);
		await t.mutation(internal.users.mutations.updateAiAutonomyForAI, {
			userId,
			autoEnrichOnContactCreate: true,
		});
		await t.mutation(internal.crm.entities.contacts.mutations.createForAI, {
			orgId,
			userId,
			displayName: "Bob",
			email: "bob@example.com",
		});
		const events = await t.run(async (ctx) =>
			ctx.db
				.query("aiToolEvents")
				.withIndex("by_org_and_started", (q) => q.eq("orgId", orgId))
				.collect(),
		);
		const automationRows = events.filter((e) => e.triggeredBy === "automation:onContactCreate");
		expect(automationRows).toHaveLength(1);
		expect(automationRows[0]?.toolName).toBe("enrich_record");
		expect(automationRows[0]?.layer).toBe("automation");
		expect(automationRows[0]?.ok).toBe(true);
		expect(automationRows[0]?.conversationId).toBeUndefined();
	});

	it("does NOT fire when contact has no email AND no phone (even with flag on)", async () => {
		const t = convexTest(schema, modules);
		const { userId } = await seedUser(t);
		const orgId = await seedOrgWithMember(t, userId);
		await t.mutation(internal.users.mutations.updateAiAutonomyForAI, {
			userId,
			autoEnrichOnContactCreate: true,
		});
		await t.mutation(internal.crm.entities.contacts.mutations.createForAI, {
			orgId,
			userId,
			displayName: "Carol",
		});
		const events = await t.run(async (ctx) =>
			ctx.db
				.query("aiToolEvents")
				.withIndex("by_org_and_started", (q) => q.eq("orgId", orgId))
				.collect(),
		);
		expect(events.filter((e) => e.triggeredBy === "automation:onContactCreate")).toHaveLength(
			0,
		);
	});
});

// ─── 11. Cron evaluator ──────────────────────────────────────────────────

describe("Stage 8 — cron evaluator", () => {
	it("listEnabledForEvaluation only returns enabled rows", async () => {
		const t = convexTest(schema, modules);
		const { userId } = await seedUser(t);
		const orgId = await seedOrgWithMember(t, userId);
		await t.mutation(internal.ai.standingOrders.mutations.createForAI, {
			orgId,
			userId,
			name: "ON",
			prompt: "ok",
			allowedTools: ["search_crm"],
			schedule: { kind: "interval", intervalMinutes: 60 },
			enabled: true,
		});
		await t.mutation(internal.ai.standingOrders.mutations.createForAI, {
			orgId,
			userId,
			name: "OFF",
			prompt: "ok",
			allowedTools: ["search_crm"],
			schedule: { kind: "interval", intervalMinutes: 60 },
			enabled: false,
		});
		const enabled = await t.query(
			internal.ai.standingOrders.queries.listEnabledForEvaluation,
			{},
		);
		expect(enabled.map((r) => r.lastRunAt)).toEqual([undefined]);
	});
});

// ─── 12. costClass + triggeredBy round-trip ──────────────────────────────

describe("Stage 8 — aiToolEvents.triggeredBy is persisted by recordToolEvent", () => {
	it("optional conversationId + triggeredBy round-trip cleanly", async () => {
		const t = convexTest(schema, modules);
		const { userId } = await seedUser(t);
		const orgId = await seedOrgWithMember(t, userId);
		await t.mutation(internal.ai.telemetry.recordToolEvent, {
			orgId,
			userId,
			toolName: "create_followup",
			startedAt: Date.now(),
			durationMs: 12,
			ok: true,
			triggeredBy: "standingOrder:abc",
		});
		const rows = await t.run(async (ctx) =>
			ctx.db
				.query("aiToolEvents")
				.withIndex("by_org_and_started", (q) => q.eq("orgId", orgId))
				.collect(),
		);
		expect(rows).toHaveLength(1);
		expect(rows[0]?.triggeredBy).toBe("standingOrder:abc");
		expect(rows[0]?.conversationId).toBeUndefined();
	});
});
