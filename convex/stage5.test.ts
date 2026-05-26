/// <reference types="vite/client" />
/**
 * Tests for Stage 5 of /SPRINT-PLAN.md — AI dashboard surface.
 *
 * Three areas covered:
 *  1. Widget registry — `ai.quickComposer` + `ai.pulseRibbon` are
 *     accepted by `validateDashboardLayout` and have correct metadata.
 *  2. Telemetry reliability — `getOrgUsage(...).reliability.perTool`
 *     surfaces successRate, avgDurationMs, topErrorReason from seeded
 *     aiToolEvents.
 *  3. Migration idempotency —
 *     `_migrations/2026_05_26_addAiDashboardWidgets.ts` patches once
 *     and is a no-op on the second run.
 *
 * Runs under the same convex-test harness as `convex/crm-hardening.test.ts`.
 */

import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";
import { api, internal } from "./_generated/api";
import { getDefaultPermissionsForRole } from "./_shared/permissions/derive";
import { isWidgetKey, validateDashboardLayout, WIDGETS } from "./_shared/widgetRegistry";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");

async function seedUser(t: ReturnType<typeof convexTest>) {
	const now = Date.now();
	const email = `alice-${now}-${Math.random().toString(36).slice(2, 6)}@example.com`;
	const userId = await t.run(async (ctx) => {
		return ctx.db.insert("users", {
			tokenIdentifier: `password|${email}`,
			email,
			name: email.split("@")[0],
			onboardingCompleted: false,
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
			name: "Test Org",
			slug: `stage5-${now}-${Math.random().toString(36).slice(2, 6)}`,
			plan: "free",
			platformOrgId: "ORB-TEST",
			settings,
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

describe("Stage 5 — AI dashboard widget keys", () => {
	it("registers ai.quickComposer in WIDGET_KEYS with correct metadata", () => {
		expect(isWidgetKey("ai.quickComposer")).toBe(true);
		const meta = WIDGETS["ai.quickComposer"];
		expect(meta.category).toBe("ai");
		expect(meta.size).toBe("full");
		expect(meta.label).toBeTruthy();
		expect(meta.description).toBeTruthy();
		expect(meta.placeholder).toBeFalsy();
	});

	it("registers ai.pulseRibbon in WIDGET_KEYS with correct metadata", () => {
		expect(isWidgetKey("ai.pulseRibbon")).toBe(true);
		const meta = WIDGETS["ai.pulseRibbon"];
		expect(meta.category).toBe("ai");
		expect(meta.size).toBe("full");
		expect(meta.label).toBeTruthy();
		expect(meta.description).toBeTruthy();
		expect(meta.placeholder).toBeFalsy();
	});

	it("validateDashboardLayout accepts the new keys", () => {
		const result = validateDashboardLayout([
			"ai.quickComposer",
			"ai.pulseRibbon",
			"leads.open",
		]);
		expect(result.rejected).toEqual([]);
		expect(result.keys).toEqual(["ai.quickComposer", "ai.pulseRibbon", "leads.open"]);
	});
});

describe("Stage 5 — telemetry reliability", () => {
	it("returns an empty perTool array for an org with no aiToolEvents", async () => {
		const t = convexTest(schema, modules);
		const { userId, asUser } = await seedUser(t);
		const orgId = await seedOrgWithMember(t, userId);

		const usage = await asUser.query(api.ai.queries.telemetry.getOrgUsage, {
			orgId,
			range: "30d",
		});

		expect(usage.reliability).toBeDefined();
		expect(usage.reliability.windowMs).toBe(30 * 24 * 60 * 60 * 1000);
		expect(usage.reliability.perTool).toEqual([]);
	});

	it("aggregates per-tool stats across success + failure events", async () => {
		const t = convexTest(schema, modules);
		const { userId, asUser } = await seedUser(t);
		const orgId = await seedOrgWithMember(t, userId);

		// Seed a conversation row so aiToolEvents.conversationId validates.
		const conversationId = await t.run(async (ctx) => {
			const now = Date.now();
			return ctx.db.insert("aiConversations", {
				orgId,
				userId,
				title: "Stage 5 test",
				status: "active",
				lastMessageAt: now,
				createdAt: now,
				updatedAt: now,
			});
		});

		const now = Date.now();
		await t.run(async (ctx) => {
			// Tool A — 4 ok, 1 error with errorCode = "RATE_LIMIT"
			for (let i = 0; i < 4; i++) {
				await ctx.db.insert("aiToolEvents", {
					orgId,
					userId,
					conversationId,
					toolName: "create_lead",
					ok: true,
					startedAt: now - i * 1000,
					durationMs: 100 + i * 10,
					expiresAt: now + 30 * 24 * 60 * 60 * 1000,
				});
			}
			await ctx.db.insert("aiToolEvents", {
				orgId,
				userId,
				conversationId,
				toolName: "create_lead",
				ok: false,
				errorCode: "RATE_LIMIT",
				errorMessage: "Too many requests",
				startedAt: now - 5000,
				durationMs: 200,
				expiresAt: now + 30 * 24 * 60 * 60 * 1000,
			});
			// Tool B — 1 ok, 2 errors of different codes (top should pick whichever appears more, here both =1 → first wins)
			await ctx.db.insert("aiToolEvents", {
				orgId,
				userId,
				conversationId,
				toolName: "send_message",
				ok: true,
				startedAt: now - 6000,
				durationMs: 150,
				expiresAt: now + 30 * 24 * 60 * 60 * 1000,
			});
			await ctx.db.insert("aiToolEvents", {
				orgId,
				userId,
				conversationId,
				toolName: "send_message",
				ok: false,
				errorCode: "BUDGET_EXCEEDED",
				startedAt: now - 7000,
				durationMs: 50,
				expiresAt: now + 30 * 24 * 60 * 60 * 1000,
			});
			await ctx.db.insert("aiToolEvents", {
				orgId,
				userId,
				conversationId,
				toolName: "send_message",
				ok: false,
				errorCode: "BUDGET_EXCEEDED",
				startedAt: now - 8000,
				durationMs: 60,
				expiresAt: now + 30 * 24 * 60 * 60 * 1000,
			});
		});

		const usage = await asUser.query(api.ai.queries.telemetry.getOrgUsage, {
			orgId,
			range: "30d",
		});

		const byName = new Map(usage.reliability.perTool.map((t) => [t.toolName, t]));
		const lead = byName.get("create_lead");
		expect(lead).toBeDefined();
		expect(lead?.callCount).toBe(5);
		expect(lead?.successCount).toBe(4);
		expect(lead?.errorCount).toBe(1);
		expect(lead?.successRate).toBeCloseTo(0.8, 5);
		expect(lead?.avgDurationMs).toBeGreaterThan(0);
		expect(lead?.topErrorReason).toBe("RATE_LIMIT");
		expect(lead?.topErrorCount).toBe(1);

		const send = byName.get("send_message");
		expect(send).toBeDefined();
		expect(send?.callCount).toBe(3);
		expect(send?.successCount).toBe(1);
		expect(send?.errorCount).toBe(2);
		expect(send?.topErrorReason).toBe("BUDGET_EXCEEDED");
		expect(send?.topErrorCount).toBe(2);

		// Sorted by callCount desc → create_lead before send_message.
		expect(usage.reliability.perTool[0]?.toolName).toBe("create_lead");
	});

	it("falls back to 'unknown' when an error event has no errorCode + no errorMessage", async () => {
		const t = convexTest(schema, modules);
		const { userId, asUser } = await seedUser(t);
		const orgId = await seedOrgWithMember(t, userId);

		const conversationId = await t.run(async (ctx) => {
			const now = Date.now();
			return ctx.db.insert("aiConversations", {
				orgId,
				userId,
				title: "Stage 5 unknown",
				status: "active",
				lastMessageAt: now,
				createdAt: now,
				updatedAt: now,
			});
		});

		const now = Date.now();
		await t.run(async (ctx) => {
			await ctx.db.insert("aiToolEvents", {
				orgId,
				userId,
				conversationId,
				toolName: "search_crm",
				ok: false,
				startedAt: now - 1000,
				durationMs: 50,
				expiresAt: now + 30 * 24 * 60 * 60 * 1000,
			});
		});

		const usage = await asUser.query(api.ai.queries.telemetry.getOrgUsage, {
			orgId,
			range: "30d",
		});

		const search = usage.reliability.perTool.find((t) => t.toolName === "search_crm");
		expect(search?.topErrorReason).toBe("unknown");
	});
});

describe("Stage 5 — addAiDashboardWidgets migration", () => {
	it("inserts ai.pulseRibbon + ai.quickComposer at the front of dashboardMetrics", async () => {
		const t = convexTest(schema, modules);
		const { userId } = await seedUser(t);
		const orgId = await seedOrgWithMember(t, userId, {
			dashboardMetrics: ["leads.open", "deals.open"],
		});

		const result = await t.mutation(
			internal._migrations["2026_05_26_addAiDashboardWidgets"].run,
			{},
		);
		expect(result.patched).toBe(1);
		expect(result.scanned).toBe(1);
		expect(result.unchanged).toBe(0);

		const updated = await t.run(async (ctx) => ctx.db.get(orgId));
		expect(updated?.settings?.dashboardMetrics).toEqual([
			"ai.pulseRibbon",
			"ai.quickComposer",
			"leads.open",
			"deals.open",
		]);
	});

	it("inserts new keys after a leading ai.morningBriefing if present", async () => {
		const t = convexTest(schema, modules);
		const { userId } = await seedUser(t);
		const orgId = await seedOrgWithMember(t, userId, {
			dashboardMetrics: ["ai.morningBriefing", "leads.open"],
		});

		await t.mutation(internal._migrations["2026_05_26_addAiDashboardWidgets"].run, {});

		const updated = await t.run(async (ctx) => ctx.db.get(orgId));
		expect(updated?.settings?.dashboardMetrics).toEqual([
			"ai.morningBriefing",
			"ai.pulseRibbon",
			"ai.quickComposer",
			"leads.open",
		]);
	});

	it("is idempotent — second run reports unchanged=1 and patched=0", async () => {
		const t = convexTest(schema, modules);
		const { userId } = await seedUser(t);
		await seedOrgWithMember(t, userId, {
			dashboardMetrics: ["leads.open"],
		});

		const first = await t.mutation(
			internal._migrations["2026_05_26_addAiDashboardWidgets"].run,
			{},
		);
		expect(first.patched).toBe(1);

		const second = await t.mutation(
			internal._migrations["2026_05_26_addAiDashboardWidgets"].run,
			{},
		);
		expect(second.patched).toBe(0);
		expect(second.unchanged).toBe(1);
	});

	it("skips orgs with no explicit dashboardMetrics array", async () => {
		const t = convexTest(schema, modules);
		const { userId } = await seedUser(t);
		await seedOrgWithMember(t, userId, {}); // no dashboardMetrics

		const result = await t.mutation(
			internal._migrations["2026_05_26_addAiDashboardWidgets"].run,
			{},
		);
		expect(result.patched).toBe(0);
		expect(result.skippedNoArray).toBe(1);
	});

	it("dryRun=true reports the patch without writing", async () => {
		const t = convexTest(schema, modules);
		const { userId } = await seedUser(t);
		const orgId = await seedOrgWithMember(t, userId, {
			dashboardMetrics: ["leads.open"],
		});

		const result = await t.mutation(
			internal._migrations["2026_05_26_addAiDashboardWidgets"].run,
			{ dryRun: true },
		);
		expect(result.patched).toBe(1);
		expect(result.dryRun).toBe(true);

		const fresh = await t.run(async (ctx) => ctx.db.get(orgId));
		expect(fresh?.settings?.dashboardMetrics).toEqual(["leads.open"]); // unchanged
	});
});

describe("Stage 5 — dismissAiPulseSuggestion mutation", () => {
	it("appends the suggestion id with a dismissedAt timestamp", async () => {
		const t = convexTest(schema, modules);
		const { userId, asUser } = await seedUser(t);

		await asUser.mutation(api.users.mutations.dismissAiPulseSuggestion, {
			suggestionId: "stale-lead-P-001",
		});

		const fresh = await t.run(async (ctx) => ctx.db.get(userId));
		const dismissed = fresh?.preferences?.aiPulseDismissed ?? {};
		expect(dismissed["stale-lead-P-001"]).toBeTypeOf("number");
		expect(Object.keys(dismissed)).toHaveLength(1);
	});

	it("is idempotent — dismissing twice keeps a single entry with the latest timestamp", async () => {
		const t = convexTest(schema, modules);
		const { userId, asUser } = await seedUser(t);

		await asUser.mutation(api.users.mutations.dismissAiPulseSuggestion, {
			suggestionId: "id-A",
		});
		await asUser.mutation(api.users.mutations.dismissAiPulseSuggestion, {
			suggestionId: "id-A",
		});

		const fresh = await t.run(async (ctx) => ctx.db.get(userId));
		const dismissed = fresh?.preferences?.aiPulseDismissed ?? {};
		expect(Object.keys(dismissed)).toEqual(["id-A"]);
	});

	it("caps the dismiss map at 50 entries (drops the oldest by dismissedAt)", async () => {
		const t = convexTest(schema, modules);
		const { userId, asUser } = await seedUser(t);

		// Pre-seed 50 entries with descending timestamps so we know which
		// will be dropped. The oldest = "id-0" with the smallest ts.
		const baseline = Date.now() - 1_000_000;
		await t.run(async (ctx) => {
			const seeded: Record<string, number> = {};
			for (let i = 0; i < 50; i++) {
				seeded[`id-${i}`] = baseline + i; // older ids have smaller ts
			}
			await ctx.db.patch(userId, {
				preferences: { aiPulseDismissed: seeded },
				updatedAt: Date.now(),
			});
		});

		await asUser.mutation(api.users.mutations.dismissAiPulseSuggestion, {
			suggestionId: "id-NEW",
		});

		const fresh = await t.run(async (ctx) => ctx.db.get(userId));
		const dismissed = fresh?.preferences?.aiPulseDismissed ?? {};
		expect(Object.keys(dismissed)).toHaveLength(50);
		expect(dismissed["id-NEW"]).toBeTypeOf("number");
		// Oldest entry "id-0" should have been dropped.
		expect(dismissed["id-0"]).toBeUndefined();
		// "id-49" (newest seeded) should still be present.
		expect(dismissed["id-49"]).toBeDefined();
	});

	it("rejects empty + over-long suggestion ids", async () => {
		const t = convexTest(schema, modules);
		const { asUser } = await seedUser(t);
		await expect(
			asUser.mutation(api.users.mutations.dismissAiPulseSuggestion, { suggestionId: "" }),
		).rejects.toThrow();
		await expect(
			asUser.mutation(api.users.mutations.dismissAiPulseSuggestion, {
				suggestionId: "x".repeat(201),
			}),
		).rejects.toThrow();
	});
});
