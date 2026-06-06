/**
 * MCP projector tests — S16.
 *
 * Locks the JSON-RPC 2.0 surface: every supported method
 * (`initialize`, `tools/list`, `tools/call`) returns a valid frame; every
 * unsupported method or malformed input maps to a JSON-RPC error code.
 * Most importantly: `tools/call` ALWAYS routes through `runCapability` so
 * the gate / coercion / envelope is identical to chat — proven by the
 * cross-channel parity suite next door.
 */
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { ok } from "../result";
import type { Capability, CapabilityCtx, Principal } from "../types";
import {
	describeCapabilityForMCP,
	handleMcpRequest,
	listCapabilitiesForPrincipal,
	MCP_ERROR_CODES,
	type McpRpcResponse,
	makeRpcError,
	makeRpcResult,
} from "./mcp";

// ─── Fixtures ────────────────────────────────────────────────────────────────

function makePrincipal(over: Partial<Principal> = {}): Principal {
	return {
		kind: "member",
		userId: "u1" as unknown as Principal["userId"],
		orgId: "o1" as unknown as Principal["orgId"],
		permissions: [],
		channel: "mcp",
		...over,
	};
}

function makeCtx(over: Partial<CapabilityCtx> = {}): CapabilityCtx {
	return {
		ctx: undefined as unknown as CapabilityCtx["ctx"],
		principal: makePrincipal(),
		...over,
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
			whenToCall: "Cross-entity search by name / email / phone.",
			whenNotToCall: "you already have a code.",
			synonyms: ["find", "look up"],
			goodExample: { query: "Sara" },
		},
		drive: { onSuccess: "narrate the matches" },
		input: z.object({ query: z.string().min(1) }),
		run: async () => ok({ headline: "found 1 match" }),
		...over,
	};
}

// ─── describeCapabilityForMCP ────────────────────────────────────────────────

describe("describeCapabilityForMCP", () => {
	it("emits a valid MCP tool descriptor", () => {
		const cap = makeCap();
		const tool = describeCapabilityForMCP(cap);
		expect(tool.name).toBe("search_crm");
		expect(tool.title).toBe("search crm");
		expect(tool.description).toContain("Cross-entity search");
		expect(tool.description).toContain('"Sara"');
		expect(tool.inputSchema.type).toBe("object");
		expect(tool.inputSchema.additionalProperties).toBe(true);
		expect(tool.annotations?.readOnlyHint).toBe(true);
		expect(tool.annotations?.destructiveHint).toBe(false);
	});

	it("flags irreversible caps as destructive", () => {
		const cap = makeCap({
			name: "bulk_delete_entities",
			risk: "irreversible",
		});
		const tool = describeCapabilityForMCP(cap);
		expect(tool.annotations?.destructiveHint).toBe(true);
		expect(tool.annotations?.readOnlyHint).toBe(false);
	});
});

// ─── listCapabilitiesForPrincipal ────────────────────────────────────────────

describe("listCapabilitiesForPrincipal", () => {
	it("filters by RBAC, channel, and token scopes", () => {
		const allowed = makeCap({ name: "search_crm" });
		const restricted = makeCap({
			name: "create_lead",
			permission: "leads.create",
		});
		const restOnly = makeCap({ name: "rest_only", channels: ["rest"] });

		// Principal with both perms + wildcard scopes
		const fullCtx = makeCtx({
			principal: makePrincipal({ permissions: ["leads.create"], channel: "mcp" }),
		});
		const wildcard = listCapabilitiesForPrincipal(
			[allowed, restricted, restOnly],
			fullCtx,
			["*"],
			"mcp",
		);
		expect(wildcard.map((c) => c.name)).toEqual(["search_crm", "create_lead"]);

		// Narrowed scopes — only `search_crm` is in the allow-list
		const narrow = listCapabilitiesForPrincipal(
			[allowed, restricted, restOnly],
			fullCtx,
			["search_crm"],
			"mcp",
		);
		expect(narrow.map((c) => c.name)).toEqual(["search_crm"]);

		// No leads.create perm — restricted disappears
		const viewerCtx = makeCtx({
			principal: makePrincipal({ permissions: [], channel: "mcp" }),
		});
		const viewer = listCapabilitiesForPrincipal(
			[allowed, restricted, restOnly],
			viewerCtx,
			["*"],
			"mcp",
		);
		expect(viewer.map((c) => c.name)).toEqual(["search_crm"]);
	});
});

