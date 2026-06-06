/**
 * S14 — Outbound send capability tests.
 *
 * Three layers:
 *   1. Pure-helper tests (templates render, 24h window check, Twilio
 *      request-body shape) — no Convex harness needed.
 *   2. Contract tests for the `send_whatsapp` capability — pure mock
 *      `ctx` so we can assert the gate paths (channel missing,
 *      out-of-window without template, missing template var, mock
 *      Twilio happy path) without spinning convex-test.
 *   3. Mocked-Twilio happy path that exercises the FULL capability
 *      surface — sets `TWILIO_MOCK_MODE=1` so the real action returns a
 *      deterministic SID; mocks the V8 internal queries via the same
 *      stub-ctx pattern S11/S13 use in the autonomous tests.
 *
 * The S14 acceptance criteria are:
 *   • within-window send uses a session message (Body, no ContentSid),
 *   • out-of-window send REFUSES free-form and asks for a template,
 *   • audit row is written by the wrapper (B.38 round-trip ensures
 *     `source` mirrors the principal channel; S14 doesn't override it).
 */

import { getFunctionName } from "convex/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { internal } from "../../_generated/api";
import type { Id } from "../../_generated/dataModel";
import type { ActionCtx } from "../../_generated/server";
import { getCapability } from "../registry/define";
import type { Capability, CapabilityCtx, Principal } from "../registry/types";
import { runCapability } from "../registry/wrapper";
// Side-effect import — registers `send_whatsapp` + `whatsapp` group.
import "./capabilities";
import {
	buildBasicAuthHeader,
	buildMockSid,
	buildTwilioRequestBody,
	withWhatsappScheme,
} from "./whatsappOutbound";
import {
	buildTemplateIndex,
	DEFAULT_WHATSAPP_TEMPLATES,
	findTemplate,
	isWithinSessionWindow,
	listTemplateIds,
	renderTemplateBody,
	SESSION_WINDOW_MS,
} from "./whatsappTemplates";

// ─── 1. Pure helpers ────────────────────────────────────────────────────────

describe("whatsappTemplates — pure helpers", () => {
	it("buildTemplateIndex / findTemplate / listTemplateIds round-trip", () => {
		const index = buildTemplateIndex();
		expect(index.size).toBe(DEFAULT_WHATSAPP_TEMPLATES.length);
		const ids = listTemplateIds();
		expect(ids).toContain("greeting_v1");
		expect(ids).toContain("follow_up_v1");
		expect(ids).toContain("appointment_v1");
		expect(ids).toContain("agent_handoff_v1");
		expect(findTemplate("greeting_v1")?.label).toBe("Greeting");
		expect(findTemplate("does_not_exist")).toBeUndefined();
	});

	it("renderTemplateBody substitutes every {{var}} occurrence", () => {
		const greeting = findTemplate("greeting_v1");
		expect(greeting).toBeDefined();
		if (!greeting) throw new Error("test invariant");
		const result = renderTemplateBody(greeting, {
			name: "Sara",
			agent_name: "Aisha",
			org_name: "Orbitly",
		});
		expect(result.ok).toBe(true);
		if (result.ok) {
			expect(result.body).toContain("Sara");
			expect(result.body).toContain("Aisha");
			expect(result.body).toContain("Orbitly");
			expect(result.body).not.toContain("{{");
		}
	});

	it("renderTemplateBody returns missing[] when a required var is absent", () => {
		const t = findTemplate("appointment_v1");
		if (!t) throw new Error("test invariant");
		const result = renderTemplateBody(t, { name: "Sara" });
		expect(result.ok).toBe(false);
		if (!result.ok) {
			expect(result.missing).toContain("event");
			expect(result.missing).toContain("date");
			expect(result.missing).toContain("time");
		}
	});

	it("renderTemplateBody handles repeated placeholders", () => {
		const tpl = {
			id: "test",
			label: "Test",
			description: "—",
			category: "utility" as const,
			body: "{{name}} says hi to {{name}}.",
			variables: [{ name: "name", description: "—" }],
		};
		const result = renderTemplateBody(tpl, { name: "Sara" });
		expect(result.ok).toBe(true);
		if (result.ok) expect(result.body).toBe("Sara says hi to Sara.");
	});

	it("isWithinSessionWindow respects the 24h cutoff", () => {
		const now = 1_000_000_000_000;
		expect(isWithinSessionWindow(undefined, now)).toBe(false);
		expect(isWithinSessionWindow(null, now)).toBe(false);
		expect(isWithinSessionWindow(now - 1_000, now)).toBe(true);
		expect(isWithinSessionWindow(now - SESSION_WINDOW_MS + 1, now)).toBe(true);
		expect(isWithinSessionWindow(now - SESSION_WINDOW_MS, now)).toBe(false);
		expect(isWithinSessionWindow(now - SESSION_WINDOW_MS - 1, now)).toBe(false);
	});
});

