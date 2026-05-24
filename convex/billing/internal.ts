/**
 * Billing internal mutations — Phase 3A.
 *
 * Single entry point for LemonSqueezy webhook events. The HTTP route
 * in `convex/http.ts` verifies the HMAC signature, parses the JSON,
 * and calls this mutation with `{ eventName, payload }`. We then
 * dispatch to per-event handlers and patch the org doc.
 *
 * Maps LemonSqueezy → our schema:
 *   - subscription_created  → set lemonSqueezy* fields, plan=`starter`/`pro`
 *   - subscription_updated  → patch status / period end / variant
 *   - subscription_cancelled → status=cancelled, plan stays until period end
 *   - subscription_expired  → plan=free
 *   - subscription_resumed   → status=active
 *   - subscription_paused    → status=paused
 *
 * Variant → plan mapping is read off Convex env vars so swapping plans
 * doesn't require a code deploy:
 *   LEMONSQUEEZY_VARIANT_STARTER, _PRO, _ENTERPRISE
 */

import { v } from "convex/values";
import { internalMutation } from "../_generated/server";
import type { PlanTier } from "../_platform/limits";

interface LSAttributes {
	customer_id?: number;
	variant_id?: number;
	status?: string;
	renews_at?: string | null;
	ends_at?: string | null;
}

interface LSDataObject {
	id?: string;
	attributes?: LSAttributes;
}

interface LSWebhookMeta {
	event_name?: string;
	custom_data?: { org_id?: string };
}

interface LSWebhookPayload {
	meta?: LSWebhookMeta;
	data?: LSDataObject;
}

function variantToPlan(variantId: number | undefined): PlanTier {
	if (variantId === undefined) return "free";
	const idStr = String(variantId);
	if (idStr === process.env.LEMONSQUEEZY_VARIANT_ENTERPRISE) return "enterprise";
	if (idStr === process.env.LEMONSQUEEZY_VARIANT_PRO) return "pro";
	if (idStr === process.env.LEMONSQUEEZY_VARIANT_STARTER) return "starter";
	return "free";
}

const LS_STATUS = v.union(
	v.literal("on_trial"),
	v.literal("active"),
	v.literal("paused"),
	v.literal("past_due"),
	v.literal("unpaid"),
	v.literal("cancelled"),
	v.literal("expired"),
);

function normaliseStatus(
	s: string | undefined,
): "on_trial" | "active" | "paused" | "past_due" | "unpaid" | "cancelled" | "expired" {
	if (
		s === "on_trial" ||
		s === "active" ||
		s === "paused" ||
		s === "past_due" ||
		s === "unpaid" ||
		s === "cancelled" ||
		s === "expired"
	)
		return s;
	return "active";
}

/**
 * Apply a LemonSqueezy webhook event to the workspace it references.
 *
 * Lookup order:
 *   1. `meta.custom_data.org_id` (set in checkout URL we mint server-side).
 *   2. `data.attributes.customer_id` matched against
 *      `orgs.by_lemonSqueezyCustomerId` index — used after the first
 *      checkout has tagged the org.
 */
export const applyWebhookEvent = internalMutation({
	args: {
		eventName: v.string(),
		payload: v.any(),
	},
	handler: async (ctx, args) => {
		const payload = args.payload as LSWebhookPayload;
		const customDataOrgId = payload.meta?.custom_data?.org_id;
		const data = payload.data;
		const attrs = data?.attributes ?? {};
		const customerId = attrs.customer_id !== undefined ? String(attrs.customer_id) : undefined;
		const subscriptionId = data?.id;
		const variantId = attrs.variant_id !== undefined ? String(attrs.variant_id) : undefined;
		const status = normaliseStatus(attrs.status);
		const renewsAt = attrs.renews_at ? Date.parse(attrs.renews_at) : undefined;
		const endsAt = attrs.ends_at ? Date.parse(attrs.ends_at) : undefined;

		// Locate the org.
		let orgId: string | undefined = customDataOrgId;
		if (!orgId && customerId) {
			const byCustomer = await ctx.db
				.query("orgs")
				.withIndex("by_lemonSqueezyCustomerId", (q) =>
					q.eq("lemonSqueezyCustomerId", customerId),
				)
				.first();
			if (byCustomer) orgId = byCustomer._id;
		}
		if (!orgId) {
			// Without an org we can't apply — log and exit. Webhook still
			// returns 200 so LS doesn't retry indefinitely.
			console.warn(`[billing] Webhook ${args.eventName} could not be matched to an org.`);
			return { ok: false, reason: "no_org_match" };
		}

		const org = await ctx.db.get(orgId as never);
		if (!org) return { ok: false, reason: "org_not_found" };

		const plan: PlanTier = (() => {
			if (args.eventName === "subscription_expired") return "free";
			if (args.eventName === "subscription_cancelled") {
				// Plan remains until period ends; we keep the existing plan.
				return ((org as { plan?: string }).plan as PlanTier) ?? "free";
			}
			if (variantId !== undefined) return variantToPlan(Number(variantId));
			return ((org as { plan?: string }).plan as PlanTier) ?? "free";
		})();

		await ctx.db.patch(orgId as never, {
			plan,
			lemonSqueezyCustomerId: customerId,
			lemonSqueezySubscriptionId: subscriptionId,
			lemonSqueezyVariantId: variantId,
			lemonSqueezySubscriptionStatus: status,
			lemonSqueezyCurrentPeriodEnd: renewsAt ?? endsAt,
			updatedAt: Date.now(),
		});

		return { ok: true, eventName: args.eventName, orgId, plan, status };
	},
});

// Re-exported so callers know the union type of statuses we use.
export const LEMONSQUEEZY_STATUS_VALIDATOR = LS_STATUS;
