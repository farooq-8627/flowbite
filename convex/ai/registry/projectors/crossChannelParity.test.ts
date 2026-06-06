/**
 * Cross-channel parity tests — S16.
 *
 * The S16 acceptance bar: "the same capability called via chat, MCP, and REST
 * yields the same outcome for the same args/principal."
 *
 * Why it matters: every projector hands different transport off to ONE
 * `runCapability` (the wrapper). If the wrapper is the only thing executing
 * tools, the envelope is identical regardless of channel — by construction.
 * This suite proves that property is preserved by writing every
 * Outcome path through all three projectors with the same fixture and
 * asserting the envelope shapes match.
 *
 * Each test uses an in-memory capability + injected `RefResolver` so no
 * Convex DB is touched. The only difference between the runs is the
 * principal's `channel` field (`chat` / `mcp` / `rest`) — and the audit
 * `source` overrides that the wrapper applies for autonomous turns
 * (covered by `wrapper.test.ts`, not here).
 */
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { ok } from "../result";
import type { Capability, CapabilityCtx, CapabilityResult, Channel, Principal } from "../types";
import { runCapability } from "../wrapper";
import { projectAll } from "./aiSdk";
import { handleMcpRequest, type McpRpcResponse } from "./mcp";
import { handleRestRequest } from "./rest";

// ─── Fixtures ────────────────────────────────────────────────────────────────

function makePrincipal(channel: Channel, permissions: string[] = []): Principal {
	return {
		kind: "member",
		userId: "u1" as unknown as Principal["userId"],
		orgId: "o1" as unknown as Principal["orgId"],
		permissions,
		channel,
	};
}

function makeCtx(channel: Channel, permissions: string[] = []): CapabilityCtx {
	return {
		ctx: undefined as unknown as CapabilityCtx["ctx"],
		principal: makePrincipal(channel, permissions),
	};
}

function makeCap(over: Partial<Capability> = {}): Capability {
	return {
		name: "search_crm",
		module: "core",
		group: "core",
		permission: null,
		risk: "safe",
		channels: ["chat", "mcp", "rest"],
		spec: {
			whenToCall: "Search the CRM by name.",
			goodExample: { query: "Sara" },
		},
		drive: { onSuccess: "narrate matches" },
		input: z.object({ query: z.string().min(1) }),
		run: async () => ok({ headline: "found 1 match", facts: ["P-001 Sara"] }),
		...over,
	};
}

// ─── Run-the-cap-via-each-channel helper ─────────────────────────────────────

/** What every channel's projector ultimately returns to the caller. */
type EnvelopeView = {
	status: CapabilityResult["status"];
	headline: string;
	facts?: string[];
	repair?: CapabilityResult["repair"];
	errors?: CapabilityResult["errors"];
};

async function runViaChat(
	cap: Capability,
	args: unknown,
	ctx: CapabilityCtx,
): Promise<EnvelopeView> {
	const tools = projectAll([cap], () => ctx);
	const aiTool = tools[cap.name] as {
		execute: (args: unknown, opts?: unknown) => Promise<EnvelopeView>;
	};
	const result = await aiTool.execute(args, undefined);
	return result;
}

async function runViaMcp(
	cap: Capability,
	args: unknown,
	ctx: CapabilityCtx,
	scopes: readonly string[] = ["*"],
): Promise<EnvelopeView> {
	const response = await handleMcpRequest({
		body: {
			jsonrpc: "2.0",
			id: 1,
			method: "tools/call",
			params: { name: cap.name, arguments: args },
		},
		caps: [cap],
		ctx,
		scopes,
	});
	const success = response as Extract<McpRpcResponse, { result: unknown }>;
	const r = success.result as { structuredContent: EnvelopeView };
	return r.structuredContent;
}

async function runViaRest(
	cap: Capability,
	args: unknown,
	ctx: CapabilityCtx,
	scopes: readonly string[] = ["*"],
): Promise<EnvelopeView> {
	const out = await handleRestRequest({
		path: `/ai/rest/${cap.name}`,
		body: args,
		caps: [cap],
		ctx,
		scopes,
	});
	expect(out.httpStatus).toBe(200);
	return out.json as EnvelopeView;
}

async function runViaAllChannels(
	cap: Capability,
	args: unknown,
	permissions: string[] = [],
): Promise<{ chat: EnvelopeView; mcp: EnvelopeView; rest: EnvelopeView }> {
	const chat = await runViaChat(cap, args, makeCtx("chat", permissions));
	const mcp = await runViaMcp(cap, args, makeCtx("mcp", permissions));
	const rest = await runViaRest(cap, args, makeCtx("rest", permissions));
	return { chat, mcp, rest };
}

// ─── Parity suites ───────────────────────────────────────────────────────────

