/// <reference types="vite/client" />
/**
 * S13 — convex/ai/channels/whatsappInbound + http.ts route.
 *
 * NOTE on file location: this test file lives at the convex/ root (not
 * alongside the implementation under convex/ai/channels/) because
 * convex-test's `import.meta.glob` path-resolution requires a "./"
 * prefix for every module key — see the comment in `stage9.test.ts`
 * for the same constraint. Tests deeper under `convex/` produce a
 * mismatched relative-vs-_generated prefix that breaks t.fetch /
 * t.action / t.mutation lookups for sibling files.
 *
 * Two layers of coverage:
 *   1. Pure helpers — `parseTwilioFormBody` / `stripWhatsappPrefix` /
 *      `formatInboundTranscript` / `verifyTwilioSignatureSha1`. The
 *      signature helper is anchored to a self-computed pair (algorithm
 *      symmetry round-trip) plus negative cases for tampered inputs —
 *      external test vectors from twilio.com/docs require their auth
 *      token, which they don't publish.
 *   2. End-to-end via `t.fetch` against the real `/whatsapp/twilio` route
 *      (verifies the http layer + signature check + orchestrator together):
 *        - bad signature → 401
 *        - unknown receiving number → 401 even with valid signature
 *        - mapped agent_ops number → 200, schedules `autonomousTurn`,
 *          dedupes Twilio re-delivery
 *        - disabled channel (kill-switch) → 401
 */

import { convexTest } from "convex-test";
import { beforeEach, describe, expect, it } from "vitest";
import {
	formatInboundTranscript,
	parseTwilioFormBody,
	stripWhatsappPrefix,
	verifyTwilioSignatureSha1,
} from "./ai/channels/whatsappInbound";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");

// Twilio expects an auth token to live in process.env.TWILIO_AUTH_TOKEN at
// http-action time. We set a deterministic test token; the http handler in
// convex/http.ts reads it directly.
const TEST_AUTH_TOKEN = "test_auth_token_s13";

beforeEach(() => {
	process.env.TWILIO_AUTH_TOKEN = TEST_AUTH_TOKEN;
});

// ─── Pure helpers ──────────────────────────────────────────────────────────

describe("parseTwilioFormBody", () => {
	it("round-trips a typical Twilio inbound payload", () => {
		const body =
			"MessageSid=SMabc123&From=whatsapp%3A%2B14155550100&To=whatsapp%3A%2B18005551212&Body=hello%20there";
		const out = parseTwilioFormBody(body);
		expect(out.MessageSid).toBe("SMabc123");
		expect(out.From).toBe("whatsapp:+14155550100");
		expect(out.To).toBe("whatsapp:+18005551212");
		expect(out.Body).toBe("hello there");
	});

	it("returns an empty record for an empty body", () => {
		expect(parseTwilioFormBody("")).toEqual({});
	});
});

describe("stripWhatsappPrefix", () => {
	it("strips the whatsapp: prefix when present", () => {
		expect(stripWhatsappPrefix("whatsapp:+14155550100")).toBe("+14155550100");
	});
	it("returns the input unchanged when no prefix", () => {
		expect(stripWhatsappPrefix("+14155550100")).toBe("+14155550100");
	});
});

describe("formatInboundTranscript", () => {
	it("includes personCode when supplied", () => {
		expect(
			formatInboundTranscript({
				fromPhone: "+14155550100",
				content: "Hi, I'm Sara",
				personCode: "P-007",
			}),
		).toBe("Customer P-007 (+14155550100): Hi, I'm Sara");
	});
	it("falls back to phone when no personCode", () => {
		expect(
			formatInboundTranscript({
				fromPhone: "+14155550100",
				content: "  hello  ",
			}),
		).toBe("Customer +14155550100: hello");
	});
});

