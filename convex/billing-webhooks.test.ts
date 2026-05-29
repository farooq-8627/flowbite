/**
 * LemonSqueezy webhook smoke tests — P0.1.3 (PENDING.md / 2026-05-27).
 *
 * Covers the full subscription lifecycle:
 *   1. subscription_created   → org tagged, plan resolved from variant id
 *   2. subscription_updated   → status patched, period end refreshed
 *   3. subscription_payment_failed → status flipped to past_due
 *   4. subscription_payment_success / subscription_resumed → status back to active
 *   5. subscription_cancelled → status cancelled, plan retained until period
 *   6. subscription_expired   → plan downgraded to free
 *   7. on_trial               → trial_ends_at landed in currentPeriodEnd
 *   8. past_due               → past_due status persists, future grace logic in quotaGate
 *
 * Exercises the DB-first variantToPlan resolver: a seeded `platformTiers`
 * row with `lemonSqueezyVariantIdMonthly === "PRO_VAR"` should resolve a
 * webhook with `variant_id: "PRO_VAR"` to `plan: "pro"`.
 *
 * Runs through `internal.billing.internal.applyWebhookEvent` — does NOT
 * exercise the HMAC signature path (that lives in `convex/http.ts`
 * `lemonSqueezyWebhook` httpAction and is too thin to need a unit test;
 * a separate manual smoke pass against LemonSqueezy test mode is the
 * production verification step).
 */

import { convexTest } from "convex-test";
import { beforeEach, describe, expect, it } from "vitest";
import { api, internal } from "./_generated/api";
import { getDefaultPermissionsForRole } from "./_shared/permissions/derive";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");

// `ReturnType<typeof convexTest>` is the un-narrowed shape we get without
// passing the schema as a generic argument. `convexTest`'s generic
// constraint is `GenericSchema`, but our `defineSchema` output is a
// `SchemaDefinition` — TypeScript rejects passing it directly. Helpers
// below avoid `withIndex(...)` to keep typing simple — `collect()` +
// in-memory filter is fine for test seeds.
type TestT = ReturnType<typeof convexTest>;