describe("whatsappOutbound — pure helpers", () => {
	it("withWhatsappScheme is idempotent + adds the prefix", () => {
		expect(withWhatsappScheme("+14155550100")).toBe("whatsapp:+14155550100");
		expect(withWhatsappScheme("whatsapp:+14155550100")).toBe("whatsapp:+14155550100");
	});

	it("buildTwilioRequestBody — session shape (Body, no ContentSid)", () => {
		const body = buildTwilioRequestBody({
			from: "whatsapp:+14155550100",
			to: "whatsapp:+971501234567",
			body: "Hello!",
		});
		expect(body.get("From")).toBe("whatsapp:+14155550100");
		expect(body.get("To")).toBe("whatsapp:+971501234567");
		expect(body.get("Body")).toBe("Hello!");
		expect(body.get("ContentSid")).toBeNull();
	});

	it("buildTwilioRequestBody — template shape (ContentSid + ContentVariables JSON)", () => {
		const body = buildTwilioRequestBody({
			from: "whatsapp:+14155550100",
			to: "whatsapp:+971501234567",
			contentSid: "HX12345",
			contentVariables: { "1": "Sara", "2": "Tue 11 Jun" },
		});
		expect(body.get("ContentSid")).toBe("HX12345");
		expect(JSON.parse(body.get("ContentVariables") ?? "{}")).toEqual({
			"1": "Sara",
			"2": "Tue 11 Jun",
		});
		expect(body.get("Body")).toBeNull();
	});

	it("buildBasicAuthHeader emits a base64 `user:pass` Basic header", () => {
		const header = buildBasicAuthHeader("ACfake", "tokenfake");
		expect(header.startsWith("Basic ")).toBe(true);
		const decoded =
			typeof Buffer !== "undefined"
				? Buffer.from(header.slice(6), "base64").toString("utf8")
				: atob(header.slice(6));
		expect(decoded).toBe("ACfake:tokenfake");
	});

	it("buildMockSid is deterministic + 34 chars long (Twilio SID shape)", () => {
		const a = buildMockSid("seed-1");
		const b = buildMockSid("seed-1");
		const c = buildMockSid("seed-2");
		expect(a).toBe(b);
		expect(a).not.toBe(c);
		expect(a.length).toBe(34);
		expect(a.startsWith("SMmock")).toBe(true);
	});
});

// ─── 2. Capability gate tests via stub ctx ─────────────────────────────────

const ORG_ID = "o_send_whatsapp" as unknown as Id<"orgs">;
const USER_ID = "u_send_whatsapp" as unknown as Id<"users">;

function getSendWhatsapp(): Capability {
	const cap = getCapability("send_whatsapp");
	if (!cap) throw new Error("send_whatsapp capability not registered");
	return cap;
}

function makePrincipal(over: Partial<Principal> = {}): Principal {
	return {
		kind: "member",
		userId: USER_ID,
		orgId: ORG_ID,
		permissions: ["messages.send"],
		channel: "chat",
		...over,
	};
}

type StubFnRef = { _name?: string };
function nameOf(ref: unknown): string {
	const direct = (ref as StubFnRef)?._name;
	if (typeof direct === "string") return direct;
	return getFunctionName(ref as never);
}

