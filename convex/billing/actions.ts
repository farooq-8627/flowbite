/**
 * Billing actions — Phase 3A.
 *
 * `createCheckoutUrl` mints a LemonSqueezy hosted checkout URL for the
 * caller's org. Uses the LS REST API:
 *   POST https://api.lemonsqueezy.com/v1/checkouts
 *
 * The response includes a one-time URL we redirect the user to. We
 * pass `custom_data: { org_id }` so the webhook can match the
 * subsequent `subscription_created` event to the right org.
 *
 * Auth: caller must have `org.viewBilling` (typically Owner).
 */

import { ConvexError, v } from "convex/values";
import { api } from "../_generated/api";
import { action } from "../_generated/server";

const LS_API = "https://api.lemonsqueezy.com/v1";

interface LSCheckoutResponse {
	data?: {
		attributes?: {
			url?: string;
		};
	};
	errors?: Array<{ detail?: string }>;
}

export const createCheckoutUrl = action({
	args: {
		orgId: v.id("orgs"),
		variantId: v.string(),
	},
	handler: async (ctx, args): Promise<{ url: string }> => {
		const apiKey = process.env.LEMONSQUEEZY_API_KEY;
		const storeId = process.env.LEMONSQUEEZY_STORE_ID;
		if (!apiKey || !storeId) {
			throw new ConvexError({
				code: "BILLING_NOT_CONFIGURED",
				message: "Billing is not configured for this deployment.",
			});
		}

		// Auth — actions don't have ctx.userId, but the org-membership
		// query does its own auth check. We rely on it.
		const membership = await ctx.runQuery(api.orgs.queries.getMyMembership, {
			orgId: args.orgId,
		});
		if (!membership) {
			throw new ConvexError({
				code: "ORG_MEMBER_NOT_FOUND",
				message: "You are not a member of this workspace.",
			});
		}
		if (!membership.permissions.includes("org.viewBilling")) {
			throw new ConvexError({
				code: "PERMISSION_DENIED",
				message: "You don't have permission to start checkout.",
			});
		}

		const body = {
			data: {
				type: "checkouts",
				attributes: {
					checkout_data: {
						custom: {
							org_id: args.orgId,
						},
					},
					product_options: {
						redirect_url: `${process.env.NEXT_PUBLIC_APP_URL ?? ""}/billing/success`,
					},
				},
				relationships: {
					store: { data: { type: "stores", id: storeId } },
					variant: { data: { type: "variants", id: args.variantId } },
				},
			},
		};

		const res = await fetch(`${LS_API}/checkouts`, {
			method: "POST",
			headers: {
				Accept: "application/vnd.api+json",
				"Content-Type": "application/vnd.api+json",
				Authorization: `Bearer ${apiKey}`,
			},
			body: JSON.stringify(body),
		});

		if (!res.ok) {
			const errText = await res.text();
			throw new ConvexError({
				code: "BILLING_CHECKOUT_FAILED",
				message: `LemonSqueezy checkout failed (${res.status}): ${errText.slice(0, 200)}`,
			});
		}

		const json = (await res.json()) as LSCheckoutResponse;
		const url = json.data?.attributes?.url;
		if (!url) {
			throw new ConvexError({
				code: "BILLING_CHECKOUT_FAILED",
				message: "LemonSqueezy returned no checkout URL.",
			});
		}
		return { url };
	},
});