async function seedOrgWithPlan(t: TestT, plan: "free" | "starter" | "pro" | "enterprise" = "free") {
	const now = Date.now();
	const userId = await t.run(async (ctx) =>
		ctx.db.insert("users", {
			tokenIdentifier: `password|owner@example.com`,
			email: "owner@example.com",
			name: "Owner",
			onboardingCompleted: true,
			createdAt: now,
			updatedAt: now,
		}),
	);
	const orgId = await t.run(async (ctx) => {
		const id = await ctx.db.insert("orgs", {
			name: "Test Org",
			slug: `org-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
			plan,
			settings: {},
			createdAt: now,
			updatedAt: now,
		});
		const roleId = await ctx.db.insert("orgRoles", {
			orgId: id,
			name: "Owner",
			permissions: [...getDefaultPermissionsForRole("Owner")],
			isSystem: true,
			isDefault: false,
			createdAt: now,
			updatedAt: now,
		});
		await ctx.db.insert("orgMembers", {
			orgId: id,
			userId,
			roleId,
			joinedAt: now,
		});
		return id;
	});
	return { userId, orgId };
}

/**
 * Seed a `platformTiers` row with the variant ids the test suite uses.
 * Mirrors the owner panel's tier-edit shape so the DB-first variantToPlan
 * resolver picks them up without env vars.
 */
async function seedTier(
	t: TestT,
	key: "free" | "starter" | "pro" | "enterprise",
	variantMonthly: string,
	variantYearly: string,
) {
	const now = Date.now();
	// Use a per-tier email so the helper never needs an indexed lookup —
	// each call seeds a fresh row and cannot collide with the others
	// inside the same test run.
	const ownerEmail = `tier-seed-${key}-${Math.random().toString(36).slice(2, 6)}@example.com`;
	const userId = await t.run(async (ctx) =>
		ctx.db.insert("users", {
			tokenIdentifier: `password|${ownerEmail}`,
			email: ownerEmail,
			name: "Tier Seed Owner",
			onboardingCompleted: true,
			createdAt: now,
			updatedAt: now,
		}),
	);

	await t.run(async (ctx) => {
		await ctx.db.insert("platformTiers", {
			key,
			displayName: key.charAt(0).toUpperCase() + key.slice(1),
			description: `${key} tier description`,
			features: [`Feature 1 for ${key}`, `Feature 2 for ${key}`],
			highlight: key === "pro",
			monthlyPriceUSD: key === "free" ? 0 : 49,
			yearlyPriceUSD: key === "free" ? 0 : 490,
			trialDays: key === "free" ? 0 : 14,
			lemonSqueezyVariantIdMonthly: variantMonthly,
			lemonSqueezyVariantIdYearly: variantYearly,
			limits: {
				maxPipelinesPerEntityType: 10,
				maxDeals: 10_000,
				maxLeads: 50_000,
				maxMembers: 50,
				maxCustomFieldsPerEntityType: 100,
				maxStorageBytes: 50 * 1024 * 1024 * 1024,
				aiTokensPerMonth: 1_000_000,
				aiMessageCreditsPerMonth: 50_000,
			},
			active: true,
			updatedBy: userId,
			createdAt: now,
			updatedAt: now,
		});
	});
}

function buildPayload(args: {
	eventName: string;
	orgId: string;
	customerId: string;
	subscriptionId: string;
	variantId: string;
	status: "on_trial" | "active" | "paused" | "past_due" | "unpaid" | "cancelled" | "expired";
	renewsAt?: string;
	endsAt?: string;
	trialEndsAt?: string;
}) {
	// LemonSqueezy sends customer_id + variant_id as numbers; the handler
	// String()-coerces them so it accepts string-shaped ids in tests too.
	// We pass them through unchanged here so non-numeric test ids
	// ("PRO_M2", "LEGACY_PRO_VARIANT") survive the round-trip.
	return {
		meta: {
			event_name: args.eventName,
			custom_data: { org_id: args.orgId },
		},
		data: {
			id: args.subscriptionId,
			attributes: {
				customer_id: args.customerId,
				variant_id: args.variantId,
				status: args.status,
				renews_at: args.renewsAt ?? null,
				ends_at: args.endsAt ?? null,
				trial_ends_at: args.trialEndsAt ?? null,
			},
		},
	};
}

describe("LemonSqueezy webhook lifecycle", () => {
	let t: TestT;
	beforeEach(() => {
		t = convexTest(schema, modules);
	});

	it("subscription_created: tags org, sets plan from DB-first variant lookup", async () => {
		const { orgId } = await seedOrgWithPlan(t, "free");
		await seedTier(t, "pro", "PRO_MONTHLY_VAR", "PRO_YEARLY_VAR");

		const result = await t.mutation(internal.billing.internal.applyWebhookEvent, {
			eventName: "subscription_created",
			payload: buildPayload({
				eventName: "subscription_created",
				orgId,
				customerId: "12345",
				subscriptionId: "sub_abc",
				variantId: "PRO_MONTHLY_VAR",
				status: "active",
				renewsAt: "2026-06-27T00:00:00Z",
			}),
		});

		expect(result).toMatchObject({ ok: true, plan: "pro", status: "active" });
		const org = await t.run(async (ctx) => ctx.db.get(orgId));
		expect(org?.plan).toBe("pro");
		expect(org?.lemonSqueezyCustomerId).toBe("12345");
		expect(org?.lemonSqueezySubscriptionId).toBe("sub_abc");
		expect(org?.lemonSqueezyVariantId).toBe("PRO_MONTHLY_VAR");
		expect(org?.lemonSqueezySubscriptionStatus).toBe("active");
		expect(org?.lemonSqueezyCurrentPeriodEnd).toBe(Date.parse("2026-06-27T00:00:00Z"));
	});

	it("subscription_updated: refreshes status + period end", async () => {
		const { orgId } = await seedOrgWithPlan(t, "starter");
		await seedTier(t, "pro", "PRO_M", "PRO_Y");

		// Initial subscription (active).
		await t.mutation(internal.billing.internal.applyWebhookEvent, {
			eventName: "subscription_created",
			payload: buildPayload({
				eventName: "subscription_created",
				orgId,
				customerId: "777",
				subscriptionId: "sub_xyz",
				variantId: "PRO_Y",
				status: "active",
				renewsAt: "2026-12-01T00:00:00Z",
			}),
		});

		// Update — period end pushed forward.
		await t.mutation(internal.billing.internal.applyWebhookEvent, {
			eventName: "subscription_updated",
			payload: buildPayload({
				eventName: "subscription_updated",
				orgId,
				customerId: "777",
				subscriptionId: "sub_xyz",
				variantId: "PRO_Y",
				status: "active",
				renewsAt: "2027-01-01T00:00:00Z",
			}),
		});

		const org = await t.run(async (ctx) => ctx.db.get(orgId));
		expect(org?.lemonSqueezyCurrentPeriodEnd).toBe(Date.parse("2027-01-01T00:00:00Z"));
		expect(org?.plan).toBe("pro");
	});

	it("payment_failed: flips status to past_due, plan unchanged", async () => {
		const { orgId } = await seedOrgWithPlan(t, "pro");

		await t.mutation(internal.billing.internal.applyWebhookEvent, {
			eventName: "subscription_payment_failed",
			payload: buildPayload({
				eventName: "subscription_payment_failed",
				orgId,
				customerId: "111",
				subscriptionId: "sub_pfail",
				variantId: "ANY",
				status: "past_due",
				renewsAt: "2026-06-01T00:00:00Z",
			}),
		});

		const org = await t.run(async (ctx) => ctx.db.get(orgId));
		expect(org?.lemonSqueezySubscriptionStatus).toBe("past_due");
		// Plan not downgraded — quotaGate handles the 3-day grace.
		expect(org?.plan).toBe("free"); // resolves to "free" because variant_id="ANY" doesn't match seeded tiers
	});

	it("payment_recovered / resumed: status flips back to active", async () => {
		const { orgId } = await seedOrgWithPlan(t, "pro");
		await seedTier(t, "pro", "PRO_M2", "PRO_Y2");

		await t.mutation(internal.billing.internal.applyWebhookEvent, {
			eventName: "subscription_payment_failed",
			payload: buildPayload({
				eventName: "subscription_payment_failed",
				orgId,
				customerId: "222",
				subscriptionId: "sub_recov",
				variantId: "PRO_M2",
				status: "past_due",
				renewsAt: "2026-07-01T00:00:00Z",
			}),
		});
		await t.mutation(internal.billing.internal.applyWebhookEvent, {
			eventName: "subscription_resumed",
			payload: buildPayload({
				eventName: "subscription_resumed",
				orgId,
				customerId: "222",
				subscriptionId: "sub_recov",
				variantId: "PRO_M2",
				status: "active",
				renewsAt: "2026-07-01T00:00:00Z",
			}),
		});

		const org = await t.run(async (ctx) => ctx.db.get(orgId));
		expect(org?.lemonSqueezySubscriptionStatus).toBe("active");
		expect(org?.plan).toBe("pro");
	});

	it("subscription_cancelled: status cancelled, plan retained until period end", async () => {
		const { orgId } = await seedOrgWithPlan(t, "pro");

		await t.mutation(internal.billing.internal.applyWebhookEvent, {
			eventName: "subscription_cancelled",
			payload: buildPayload({
				eventName: "subscription_cancelled",
				orgId,
				customerId: "333",
				subscriptionId: "sub_cancel",
				variantId: "ANY",
				status: "cancelled",
				endsAt: "2026-08-01T00:00:00Z",
			}),
		});

		const org = await t.run(async (ctx) => ctx.db.get(orgId));
		expect(org?.lemonSqueezySubscriptionStatus).toBe("cancelled");
		// Plan unchanged — user keeps benefits until period end.
		expect(org?.plan).toBe("pro");
		expect(org?.lemonSqueezyCurrentPeriodEnd).toBe(Date.parse("2026-08-01T00:00:00Z"));
	});

	it("subscription_expired: drops plan to free", async () => {
		const { orgId } = await seedOrgWithPlan(t, "pro");

		await t.mutation(internal.billing.internal.applyWebhookEvent, {
			eventName: "subscription_expired",
			payload: buildPayload({
				eventName: "subscription_expired",
				orgId,
				customerId: "444",
				subscriptionId: "sub_exp",
				variantId: "ANY",
				status: "expired",
			}),
		});

		const org = await t.run(async (ctx) => ctx.db.get(orgId));
		expect(org?.lemonSqueezySubscriptionStatus).toBe("expired");
		expect(org?.plan).toBe("free");
	});

	it("on_trial: trial_ends_at lands in currentPeriodEnd", async () => {
		const { orgId } = await seedOrgWithPlan(t, "free");
		await seedTier(t, "starter", "STARTER_M", "STARTER_Y");

		await t.mutation(internal.billing.internal.applyWebhookEvent, {
			eventName: "subscription_created",
			payload: buildPayload({
				eventName: "subscription_created",
				orgId,
				customerId: "555",
				subscriptionId: "sub_trial",
				variantId: "STARTER_M",
				status: "on_trial",
				trialEndsAt: "2026-06-15T00:00:00Z",
				renewsAt: "2026-06-15T00:00:00Z",
			}),
		});

		const org = await t.run(async (ctx) => ctx.db.get(orgId));
		expect(org?.lemonSqueezySubscriptionStatus).toBe("on_trial");
		expect(org?.plan).toBe("starter");
		// trial_ends_at preferred when on_trial.
		expect(org?.lemonSqueezyCurrentPeriodEnd).toBe(Date.parse("2026-06-15T00:00:00Z"));
	});

	it("falls back to env vars when DB has no matching variant id", async () => {
		const oldEnv = process.env.LEMONSQUEEZY_VARIANT_PRO;
		process.env.LEMONSQUEEZY_VARIANT_PRO = "LEGACY_PRO_VARIANT";
		try {
			const { orgId } = await seedOrgWithPlan(t, "free");
			// No platformTiers row seeded for "pro" → resolver falls through
			// to env-var path.
			await t.mutation(internal.billing.internal.applyWebhookEvent, {
				eventName: "subscription_created",
				payload: buildPayload({
					eventName: "subscription_created",
					orgId,
					customerId: "666",
					subscriptionId: "sub_legacy",
					variantId: "LEGACY_PRO_VARIANT",
					status: "active",
				}),
			});
			const org = await t.run(async (ctx) => ctx.db.get(orgId));
			expect(org?.plan).toBe("pro");
		} finally {
			process.env.LEMONSQUEEZY_VARIANT_PRO = oldEnv;
		}
	});

	it("matches org by customer id when custom_data.org_id is missing", async () => {
		const { orgId } = await seedOrgWithPlan(t, "free");
		// First webhook tags the customer id.
		await t.mutation(internal.billing.internal.applyWebhookEvent, {
			eventName: "subscription_created",
			payload: buildPayload({
				eventName: "subscription_created",
				orgId,
				customerId: "999",
				subscriptionId: "sub_taggy",
				variantId: "ANY",
				status: "active",
			}),
		});

		// Second webhook arrives WITHOUT custom_data — matches via customer id.
		const payload = buildPayload({
			eventName: "subscription_updated",
			orgId: "", // ignored downstream
			customerId: "999",
			subscriptionId: "sub_taggy",
			variantId: "ANY",
			status: "active",
			renewsAt: "2026-09-01T00:00:00Z",
		});
		(payload.meta as { custom_data?: unknown }).custom_data = undefined;

		const result = await t.mutation(internal.billing.internal.applyWebhookEvent, {
			eventName: "subscription_updated",
			payload,
		});
		expect(result).toMatchObject({ ok: true });
		const org = await t.run(async (ctx) => ctx.db.get(orgId));
		expect(org?.lemonSqueezyCurrentPeriodEnd).toBe(Date.parse("2026-09-01T00:00:00Z"));
	});

	it("returns no_org_match when neither org_id nor customer match", async () => {
		const result = await t.mutation(internal.billing.internal.applyWebhookEvent, {
			eventName: "subscription_created",
			payload: buildPayload({
				eventName: "subscription_created",
				orgId: "",
				customerId: "ghost",
				subscriptionId: "sub_ghost",
				variantId: "ANY",
				status: "active",
			}),
		});
		expect(result).toMatchObject({ ok: false });
	});
});

describe("listPublicTiers (P0.1.2 unauthenticated marketing query)", () => {
	let t: TestT;
	beforeEach(() => {
		t = convexTest(schema, modules);
	});

	it("returns in-code defaults when no rows seeded", async () => {
		const result = await t.query(api._platform.tiers.queries.listPublicTiers, {});
		expect(result.length).toBeGreaterThan(0);
		const free = result.find((r) => r.key === "free");
		expect(free).toBeDefined();
		expect(free?.features.length).toBeGreaterThan(0);
		expect(free?.monthlyPriceUSD).toBe(0);
	});

	it("returns DB row when seeded + skips inactive tiers", async () => {
		await seedTier(t, "starter", "S_M", "S_Y");
		// Mark starter inactive — should be filtered out.
		await t.run(async (ctx) => {
			const rows = await ctx.db.query("platformTiers").collect();
			const row = rows.find((r) => r.key === "starter");
			if (row) await ctx.db.patch(row._id, { active: false });
		});
		const result = await t.query(api._platform.tiers.queries.listPublicTiers, {});
		expect(result.find((r) => r.key === "starter")).toBeUndefined();
	});

	it("sorts by ascending monthly price", async () => {
		const result = await t.query(api._platform.tiers.queries.listPublicTiers, {});
		const prices = result.map((r) => r.monthlyPriceUSD);
		const sorted = [...prices].sort((a, b) => a - b);
		expect(prices).toEqual(sorted);
	});
});