/** Build a minimal ActionCtx that pattern-matches by Convex function name. */
function makeStubCtx(handlers: {
	findAgentSendChannel?: () => unknown;
	findRecipientByPersonCode?: () => unknown;
	getMostRecentInboundForPerson?: () => unknown;
	sendWhatsappViaTwilioAction?: (args: Record<string, unknown>) => unknown;
	sendForAI?: (args: Record<string, unknown>) => unknown;
	getTemplateForOrg?: (args: Record<string, unknown>) => unknown;
	listForOrgInternal?: () => unknown;
}): {
	ctx: ActionCtx;
	calls: {
		twilio: Array<Record<string, unknown>>;
		send: Array<Record<string, unknown>>;
		audit: Array<Record<string, unknown>>;
	};
} {
	const calls = {
		twilio: [] as Array<Record<string, unknown>>,
		send: [] as Array<Record<string, unknown>>,
		audit: [] as Array<Record<string, unknown>>,
	};

	// Resolve known function paths once.
	const findAgentPath = nameOf(internal.ai.channels.whatsappOutboundState.findAgentSendChannel);
	const findRecipientPath = nameOf(
		internal.ai.channels.whatsappOutboundState.findRecipientByPersonCode,
	);
	const recentInboundPath = nameOf(
		internal.ai.channels.whatsappOutboundState.getMostRecentInboundForPerson,
	);
	const twilioPath = nameOf(internal.ai.channels.whatsappOutbound.sendWhatsappViaTwilioAction);
	const sendForAIPath = nameOf(internal.crm.shared.messages.mutations.sendForAI);
	const auditLogPath = nameOf(internal.ai._logAIActivityInternal.logAIActivity);
	const getTemplatePath = nameOf(internal._platform.whatsappTemplates.queries.getTemplateForOrg);
	const listTemplatesPath = nameOf(
		internal._platform.whatsappTemplates.queries.listForOrgInternal,
	);

	// Default handler for getTemplateForOrg — returns the seed template
	// matching the requested templateId if no override handler given.
	const defaultGetTemplate = (args: Record<string, unknown>) => {
		const id = String(args.templateId ?? "");
		const seed = DEFAULT_WHATSAPP_TEMPLATES.find((t) => t.id === id);
		if (!seed) return null;
		return {
			templateId: seed.id,
			label: seed.label,
			body: seed.body,
			variables: seed.variables,
			contentSid: seed.contentSid ?? null,
			active: true,
		};
	};

	// Default handler for listForOrgInternal — returns every seed template.
	const defaultListTemplates = () =>
		DEFAULT_WHATSAPP_TEMPLATES.map((seed) => ({
			templateId: seed.id,
			label: seed.label,
			body: seed.body,
			variables: seed.variables,
			contentSid: seed.contentSid ?? null,
			active: true,
		}));

	const dispatchQuery = async (ref: unknown, args: unknown) => {
		const name = nameOf(ref);
		if (name === findAgentPath) return handlers.findAgentSendChannel?.() ?? null;
		if (name === findRecipientPath) return handlers.findRecipientByPersonCode?.() ?? null;
		if (name === recentInboundPath) return handlers.getMostRecentInboundForPerson?.() ?? null;
		if (name === getTemplatePath) {
			const cb = handlers.getTemplateForOrg ?? defaultGetTemplate;
			return cb((args as Record<string, unknown>) ?? {});
		}
		if (name === listTemplatesPath) {
			const cb = handlers.listForOrgInternal ?? defaultListTemplates;
			return cb();
		}
		throw new Error(`unstubbed query: ${name} args=${JSON.stringify(args)}`);
	};

	const dispatchAction = async (ref: unknown, args: unknown) => {
		const name = nameOf(ref);
		if (name === twilioPath) {
			calls.twilio.push((args as Record<string, unknown>) ?? {});
			return (
				handlers.sendWhatsappViaTwilioAction?.(args as Record<string, unknown>) ?? {
					ok: true,
					sid: "SMmock_default",
					mock: true,
				}
			);
		}
		throw new Error(`unstubbed action: ${name}`);
	};

	const dispatchMutation = async (ref: unknown, args: unknown) => {
		const name = nameOf(ref);
		if (name === sendForAIPath) {
			calls.send.push((args as Record<string, unknown>) ?? {});
			return handlers.sendForAI?.(args as Record<string, unknown>) ?? "msg_default";
		}
		// Audit log — wrapper.ts step 8 calls `logAIActivity`.
		if (name === auditLogPath) {
			calls.audit.push((args as Record<string, unknown>) ?? {});
			return undefined;
		}
		throw new Error(`unstubbed mutation: ${name} args=${JSON.stringify(args)}`);
	};

	const ctx = {
		runQuery: vi.fn(dispatchQuery),
		runAction: vi.fn(dispatchAction),
		runMutation: vi.fn(dispatchMutation),
	} as unknown as ActionCtx;

	return { ctx, calls };
}

function makeCapCtx(ctx: ActionCtx, principal: Principal = makePrincipal()): CapabilityCtx {
	return { ctx, principal };
}

// ─── Tests ─────────────────────────────────────────────────────────────────

let originalMockMode: string | undefined;
beforeEach(() => {
	originalMockMode = process.env.TWILIO_MOCK_MODE;
	process.env.TWILIO_MOCK_MODE = "1";
});
afterEach(() => {
	if (originalMockMode === undefined) {
		delete process.env.TWILIO_MOCK_MODE;
	} else {
		process.env.TWILIO_MOCK_MODE = originalMockMode;
	}
});