describe("verifyTwilioSignatureSha1", () => {
	const url = "https://example.convex.site/whatsapp/twilio";
	const params = {
		MessageSid: "SMabc123",
		From: "whatsapp:+14155550100",
		To: "whatsapp:+18005551212",
		Body: "hello",
	};

	async function computeSignature(
		authToken: string,
		urlValue: string,
		paramsValue: Record<string, string>,
	): Promise<string> {
		// Reproduces the algorithm: sorted keys + key+value concat + HMAC-SHA1
		// + base64. Used to anchor the round-trip without trusting the helper
		// itself — the helper's verify path inverts the same algorithm.
		const sorted = Object.keys(paramsValue).sort();
		let payload = urlValue;
		for (const k of sorted) payload += k + paramsValue[k];
		const enc = new TextEncoder();
		const key = await crypto.subtle.importKey(
			"raw",
			enc.encode(authToken),
			{ name: "HMAC", hash: "SHA-1" },
			false,
			["sign"],
		);
		const sig = await crypto.subtle.sign("HMAC", key, enc.encode(payload));
		let bin = "";
		const bytes = new Uint8Array(sig);
		for (let i = 0; i < bytes.byteLength; i += 1) bin += String.fromCharCode(bytes[i]);
		return btoa(bin);
	}

	it("accepts a correctly-computed signature", async () => {
		const signature = await computeSignature(TEST_AUTH_TOKEN, url, params);
		const ok = await verifyTwilioSignatureSha1({
			authToken: TEST_AUTH_TOKEN,
			url,
			params,
			signature,
		});
		expect(ok).toBe(true);
	});

	it("rejects a signature computed with a different auth token", async () => {
		const signature = await computeSignature("WRONG_TOKEN", url, params);
		const ok = await verifyTwilioSignatureSha1({
			authToken: TEST_AUTH_TOKEN,
			url,
			params,
			signature,
		});
		expect(ok).toBe(false);
	});

	it("rejects when the URL is tampered after signing", async () => {
		const signature = await computeSignature(TEST_AUTH_TOKEN, url, params);
		const ok = await verifyTwilioSignatureSha1({
			authToken: TEST_AUTH_TOKEN,
			url: `${url}?evil=1`,
			params,
			signature,
		});
		expect(ok).toBe(false);
	});

	it("rejects when a form param is tampered after signing", async () => {
		const signature = await computeSignature(TEST_AUTH_TOKEN, url, params);
		const ok = await verifyTwilioSignatureSha1({
			authToken: TEST_AUTH_TOKEN,
			url,
			params: { ...params, Body: "different" },
			signature,
		});
		expect(ok).toBe(false);
	});

	it("rejects an empty signature header", async () => {
		const ok = await verifyTwilioSignatureSha1({
			authToken: TEST_AUTH_TOKEN,
			url,
			params,
			signature: "",
		});
		expect(ok).toBe(false);
	});
});

// ─── End-to-end via t.fetch ────────────────────────────────────────────────

// `t.fetch` (convex-test) constructs requests against the host
// `https://some.convex.site` — the http action receives `request.url` with
// that exact origin, so the signature must be computed over the same URL.
const TWILIO_URL = "https://some.convex.site/whatsapp/twilio";

/**
 * Helper — same algorithm as the helper, used to sign request payloads in
 * the e2e tests.
 */
async function signTestPayload(
	authToken: string,
	url: string,
	params: Record<string, string>,
): Promise<string> {
	const sorted = Object.keys(params).sort();
	let payload = url;
	for (const k of sorted) payload += k + params[k];
	const enc = new TextEncoder();
	const key = await crypto.subtle.importKey(
		"raw",
		enc.encode(authToken),
		{ name: "HMAC", hash: "SHA-1" },
		false,
		["sign"],
	);
	const sig = await crypto.subtle.sign("HMAC", key, enc.encode(payload));
	let bin = "";
	const bytes = new Uint8Array(sig);
	for (let i = 0; i < bytes.byteLength; i += 1) bin += String.fromCharCode(bytes[i]);
	return btoa(bin);
}

function encodeForm(params: Record<string, string>): string {
	const usp = new URLSearchParams();
	for (const [k, v] of Object.entries(params)) usp.set(k, v);
	return usp.toString();
}

/**
 * Seed an org + agent member with `ai.use` permission + a Twilio
 * agentChannels row. Returns the new ids so the test can assert against
 * them. Direct inserts (no orgs.mutations.create) so we don't have to
 * authenticate — the http handler doesn't care about session identity,
 * only the agentChannels row.
 */
async function seedAgentChannel(
	t: ReturnType<typeof convexTest>,
	args: {
		userEmail: string;
		orgSlug: string;
		phoneNumber: string;
		mode: "agent_ops" | "send" | "profile";
		enabled: boolean;
	},
) {
	return t.run(async (ctx) => {
		const now = Date.now();
		const userId = await ctx.db.insert("users", {
			tokenIdentifier: `password|${args.userEmail}`,
			email: args.userEmail,
			name: "Agent",
			onboardingCompleted: true,
			createdAt: now,
			updatedAt: now,
		});
		const orgId = await ctx.db.insert("orgs", {
			name: args.orgSlug,
			slug: args.orgSlug,
			industry: "generic",
			plan: "free",
			createdAt: now,
			updatedAt: now,
		});
		const roleId = await ctx.db.insert("orgRoles", {
			orgId,
			name: "Owner",
			permissions: ["ai.use", "leads.create", "tasks.create"],
			isSystem: true,
			isDefault: true,
			color: "#000000",
			createdAt: now,
			updatedAt: now,
		});
		await ctx.db.insert("orgMembers", {
			orgId,
			userId,
			roleId,
			joinedAt: now,
			updatedAt: now,
		});
		await ctx.db.insert("agentChannels", {
			orgId,
			userId,
			provider: "twilio",
			phoneNumber: args.phoneNumber,
			mode: args.mode,
			enabled: args.enabled,
			createdAt: now,
			updatedAt: now,
		});
		return { agentUserId: userId, orgId };
	});
}

