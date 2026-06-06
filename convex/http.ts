/**
 * Convex HTTP routes.
 *
 * Hosts auth callbacks, the LemonSqueezy billing webhook, the Twilio
 * WhatsApp inbound webhook (S13), and the MCP + REST projector endpoints
 * (S16). LemonSqueezy webhook URL:
 * `https://<deployment>.convex.site/billing/lemonsqueezy/webhook`.
 * Twilio Messaging webhook URL (per agent number, in the Twilio console):
 * `https://<deployment>.convex.site/whatsapp/twilio`.
 * MCP endpoint (JSON-RPC 2.0):
 * `https://<deployment>.convex.site/ai/mcp`.
 * REST endpoint (capability name in last path segment):
 * `https://<deployment>.convex.site/ai/rest/<capability>`.
 */

import { httpRouter } from "convex/server";
import { internal } from "./_generated/api";
import { httpAction } from "./_generated/server";
import { parseAuthorizationHeader, verifyAndTouch } from "./ai/aiApiTokens";
import {
	parseTwilioFormBody,
	verifyTwilioSignatureSha1,
	type WhatsappInboundOutcome,
} from "./ai/channels/whatsappInbound";
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
		if (expected.charCodeAt(i) !== signatureHex.charCodeAt(i % signatureHex.length || 1)) {
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

/**
 * Twilio WhatsApp inbound webhook (S13).
 *
 * Configure the webhook URL on each Twilio number in the Messaging tab.
 * Twilio POSTs an `application/x-www-form-urlencoded` body and signs it
 * with the account auth token. We:
 *   1. Read the raw body (signature is computed over sorted form params).
 *   2. Verify `X-Twilio-Signature` via `verifyTwilioSignatureSha1`. The
 *      signature input MUST be the EXACT URL Twilio called — query string
 *      and all — so we reconstruct it from the request URL.
 *   3. Dispatch to `handleTwilioInboundInternal` which resolves the
 *      receiving number → agent + routes by `mode`.
 *
 * Response policy:
 *   - 401 — missing/bad signature OR an unmapped/disabled number. Twilio
 *           will retry; an unmapped number SHOULD trigger that retry-then-
 *           debug loop because the operator probably forgot to seed an
 *           `agentChannels` row.
 *   - 400 — payload missing required fields (From / To / MessageSid).
 *   - 200 — verified payload, persisted (or stubbed for `mode:"profile"`).
 *           We MUST NOT 5xx after a successful verify+route — Twilio would
 *           re-deliver and the autonomous turn would re-fire.
 */
const twilioWhatsappInboundWebhook = httpAction(async (ctx, request) => {
	const authToken = process.env.TWILIO_AUTH_TOKEN;
	if (!authToken) {
		return new Response("TWILIO_AUTH_TOKEN not configured", { status: 500 });
	}

	const signature = request.headers.get("x-twilio-signature");
	if (!signature) {
		return new Response(JSON.stringify({ error: "missing_signature" }), {
			status: 401,
			headers: { "content-type": "application/json" },
		});
	}

	const rawBody = await request.text();
	const params = parseTwilioFormBody(rawBody);

	const ok = await verifyTwilioSignatureSha1({
		authToken,
		url: request.url,
		params,
		signature,
	});
	if (!ok) {
		return new Response(JSON.stringify({ error: "bad_signature" }), {
			status: 401,
			headers: { "content-type": "application/json" },
		});
	}

	const from = params.From ?? "";
	const to = params.To ?? "";
	const body = params.Body ?? "";
	const messageSid = params.MessageSid ?? params.SmsMessageSid ?? "";
	if (!from || !to) {
		return new Response(JSON.stringify({ error: "missing_to_or_from" }), {
			status: 400,
			headers: { "content-type": "application/json" },
		});
	}
	if (!messageSid) {
		return new Response(JSON.stringify({ error: "missing_messagesid" }), {
			status: 400,
			headers: { "content-type": "application/json" },
		});
	}

	const outcome: WhatsappInboundOutcome = await ctx.runAction(
		internal.ai.channels.whatsappInbound.handleTwilioInboundInternal,
		{ from, to, body, messageSid },
	);

	if (outcome.kind === "unauthorized") {
		return new Response(JSON.stringify({ error: outcome.reason }), {
			status: 401,
			headers: { "content-type": "application/json" },
		});
	}
	return new Response(JSON.stringify(outcome), {
		status: 200,
		headers: { "content-type": "application/json" },
	});
});

http.route({
	path: "/whatsapp/twilio",
	method: "POST",
	handler: twilioWhatsappInboundWebhook,
});

// ─── S16 — MCP + REST projectors ───────────────────────────────────────────

/**
 * Build a small JSON `Response`. Co-located here so the two projector
 * routes don't drift in their error envelope shape.
 */
function jsonResponse(body: unknown, status: number): Response {
	return new Response(JSON.stringify(body), {
		status,
		headers: { "content-type": "application/json" },
	});
}

/**
 * MCP projector endpoint — JSON-RPC 2.0 over HTTP (request/reply).
 *
 * Auth: `Authorization: Bearer <token>` issued via `aiApiTokens.issueToken`.
 * The token's RBAC = the issuing member's RBAC (resolved fresh on every
 * request so a role change propagates instantly). Token scopes filter the
 * advertised tool set + reject `tools/call` for out-of-scope capabilities.
 *
 * Response policy:
 *   - 401 — missing / unparsable / unknown / revoked / expired token.
 *   - 400 — body is not valid JSON.
 *   - 200 — JSON-RPC frame (success OR JSON-RPC error inside the body).
 *           NEVER returns a 5xx for a tool-level failure: those land as
 *           a `denied` / `needs_step_up` / etc. envelope inside the frame.
 *
 * MCP protocol notes:
 *   - The wire format is ONE JSON-RPC 2.0 request per POST. Batch
 *     requests are NOT supported (the spec allows it but we keep the
 *     surface small until a real MCP client asks for it).
 *   - Streaming (SSE / Streamable HTTP) is deferred until an MCP client
 *     in the wild needs it — see Future-Enhancements §B.42.
 */
const mcpProjectorEndpoint = httpAction(async (ctx, request) => {
	if (request.method !== "POST") {
		return jsonResponse({ error: "method_not_allowed" }, 405);
	}
	const plaintext = parseAuthorizationHeader(request.headers.get("authorization"));
	if (!plaintext) {
		return jsonResponse({ error: "missing_authorization" }, 401);
	}

	let body: unknown;
	try {
		body = await request.json();
	} catch {
		return jsonResponse({ error: "invalid_json_body" }, 400);
	}

	const verified = await verifyAndTouch(ctx, plaintext, "mcp");
	if (!verified) {
		return jsonResponse({ error: "invalid_token" }, 401);
	}

	const response = await ctx.runAction(
		internal.ai.registry.projectors.dispatch.dispatchMcpRequest,
		{
			body,
			principal: {
				orgId: verified.principal.orgId,
				userId: verified.principal.userId,
				permissions: verified.principal.permissions,
			},
			scopes: verified.scopes,
			channel: "mcp",
		},
	);
	return jsonResponse(response, 200);
});

http.route({ path: "/ai/mcp", method: "POST", handler: mcpProjectorEndpoint });

/**
 * REST projector endpoint — `POST /ai/rest/<capability>`.
 *
 * Auth: same Bearer-token model as MCP. Body: JSON object of args. Response:
 * the `CapabilityResult` envelope verbatim.
 *
 * Convex's `httpRouter` is non-parameterised — there's no `:capability`
 * placeholder. So we register `pathPrefix: "/ai/rest/"` (Convex feature)
 * which routes ANY URL under that prefix to this handler, and we extract
 * the capability name from the request URL pathname inside the projector.
 *
 * Response codes (mirrors `rest.ts:handleRestRequest`):
 *   - 200 — capability ran (envelope in body, including `denied` /
 *           `needs_step_up` / etc. statuses).
 *   - 400 — body is not a JSON object / path is missing the cap name.
 *   - 401 — missing / invalid / revoked / expired token.
 *   - 403 — token scopes refuse the capability.
 *   - 404 — capability name not registered.
 *   - 405 — non-POST method.
 */
const restProjectorEndpoint = httpAction(async (ctx, request) => {
	if (request.method !== "POST") {
		return jsonResponse({ error: "method_not_allowed" }, 405);
	}
	const plaintext = parseAuthorizationHeader(request.headers.get("authorization"));
	if (!plaintext) {
		return jsonResponse({ error: "missing_authorization" }, 401);
	}

	const url = new URL(request.url);
	let body: unknown = null;
	const ctype = request.headers.get("content-type") ?? "";
	if (ctype.toLowerCase().includes("application/json")) {
		try {
			body = await request.json();
		} catch {
			return jsonResponse({ error: "invalid_json_body" }, 400);
		}
	}

	const verified = await verifyAndTouch(ctx, plaintext, "rest");
	if (!verified) {
		return jsonResponse({ error: "invalid_token" }, 401);
	}

	const result = await ctx.runAction(
		internal.ai.registry.projectors.dispatch.dispatchRestRequest,
		{
			path: url.pathname,
			body,
			principal: {
				orgId: verified.principal.orgId,
				userId: verified.principal.userId,
				permissions: verified.principal.permissions,
			},
			scopes: verified.scopes,
			channel: "rest",
		},
	);
	return jsonResponse(result.json, result.httpStatus);
});

http.route({
	pathPrefix: "/ai/rest/",
	method: "POST",
	handler: restProjectorEndpoint,
});

export default http;
