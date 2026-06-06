"use node";
/**
 * Twilio outbound action — S14 (Mode A/B outbound).
 *
 * Single internalAction: POSTs `Messages.json` to the Twilio REST API.
 * Two paths:
 *   - Session message → `Body` field (free-form text, only valid within
 *     the 24h customer-service window — capability gates that).
 *   - Template message → `ContentSid` + `ContentVariables` (Twilio
 *     Content API, required out-of-window). When a template doesn't
 *     yet have a `contentSid` (pre-approval), fall through to a Body
 *     send — useful in dev/mock mode but rejected in real Twilio
 *     out-of-window. The capability surfaces this gap.
 *
 * `TWILIO_MOCK_MODE === "1"` short-circuits the network call and
 * returns a deterministic fake `sid`. Used by the test harness AND
 * by anyone running `pnpm dev` without Twilio creds set.
 *
 * Errors are mapped into a closed `{ ok, sid?, errorCode?, errorMessage? }`
 * envelope so the capability can render a clean repair envelope; we
 * never throw out of this action (telemetry contract — callers expect
 * deterministic shape).
 */

import { v } from "convex/values";
import { internalAction } from "../../_generated/server";

// ─── Types ─────────────────────────────────────────────────────────────────

export type TwilioSendOk = { ok: true; sid: string; mock: boolean };
export type TwilioSendErr = { ok: false; errorCode?: string; errorMessage: string };
export type TwilioSendResult = TwilioSendOk | TwilioSendErr;

// ─── Pure helpers (unit-testable) ──────────────────────────────────────────

/**
 * Build the form-encoded body Twilio expects. Pure — no fetch,
 * no env reads. Sorted keys keep test fixtures deterministic.
 */
export function buildTwilioRequestBody(args: {
	from: string;
	to: string;
	body?: string;
	contentSid?: string;
	contentVariables?: Record<string, string>;
}): URLSearchParams {
	const params = new URLSearchParams();
	params.set("From", args.from);
	params.set("To", args.to);
	if (args.contentSid) {
		params.set("ContentSid", args.contentSid);
		if (args.contentVariables && Object.keys(args.contentVariables).length > 0) {
			params.set("ContentVariables", JSON.stringify(args.contentVariables));
		}
	} else if (typeof args.body === "string") {
		params.set("Body", args.body);
	}
	return params;
}

/** Add the `whatsapp:` URI scheme Twilio uses on the From/To fields. */
export function withWhatsappScheme(phoneE164: string): string {
	if (phoneE164.startsWith("whatsapp:")) return phoneE164;
	return `whatsapp:${phoneE164}`;
}

/** Build the Authorization header for Basic auth. Exported for tests. */
export function buildBasicAuthHeader(accountSid: string, authToken: string): string {
	const encoded =
		typeof Buffer !== "undefined"
			? Buffer.from(`${accountSid}:${authToken}`).toString("base64")
			: btoa(`${accountSid}:${authToken}`);
	return `Basic ${encoded}`;
}

/**
 * Generate a deterministic-looking mock SID. Mock mode only — never
 * used when real Twilio creds are set. Keeps test snapshots stable.
 * Twilio message SIDs are 34 characters: `SM` prefix + 32 hex chars.
 */
export function buildMockSid(messageSeed: string): string {
	let hash = 0;
	for (let i = 0; i < messageSeed.length; i += 1) {
		hash = (hash * 31 + messageSeed.charCodeAt(i)) | 0;
	}
	const hex = Math.abs(hash).toString(16).padStart(8, "0").slice(0, 8);
	// `SMmock` (6) + hex (8) + 20 zero pad = 34.
	return `SMmock${hex}${"0".repeat(20)}`;
}

// ─── Internal action ───────────────────────────────────────────────────────

/**
 * Send one outbound message via Twilio. The capability calls this
 * directly via `ctx.runAction` — we don't schedule it — because the
 * caller needs the sid (to write into `messages.idempotencyKey`).
 */
export const sendWhatsappViaTwilioAction = internalAction({
	args: {
		fromPhone: v.string(),
		toPhone: v.string(),
		body: v.optional(v.string()),
		contentSid: v.optional(v.string()),
		contentVariables: v.optional(v.record(v.string(), v.string())),
		// Used to build a deterministic mock sid AND as a Twilio-side
		// idempotency hint when the caller cares (we don't yet — Twilio's
		// own retry semantics on Messages.json are at-most-once).
		idempotencySeed: v.optional(v.string()),
	},
	handler: async (_ctx, args): Promise<TwilioSendResult> => {
		const accountSid = process.env.TWILIO_ACCOUNT_SID;
		const authToken = process.env.TWILIO_AUTH_TOKEN;
		const mockMode = process.env.TWILIO_MOCK_MODE === "1";

		if (mockMode) {
			const seed = args.idempotencySeed ?? `${args.fromPhone}->${args.toPhone}:${Date.now()}`;
			return { ok: true, sid: buildMockSid(seed), mock: true };
		}

		if (!accountSid || !authToken) {
			return {
				ok: false,
				errorCode: "TWILIO_NOT_CONFIGURED",
				errorMessage:
					"Twilio outbound is not configured — set TWILIO_ACCOUNT_SID + TWILIO_AUTH_TOKEN, or enable TWILIO_MOCK_MODE for development.",
			};
		}

		const params = buildTwilioRequestBody({
			from: withWhatsappScheme(args.fromPhone),
			to: withWhatsappScheme(args.toPhone),
			body: args.body,
			contentSid: args.contentSid,
			contentVariables: args.contentVariables,
		});

		const url = `https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(
			accountSid,
		)}/Messages.json`;

		try {
			const res = await fetch(url, {
				method: "POST",
				headers: {
					"content-type": "application/x-www-form-urlencoded",
					authorization: buildBasicAuthHeader(accountSid, authToken),
				},
				body: params.toString(),
			});

			const json = (await res.json().catch(() => ({}))) as {
				sid?: string;
				code?: number | string;
				message?: string;
				more_info?: string;
			};

			if (!res.ok) {
				return {
					ok: false,
					errorCode: json.code !== undefined ? String(json.code) : `HTTP_${res.status}`,
					errorMessage:
						json.message ??
						`Twilio API returned HTTP ${res.status}.` +
							(json.more_info ? ` See ${json.more_info}.` : ""),
				};
			}

			if (!json.sid) {
				return {
					ok: false,
					errorCode: "TWILIO_NO_SID",
					errorMessage: "Twilio response missing message SID.",
				};
			}

			return { ok: true, sid: json.sid, mock: false };
		} catch (err) {
			const message = err instanceof Error ? err.message : String(err);
			return {
				ok: false,
				errorCode: "NETWORK",
				errorMessage: `Twilio request failed: ${message}`,
			};
		}
	},
});