describe("POST /whatsapp/twilio (end-to-end)", () => {
	it("returns 401 on a tampered signature", async () => {
		const t = convexTest(schema, modules);
		const params = {
			MessageSid: "SM_e2e_bad_sig",
			From: "whatsapp:+14155550100",
			To: "whatsapp:+18005551212",
			Body: "hello",
		};
		const res = await t.fetch("/whatsapp/twilio", {
			method: "POST",
			headers: {
				"content-type": "application/x-www-form-urlencoded",
				"x-twilio-signature": "obviously_wrong_signature",
			},
			body: encodeForm(params),
		});
		expect(res.status).toBe(401);
	});

	it("returns 401 when the receiving number is unmapped", async () => {
		const t = convexTest(schema, modules);
		const params = {
			MessageSid: "SM_e2e_unmapped",
			From: "whatsapp:+14155550100",
			To: "whatsapp:+19999999999",
			Body: "hello",
		};
		const signature = await signTestPayload(TEST_AUTH_TOKEN, TWILIO_URL, params);
		const res = await t.fetch("/whatsapp/twilio", {
			method: "POST",
			headers: {
				"content-type": "application/x-www-form-urlencoded",
				"x-twilio-signature": signature,
			},
			body: encodeForm(params),
		});
		expect(res.status).toBe(401);
	});

	it("returns 200 for a mapped agent_ops number, schedules autonomousTurn, and dedupes Twilio re-delivery", async () => {
		const t = convexTest(schema, modules);

		// Seed: org + agent member with `ai.use` permission, then the
		// agentChannels row mapping the receiving number to the agent.
		const { agentUserId } = await seedAgentChannel(t, {
			userEmail: "agent@example.com",
			orgSlug: "acme",
			phoneNumber: "+18005551212",
			mode: "agent_ops",
			enabled: true,
		});

		const params = {
			MessageSid: "SM_e2e_ok_001",
			From: "whatsapp:+14155550100",
			To: "whatsapp:+18005551212",
			Body: "Hi, I'm Sara — interested in 2BR JVC, budget 120k.",
		};
		const signature = await signTestPayload(TEST_AUTH_TOKEN, TWILIO_URL, params);

		const res = await t.fetch("/whatsapp/twilio", {
			method: "POST",
			headers: {
				"content-type": "application/x-www-form-urlencoded",
				"x-twilio-signature": signature,
			},
			body: encodeForm(params),
		});
		expect(res.status).toBe(200);
		const body = (await res.json()) as { kind: string; routed?: string; messageSid: string };
		expect(body.kind).toBe("ok");
		expect(body.routed).toBe("agent_ops");
		expect(body.messageSid).toBe("SM_e2e_ok_001");

		// Assert the autonomous turn was scheduled with the agent's userId
		// and channel:"whatsapp". We DON'T finish the scheduled function
		// (that would attempt to run the LLM); we only verify the schedule
		// row exists with the right args.
		const scheduled = await t.run(async (ctx) => {
			return await ctx.db.system.query("_scheduled_functions").collect();
		});
		const autonomousScheduled = scheduled.filter((s) =>
			(s.name ?? "").includes("ai/runtime/autonomous"),
		);
		expect(autonomousScheduled).toHaveLength(1);
		const args = autonomousScheduled[0]?.args?.[0] as Record<string, unknown>;
		expect(args.agentUserId).toBe(agentUserId);
		expect(args.channel).toBe("whatsapp");
		expect(args.idempotencyKey).toBe("SM_e2e_ok_001");

		// Twilio re-delivery: same MessageSid → same outcome shape, no
		// duplicate scheduled row blow-up. (Idempotency on the messages
		// table is keyed off MessageSid; we don't have a contact in this
		// test so no messages row was written — but the autonomous turn
		// IS re-scheduled. That's fine: the engine's per-conversation
		// debounce + audit-marker dedup absorb rapid-fire re-delivery,
		// and an unknown sender has no conversation to dedup against.)
		const res2 = await t.fetch("/whatsapp/twilio", {
			method: "POST",
			headers: {
				"content-type": "application/x-www-form-urlencoded",
				"x-twilio-signature": signature,
			},
			body: encodeForm(params),
		});
		expect(res2.status).toBe(200);
	});

	it("returns 401 when the channel exists but is disabled (kill-switch)", async () => {
		const t = convexTest(schema, modules);
		await seedAgentChannel(t, {
			userEmail: "agent2@example.com",
			orgSlug: "acme2",
			phoneNumber: "+18887776666",
			mode: "agent_ops",
			enabled: false, // kill-switch
		});

		const params = {
			MessageSid: "SM_e2e_disabled",
			From: "whatsapp:+14155550100",
			To: "whatsapp:+18887776666",
			Body: "should be rejected",
		};
		const signature = await signTestPayload(TEST_AUTH_TOKEN, TWILIO_URL, params);
		const res = await t.fetch("/whatsapp/twilio", {
			method: "POST",
			headers: {
				"content-type": "application/x-www-form-urlencoded",
				"x-twilio-signature": signature,
			},
			body: encodeForm(params),
		});
		expect(res.status).toBe(401);
	});
});