// ─── handleMcpRequest ──────────────────────────────────────────────────────

describe("handleMcpRequest — initialize", () => {
	it("responds with the protocol version + tool capability", async () => {
		const response = await handleMcpRequest({
			body: { jsonrpc: "2.0", id: 1, method: "initialize" },
			caps: [makeCap()],
			ctx: makeCtx(),
			scopes: ["*"],
		});
		const ok = response as Extract<McpRpcResponse, { result: unknown }>;
		expect(ok.id).toBe(1);
		const result = ok.result as {
			protocolVersion: string;
			capabilities: { tools: { listChanged: boolean } };
		};
		expect(result.protocolVersion).toMatch(/^\d{4}-\d{2}-\d{2}$/);
		expect(result.capabilities.tools.listChanged).toBe(false);
	});
});

describe("handleMcpRequest — tools/list", () => {
	it("returns descriptors for capabilities the principal can run", async () => {
		const a = makeCap({ name: "search_crm" });
		const b = makeCap({ name: "create_lead", permission: "leads.create" });
		const response = await handleMcpRequest({
			body: { jsonrpc: "2.0", id: 2, method: "tools/list" },
			caps: [a, b],
			ctx: makeCtx({
				principal: makePrincipal({ permissions: ["leads.create"], channel: "mcp" }),
			}),
			scopes: ["*"],
		});
		const ok = response as Extract<McpRpcResponse, { result: unknown }>;
		const result = ok.result as { tools: Array<{ name: string }> };
		expect(result.tools.map((t) => t.name).sort()).toEqual(["create_lead", "search_crm"]);
	});

	it("respects the token's scope allow-list", async () => {
		const a = makeCap({ name: "search_crm" });
		const b = makeCap({ name: "create_lead", permission: "leads.create" });
		const response = await handleMcpRequest({
			body: { jsonrpc: "2.0", id: 2, method: "tools/list" },
			caps: [a, b],
			ctx: makeCtx({
				principal: makePrincipal({ permissions: ["leads.create"], channel: "mcp" }),
			}),
			scopes: ["search_crm"], // narrow scope
		});
		const ok = response as Extract<McpRpcResponse, { result: unknown }>;
		const result = ok.result as { tools: Array<{ name: string }> };
		expect(result.tools.map((t) => t.name)).toEqual(["search_crm"]);
	});
});