describe("send_whatsapp — Mode B routing + 24h window gate", () => {
	it("registers as a capability with risk:reversible, channels include chat+whatsapp", () => {
		const cap = getSendWhatsapp();
		expect(cap.risk).toBe("reversible");
		expect(cap.channels).toContain("chat");
		expect(cap.channels).toContain("whatsapp");
		expect(cap.permission).toBe("messages.send");
		expect(cap.module).toBe("messaging");
	});

	it('returns not_found when no `mode:"send"` agentChannels row exists', async () => {
		const cap = getSendWhatsapp();
		const { ctx } = makeStubCtx({
			findAgentSendChannel: () => null,
		});
		const result = await runCapability(
			cap,
			{ recipientPersonCode: "P-007", message: "Hi" },
			makeCapCtx(ctx),
		);
		expect(result.status).toBe("not_found");
		expect(result.headline).toContain("not configured");
	});

	it("returns not_found when the recipient personCode has no phone on file", async () => {
		const cap = getSendWhatsapp();
		const { ctx } = makeStubCtx({
			findAgentSendChannel: () => ({ phoneNumber: "+14155550100", userId: USER_ID }),
			findRecipientByPersonCode: () => null,
		});
		const result = await runCapability(
			cap,
			{ recipientPersonCode: "P-007", message: "Hi" },
			makeCapCtx(ctx),
		);
		expect(result.status).toBe("not_found");
		expect(result.headline).toContain("P-007");
	});

	it("happy path within-window — session Body, audit row written, message persisted", async () => {
		const cap = getSendWhatsapp();
		const now = Date.now();
		const { ctx, calls } = makeStubCtx({
			findAgentSendChannel: () => ({ phoneNumber: "+14155550100", userId: USER_ID }),
			findRecipientByPersonCode: () => ({
				entityType: "lead",
				personCode: "P-007",
				phone: "+971501234567",
				displayName: "Sara",
			}),
			getMostRecentInboundForPerson: () => ({ createdAt: now - 60_000 }),
		});
		const result = await runCapability(
			cap,
			{
				recipientPersonCode: "P-007",
				message: "Sending JVC options shortly.",
			},
			makeCapCtx(ctx),
		);

		expect(result.status).toBe("ok");
		expect(result.headline).toContain("Sara");
		// Twilio called with Body (session message), no ContentSid.
		expect(calls.twilio).toHaveLength(1);
		const tw = calls.twilio[0];
		expect(tw.body).toBe("Sending JVC options shortly.");
		expect(tw.contentSid).toBeUndefined();

		// Outbound persisted with channel:"whatsapp" + authorType:"ai" + onBehalfOf=agent.
		expect(calls.send).toHaveLength(1);
		const sent = calls.send[0];
		expect(sent.channel).toBe("whatsapp");
		expect(sent.authorType).toBe("ai");
		expect(sent.onBehalfOf).toBe(USER_ID);
		expect(sent.entityType).toBe("lead");
		expect(sent.entityId).toBe("P-007");
		// idempotencyKey is the Twilio SID — keys de-dup re-runs of the same send.
		expect(typeof sent.idempotencyKey).toBe("string");

		// Audit row written by the wrapper (B.38 round-trip — source mirrors channel).
		expect(calls.audit).toHaveLength(1);
		const audit = calls.audit[0];
		expect(audit.entityType).toBe("ai_capability");
		expect(audit.entityId).toBe("send_whatsapp");
		expect(audit.action).toBe("ai.cap.send_whatsapp");
	});

	it("authoredBy:'user' lands as authorType:'user' (agent dictated verbatim)", async () => {
		const cap = getSendWhatsapp();
		const now = Date.now();
		const { ctx, calls } = makeStubCtx({
			findAgentSendChannel: () => ({ phoneNumber: "+14155550100", userId: USER_ID }),
			findRecipientByPersonCode: () => ({
				entityType: "lead",
				personCode: "P-007",
				phone: "+971501234567",
				displayName: "Sara",
			}),
			getMostRecentInboundForPerson: () => ({ createdAt: now - 60_000 }),
		});
		const result = await runCapability(
			cap,
			{
				recipientPersonCode: "P-007",
				message: "Hi Sara",
				authoredBy: "user",
			},
			makeCapCtx(ctx),
		);
		expect(result.status).toBe("ok");
		expect(calls.send[0].authorType).toBe("user");
	});

	it("OUT-of-window free-form is REFUSED with a repair envelope listing template ids", async () => {
		const cap = getSendWhatsapp();
		const now = Date.now();
		const { ctx, calls } = makeStubCtx({
			findAgentSendChannel: () => ({ phoneNumber: "+14155550100", userId: USER_ID }),
			findRecipientByPersonCode: () => ({
				entityType: "lead",
				personCode: "P-007",
				phone: "+971501234567",
				displayName: "Sara",
			}),
			// 25h ago — outside the 24h window.
			getMostRecentInboundForPerson: () => ({ createdAt: now - 25 * 60 * 60 * 1000 }),
		});
		const result = await runCapability(
			cap,
			{ recipientPersonCode: "P-007", message: "Hi Sara" },
			makeCapCtx(ctx),
		);
		expect(result.status).toBe("needs_repair");
		expect(result.repair?.field).toBe("message");
		expect(result.repair?.expected).toContain("templateId");
		// Twilio MUST NOT have been called.
		expect(calls.twilio).toHaveLength(0);
		// No outbound row written either.
		expect(calls.send).toHaveLength(0);
	});

	it("OUT-of-window template send — uses approved template + writes the rendered body", async () => {
		const cap = getSendWhatsapp();
		const now = Date.now();
		const { ctx, calls } = makeStubCtx({
			findAgentSendChannel: () => ({ phoneNumber: "+14155550100", userId: USER_ID }),
			findRecipientByPersonCode: () => ({
				entityType: "lead",
				personCode: "P-007",
				phone: "+971501234567",
				displayName: "Sara",
			}),
			getMostRecentInboundForPerson: () => null, // no inbound at all = window closed
		});
		const result = await runCapability(
			cap,
			{
				recipientPersonCode: "P-007",
				templateId: "agent_handoff_v1",
				templateVars: { name: "Sara" },
			},
			makeCapCtx(ctx),
		);
		expect(result.status).toBe("ok");
		expect(calls.twilio).toHaveLength(1);
		const tw = calls.twilio[0];
		// Template doesn't have a contentSid → falls through to Body in mock mode
		// (the action returns mock SID; capability still records the template).
		expect(typeof tw.body).toBe("string");
		expect(String(tw.body)).toContain("Sara");
		expect(calls.send[0].content).toContain("Sara");
	});

	it("OUT-of-window template send — missing var triggers a repair envelope", async () => {
		const cap = getSendWhatsapp();
		const now = Date.now();
		const { ctx, calls } = makeStubCtx({
			findAgentSendChannel: () => ({ phoneNumber: "+14155550100", userId: USER_ID }),
			findRecipientByPersonCode: () => ({
				entityType: "lead",
				personCode: "P-007",
				phone: "+971501234567",
				displayName: "Sara",
			}),
			getMostRecentInboundForPerson: () => ({ createdAt: now - 26 * 60 * 60 * 1000 }),
		});
		const result = await runCapability(
			cap,
			{
				recipientPersonCode: "P-007",
				templateId: "appointment_v1",
				templateVars: { name: "Sara" }, // missing event/date/time
			},
			makeCapCtx(ctx),
		);
		expect(result.status).toBe("needs_repair");
		expect(result.repair?.field).toBe("templateVars");
		expect(calls.twilio).toHaveLength(0);
	});

	it("returns repair envelope when an unknown templateId is passed", async () => {
		const cap = getSendWhatsapp();
		const { ctx, calls } = makeStubCtx({
			findAgentSendChannel: () => ({ phoneNumber: "+14155550100", userId: USER_ID }),
			findRecipientByPersonCode: () => ({
				entityType: "lead",
				personCode: "P-007",
				phone: "+971501234567",
				displayName: "Sara",
			}),
			getMostRecentInboundForPerson: () => null,
		});
		const result = await runCapability(
			cap,
			{
				recipientPersonCode: "P-007",
				templateId: "no_such_template",
				templateVars: {},
			},
			makeCapCtx(ctx),
		);
		expect(result.status).toBe("needs_repair");
		expect(result.repair?.field).toBe("templateId");
		expect(calls.twilio).toHaveLength(0);
	});

	it("denies the call when principal lacks `messages.send`", async () => {
		const cap = getSendWhatsapp();
		const { ctx, calls } = makeStubCtx({
			findAgentSendChannel: () => ({ phoneNumber: "+14155550100", userId: USER_ID }),
		});
		const result = await runCapability(
			cap,
			{ recipientPersonCode: "P-007", message: "Hi" },
			makeCapCtx(ctx, makePrincipal({ permissions: [] })),
		);
		expect(result.status).toBe("denied");
		expect(calls.twilio).toHaveLength(0);
	});
});