describe("cross-channel parity — happy path", () => {
	it("ok envelope is identical across chat / MCP / REST", async () => {
		const cap = makeCap();
		const { chat, mcp, rest } = await runViaAllChannels(cap, { query: "Sara" });
		expect(chat.status).toBe("ok");
		expect(mcp.status).toBe("ok");
		expect(rest.status).toBe("ok");
		expect(chat.headline).toBe("found 1 match");
		expect(mcp.headline).toBe("found 1 match");
		expect(rest.headline).toBe("found 1 match");
		expect(chat.facts).toEqual(["P-001 Sara"]);
		expect(mcp.facts).toEqual(["P-001 Sara"]);
		expect(rest.facts).toEqual(["P-001 Sara"]);
	});
});

describe("cross-channel parity — needs_repair", () => {
	it("a bad arg becomes the same `repair` envelope on every channel", async () => {
		const cap = makeCap();
		const { chat, mcp, rest } = await runViaAllChannels(cap, { query: 42 });
		// Same status...
		expect(chat.status).toBe("needs_repair");
		expect(mcp.status).toBe("needs_repair");
		expect(rest.status).toBe("needs_repair");
		// ...same field name in the repair hint.
		expect(chat.repair?.field).toBe("query");
		expect(mcp.repair?.field).toBe("query");
		expect(rest.repair?.field).toBe("query");
	});
});

describe("cross-channel parity — RBAC denial", () => {
	it("missing permission denies on every channel with the same headline", async () => {
		const cap = makeCap({ permission: "leads.create" });
		const { chat, mcp, rest } = await runViaAllChannels(cap, { query: "Sara" });
		expect(chat.status).toBe("denied");
		expect(mcp.status).toBe("denied");
		expect(rest.status).toBe("denied");
		expect(chat.headline).toBe(rest.headline);
		expect(mcp.headline).toBe(rest.headline);
	});

	it("granting permission lets the same args succeed on every channel", async () => {
		const cap = makeCap({ permission: "leads.create" });
		const { chat, mcp, rest } = await runViaAllChannels(cap, { query: "Sara" }, [
			"leads.create",
		]);
		expect(chat.status).toBe("ok");
		expect(mcp.status).toBe("ok");
		expect(rest.status).toBe("ok");
	});
});

describe("cross-channel parity — channel allow-list", () => {
	it("a chat-only capability is denied uniformly on MCP + REST", async () => {
		const cap = makeCap({ channels: ["chat"] });
		const ctxChat = makeCtx("chat");
		const ctxMcp = makeCtx("mcp");
		const ctxRest = makeCtx("rest");

		const chatResult = await runCapability(cap, { query: "Sara" }, ctxChat);
		expect(chatResult.status).toBe("ok");

		const mcpRaw = await handleMcpRequest({
			body: {
				jsonrpc: "2.0",
				id: 1,
				method: "tools/call",
				params: { name: cap.name, arguments: { query: "Sara" } },
			},
			caps: [cap],
			ctx: ctxMcp,
			scopes: ["*"],
		});
		const mcpResult = (mcpRaw as Extract<McpRpcResponse, { result: unknown }>).result as {
			structuredContent: { status: string };
		};
		expect(mcpResult.structuredContent.status).toBe("channel_blocked");

		const restOut = await handleRestRequest({
			path: `/ai/rest/${cap.name}`,
			body: { query: "Sara" },
			caps: [cap],
			ctx: ctxRest,
			scopes: ["*"],
		});
		expect(restOut.httpStatus).toBe(200);
		const restResult = restOut.json as { status: string };
		expect(restResult.status).toBe("channel_blocked");
	});
});

describe("cross-channel parity — irreversible 2FA fence", () => {
	it("an irreversible cap requires step_up on every channel that allows it", async () => {
		// `irreversible` is BLOCKED outright on whatsapp; for chat/mcp/rest it
		// requires a step-up token.
		const cap = makeCap({
			risk: "irreversible",
			channels: ["chat", "mcp", "rest"],
			run: async () => ok({ headline: "deleted everything" }),
		});
		const { chat, mcp, rest } = await runViaAllChannels(cap, { query: "Sara" });
		expect(chat.status).toBe("needs_step_up");
		expect(mcp.status).toBe("needs_step_up");
		expect(rest.status).toBe("needs_step_up");
	});
});

describe("cross-channel parity — business_error", () => {
	it("a thrown Error becomes a `business_error` envelope identically", async () => {
		const cap = makeCap({
			run: async () => {
				throw new Error("kaboom");
			},
		});
		const { chat, mcp, rest } = await runViaAllChannels(cap, { query: "Sara" });
		expect(chat.status).toBe("business_error");
		expect(mcp.status).toBe("business_error");
		expect(rest.status).toBe("business_error");
		expect(chat.headline).toContain("kaboom");
		expect(mcp.headline).toContain("kaboom");
		expect(rest.headline).toContain("kaboom");
	});
});