describe("handleMcpRequest — tools/call", () => {
	it("executes the capability and returns the structured envelope", async () => {
		const cap = makeCap();
		const response = await handleMcpRequest({
			body: {
				jsonrpc: "2.0",
				id: "abc",
				method: "tools/call",
				params: { name: "search_crm", arguments: { query: "Sara" } },
			},
			caps: [cap],
			ctx: makeCtx(),
			scopes: ["*"],
		});
		const ok = response as Extract<McpRpcResponse, { result: unknown }>;
		expect(ok.id).toBe("abc");
		const result = ok.result as {
			isError: boolean;
			content: Array<{ type: string; text: string }>;
			structuredContent: { status: string; headline: string };
		};
		expect(result.isError).toBe(false);
		expect(result.content[0].type).toBe("text");
		expect(result.content[0].text).toBe("found 1 match");
		expect(result.structuredContent.status).toBe("ok");
		expect(result.structuredContent.headline).toBe("found 1 match");
	});

	it("turns an unknown capability into JSON-RPC -32000 (toolNotFound)", async () => {
		const response = await handleMcpRequest({
			body: {
				jsonrpc: "2.0",
				id: 3,
				method: "tools/call",
				params: { name: "no_such_tool" },
			},
			caps: [makeCap()],
			ctx: makeCtx(),
			scopes: ["*"],
		});
		const err = response as Extract<McpRpcResponse, { error: unknown }>;
		expect(err.error?.code).toBe(MCP_ERROR_CODES.toolNotFound);
	});

	it("turns out-of-scope into JSON-RPC -32001 (toolDenied)", async () => {
		const cap = makeCap();
		const response = await handleMcpRequest({
			body: {
				jsonrpc: "2.0",
				id: 4,
				method: "tools/call",
				params: { name: "search_crm", arguments: { query: "Sara" } },
			},
			caps: [cap],
			ctx: makeCtx(),
			scopes: ["other_tool"], // search_crm not in scopes
		});
		const err = response as Extract<McpRpcResponse, { error: unknown }>;
		expect(err.error?.code).toBe(MCP_ERROR_CODES.toolDenied);
	});

	it("flags isError:true when the capability returns a non-ok status", async () => {
		const cap = makeCap({
			input: z.object({ query: z.string().min(5) }), // forces parse failure
		});
		const response = await handleMcpRequest({
			body: {
				jsonrpc: "2.0",
				id: 5,
				method: "tools/call",
				params: { name: "search_crm", arguments: { query: "x" } },
			},
			caps: [cap],
			ctx: makeCtx(),
			scopes: ["*"],
		});
		const ok = response as Extract<McpRpcResponse, { result: unknown }>;
		const result = ok.result as {
			isError: boolean;
			structuredContent: { status: string; repair?: unknown };
		};
		expect(result.isError).toBe(true);
		expect(result.structuredContent.status).toBe("needs_repair");
	});
});

describe("handleMcpRequest — error frames", () => {
	it("rejects unknown methods with -32601 (methodNotFound)", async () => {
		const response = await handleMcpRequest({
			body: { jsonrpc: "2.0", id: 6, method: "tools/wat" },
			caps: [makeCap()],
			ctx: makeCtx(),
			scopes: ["*"],
		});
		const err = response as Extract<McpRpcResponse, { error: unknown }>;
		expect(err.error?.code).toBe(MCP_ERROR_CODES.methodNotFound);
	});

	it("rejects malformed JSON-RPC frames with -32600 (invalidRequest)", async () => {
		const response = await handleMcpRequest({
			body: { not: "rpc" },
			caps: [makeCap()],
			ctx: makeCtx(),
			scopes: ["*"],
		});
		const err = response as Extract<McpRpcResponse, { error: unknown }>;
		expect(err.error?.code).toBe(MCP_ERROR_CODES.invalidRequest);
	});

	it("rejects tools/call without required params with -32602 (invalidParams)", async () => {
		const response = await handleMcpRequest({
			body: { jsonrpc: "2.0", id: 7, method: "tools/call", params: {} },
			caps: [makeCap()],
			ctx: makeCtx(),
			scopes: ["*"],
		});
		const err = response as Extract<McpRpcResponse, { error: unknown }>;
		expect(err.error?.code).toBe(MCP_ERROR_CODES.invalidParams);
	});
});

describe("makeRpc helpers", () => {
	it("makeRpcResult emits a success frame", () => {
		const r = makeRpcResult(1, { ok: true });
		expect(r).toEqual({ jsonrpc: "2.0", id: 1, result: { ok: true } });
	});
	it("makeRpcError emits an error frame with code + message", () => {
		const r = makeRpcError(1, -32000, "boom", { extra: "info" });
		expect(r).toEqual({
			jsonrpc: "2.0",
			id: 1,
			error: { code: -32000, message: "boom", data: { extra: "info" } },
		});
	});
});
