/**
 * Convex HTTP routes.
 *
 * Hosts auth callbacks and the LemonSqueezy billing webhook. Run with
 * `https://<deployment>.convex.site/billing/lemonsqueezy/webhook` as the
 * webhook URL in your LemonSqueezy store settings.
 */

import { httpRouter } from "convex/server";
import { httpAction } from "./_generated/server";
import { internal } from "./_generated/api";
import { auth } from "./auth";

const http = httpRouter();

auth.addHttpRoutes(http);

/**
 * LemonSqueezy webhook handler.
 *
 * Steps:
 *   1. Read the raw request body — required for HMAC verification.
 *   2. Verify the `X-Signature` header against the secret.
 *   3. Parse JSON; extract `event_name` from the `meta` envelope.
 *   4. Dispatch to `internal.billing.internal.applyWebhookEvent`.
 *
 * Always returns 200 after a verified payload — even when we can't
 * resolve the event to an org — so LemonSqueezy doesn't enter a retry
 * loop. Verification failures return 401.
 */
const lemonSqueezyWebhook = httpAction(async (ctx, request) => {
	const secret = process.env.LEMONSQUEEZY_WEBHOOK_SECRET;
	if (!secret) {
		return new Response("Webhook secret not configured", { status: 500 });
	}

	const rawBody = await request.text();
	const signatureHex = request.headers.get("x-signature");
	if (!signatureHex) {
		return new Response("Missing X-Signature header", { status: 401 });
	}

	// HMAC SHA-256 verification using the Web Crypto API (Convex runtime).
	const encoder = new TextEncoder();
	const key = await crypto.subtle.importKey(
		"raw",
		encoder.encode(secret),
		{ name: "HMAC", hash: "SHA-256" },
		false,
		["sign"],
	);
	const sigBuffer = await crypto.subtle.sign("HMAC", key, encoder.encode(rawBody));
	const expected = Array.from(new Uint8Array(sigBuffer))
		.map((b) => b.toString(16).padStart(2, "0"))
		.join("");

	// Constant-time compare. Length first; if mismatch fall through to a
	// false comparison so timing leaks nothing useful.
	let mismatch = expected.length !== signatureHex.length;
	const len = Math.max(expected.length, signatureHex.length);
	for (let i = 0; i < len; i += 1) {
		if (
			expected.charCodeAt(i) !==
			signatureHex.charCodeAt(i % signatureHex.length || 1)
		) {
			mismatch = true;
		}
	}
	if (mismatch) {
		return new Response("Invalid signature", { status: 401 });
	}

	let payload: { meta?: { event_name?: string } };
	try {
		payload = JSON.parse(rawBody);
	} catch {
		return new Response("Invalid JSON", { status: 400 });
	}

	const eventName = payload.meta?.event_name;
	if (!eventName) {
		return new Response("Missing event_name", { status: 400 });
	}

	await ctx.runMutation(internal.billing.internal.applyWebhookEvent, {
		eventName,
		payload,
	});

	return new Response("ok", { status: 200 });
});

http.route({
	path: "/billing/lemonsqueezy/webhook",
	method: "POST",
	handler: lemonSqueezyWebhook,
});

export default http;
