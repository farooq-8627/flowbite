/**
 * MCP projector — S16.
 *
 * Projects the capability registry into a Model Context Protocol surface
 * (https://modelcontextprotocol.io). Compatible with the JSON-RPC 2.0 frame
 * MCP clients use over `streamableHttp`/`stdio`. The HTTP route in
 * `convex/http.ts` ($DEPLOYMENT/ai/mcp) accepts a single JSON-RPC request
 * per POST and returns the response — the transport is HTTP request/reply,
 * the wire format is JSON-RPC.
 *
 * Supported methods:
 *   - `initialize`            — handshake; advertise our `tools` capability.
 *   - `tools/list`            — list every capability the principal can run
 *                                given (a) RBAC + (b) channel + (c) token
 *                                scopes. Result rows match the MCP `tool`
 *                                shape: `{ name, description, inputSchema }`.
 *   - `tools/call`            — execute a capability. Routes through
 *                                `runCapability` (the SAME path chat takes)
 *                                so the gate / coercion / envelope is
 *                                identical across channels — proven by
 *                                `crossChannelParity.test.ts`.
 *
 * Errors:
 *   - JSON-RPC `-32601 Method not found`     — unsupported method.
 *   - JSON-RPC `-32602 Invalid params`       — missing/wrong params.
 *   - JSON-RPC `-32000 Tool not found`       — unknown capability name.
 *   - JSON-RPC `-32001 Tool denied`          — token scope rejects the cap.
 * The capability's own outcome (`denied` / `needs_step_up` / etc.) is
 * carried in the `result` field — a Convex transport error never leaks.
 *
 * NOTE on "permissive input schema" (PART 1 §1.5): we hand the MCP client
 * a permissive JSON-Schema for every tool — the strict parse runs INSIDE
 * `runCapability` so a bad arg becomes a `repair` envelope the model can
 * self-correct from, rather than a transport-level rejection that bypasses
 * our formatter. Same strategy as `projectors/aiSdk.ts`.
 */

import { z } from "zod";
import { canRun, channelAllows } from "../gate";
import { resolveRef as defaultResolveRef } from "../resolveRef";
import type { Capability, CapabilityCtx, CapabilityResult, Channel } from "../types";
import { type RefResolver, runCapability } from "../wrapper";

// ─── Constants ──────────────────────────────────────────────────────────────

/**
 * Protocol version we announce on `initialize`. Pinned to a known-good
 * date-string per the MCP spec; clients compare against their own list.
 */
const MCP_PROTOCOL_VERSION = "2025-06-18";

/** JSON-RPC error codes used by this projector. */
export const MCP_ERROR_CODES = {
	parse: -32700,
	invalidRequest: -32600,
	methodNotFound: -32601,
	invalidParams: -32602,
	internal: -32603,
	toolNotFound: -32000,
	toolDenied: -32001,
} as const;

// ─── Types ──────────────────────────────────────────────────────────────────

/** JSON-RPC request frame — narrow shape we accept on the wire. */
export type McpRpcRequest = {
	jsonrpc: "2.0";
	id?: string | number | null;
	method: string;
	params?: unknown;
};

/** JSON-RPC response frame — narrowed for our two methods + initialize. */
export type McpRpcResponse =
	| {
			jsonrpc: "2.0";
			id: string | number | null;
			result: unknown;
	  }
	| {
			jsonrpc: "2.0";
			id: string | number | null;
			error: { code: number; message: string; data?: unknown };
	  };

/** Result shape for `tools/list`. Matches the MCP `tool` definition. */
export type McpToolDescriptor = {
	name: string;
	title: string;
	description: string;
	inputSchema: {
		type: "object";
		properties: Record<string, unknown>;
		required?: string[];
		additionalProperties: true;
	};
	annotations?: {
		readOnlyHint: boolean;
		destructiveHint: boolean;
		idempotentHint: boolean;
		openWorldHint: boolean;
	};
};

/** What the HTTP route hands us to dispatch one request. */
export type HandleMcpInput = {
	body: unknown;
	caps: readonly Capability[];
	ctx: CapabilityCtx;
	scopes: readonly string[];
	resolveRef?: RefResolver;
};

// ─── Pure helpers (exported for tests) ──────────────────────────────────────

/**
 * Project one capability into the MCP `tool` descriptor shape. The
 * description bakes in the full spec (good/bad examples, when-to-call) so
 * an external agent reading `tools/list` sees the same guidance the AI
 * SDK projector exposes — the MCP transport doesn't have a separate
 * "system prompt" surface.
 */
export function describeCapabilityForMCP(cap: Capability): McpToolDescriptor {
	return {
		name: cap.name,
		title: cap.name.replace(/_/g, " "),
		description: buildDescription(cap),
		inputSchema: {
			type: "object",
			properties: extractInputProperties(cap),
			additionalProperties: true,
		},
		annotations: {
			// MCP clients use these to decorate the tool list — destructive
			// ops get a red badge, read-only get a green one.
			readOnlyHint: cap.risk === "safe" && isReadOnlyVerb(cap.name),
			destructiveHint: cap.risk === "irreversible",
			idempotentHint: cap.risk === "safe" || cap.risk === "reversible",
			openWorldHint: false,
		},
	};
}

/** Build the MCP `description` string. Mirrors aiSdk.buildDescription. */
export function buildDescription(cap: Capability): string {
	const lines: string[] = [];
	lines.push(cap.spec.whenToCall.trim());
	if (cap.spec.whenNotToCall) {
		lines.push("", `Do NOT call when: ${cap.spec.whenNotToCall.trim()}`);
	}
	if (cap.spec.requiredClarifications && cap.spec.requiredClarifications.length > 0) {
		lines.push(
			"",
			`Required arguments: ${cap.spec.requiredClarifications.map((s) => `\`${s}\``).join(", ")}.`,
		);
	}
	lines.push(
		"",
		"Good example arguments:",
		"```json",
		JSON.stringify(cap.spec.goodExample, null, 2),
		"```",
	);
	if (cap.spec.badExample) {
		lines.push(
			"",
			"Anti-example (do NOT do this):",
			"```json",
			JSON.stringify(cap.spec.badExample.args, null, 2),
			"```",
			`Why bad: ${cap.spec.badExample.why}`,
		);
	}
	return lines.join("\n");
}

/**
 * Filter the registry by the principal's RBAC + channel + the token's
 * scope list. Pure — no DB calls. The scope list is consulted last so a
 * narrowly-scoped token shows fewer tools than a `*` token even when
 * the underlying principal has every permission.
 */
export function listCapabilitiesForPrincipal(
	caps: readonly Capability[],
	ctx: CapabilityCtx,
	scopes: readonly string[],
	channel: Channel,
): Capability[] {
	const wildcard = scopes.includes("*");
	return caps.filter((cap) => {
		if (!canRun(ctx.principal, cap)) return false;
		if (!channelAllows(channel, cap)) return false;
		if (!wildcard && !scopes.includes(cap.name)) return false;
		return true;
	});
}

/**
 * Build a JSON-RPC error frame. Exported so the HTTP route can build
 * transport-level errors without depending on internal symbols.
 */
export function makeRpcError(
	id: string | number | null,
	code: number,
	message: string,
	data?: unknown,
): McpRpcResponse {
	return {
		jsonrpc: "2.0",
		id,
		error: { code, message, ...(data !== undefined ? { data } : {}) },
	};
}

/** Build a JSON-RPC success frame. */
export function makeRpcResult(id: string | number | null, result: unknown): McpRpcResponse {
	return { jsonrpc: "2.0", id, result };
}

// ─── Public API ─────────────────────────────────────────────────────────────

/**
 * Single-shot dispatcher. Reads ONE JSON-RPC request, routes it, and
 * returns ONE JSON-RPC response. The HTTP route serialises the result
 * back to the client — never throws (every error becomes a JSON-RPC frame).
 */
export async function handleMcpRequest(input: HandleMcpInput): Promise<McpRpcResponse> {
	const parsed = parseRpc(input.body);
	if (parsed.kind === "error") return parsed.response;
	const { request } = parsed;
	const id = request.id ?? null;

	switch (request.method) {
		case "initialize":
			return makeRpcResult(id, {
				protocolVersion: MCP_PROTOCOL_VERSION,
				capabilities: { tools: { listChanged: false } },
				serverInfo: { name: "orbitly-ai", version: "1.0.0" },
			});

		case "tools/list": {
			const tools = listCapabilitiesForPrincipal(
				input.caps,
				input.ctx,
				input.scopes,
				input.ctx.principal.channel,
			).map(describeCapabilityForMCP);
			return makeRpcResult(id, { tools });
		}

		case "tools/call":
			return await dispatchToolsCall(id, request.params, input);

		default:
			return makeRpcError(
				id,
				MCP_ERROR_CODES.methodNotFound,
				`Method "${request.method}" is not supported.`,
			);
	}
}

// ─── Internal — JSON-RPC parsing ────────────────────────────────────────────

const rpcRequestSchema = z
	.object({
		jsonrpc: z.literal("2.0"),
		id: z.union([z.string(), z.number(), z.null()]).optional(),
		method: z.string().min(1),
		params: z.unknown().optional(),
	})
	.passthrough();

type ParsedRpc =
	| { kind: "ok"; request: McpRpcRequest }
	| { kind: "error"; response: McpRpcResponse };

function parseRpc(body: unknown): ParsedRpc {
	const parse = rpcRequestSchema.safeParse(body);
	if (!parse.success) {
		const idCandidate =
			body && typeof body === "object" && "id" in (body as Record<string, unknown>)
				? ((body as Record<string, unknown>).id as string | number | null | undefined)
				: undefined;
		return {
			kind: "error",
			response: makeRpcError(
				idCandidate ?? null,
				MCP_ERROR_CODES.invalidRequest,
				"Invalid JSON-RPC request.",
				parse.error.issues.map((i) => i.message).slice(0, 3),
			),
		};
	}
	return { kind: "ok", request: parse.data as McpRpcRequest };
}

// ─── Internal — tools/call dispatch ────────────────────────────────────────

const toolsCallParamsSchema = z.object({
	name: z.string().min(1),
	arguments: z.unknown().optional(),
});

async function dispatchToolsCall(
	id: string | number | null,
	rawParams: unknown,
	input: HandleMcpInput,
): Promise<McpRpcResponse> {
	const parse = toolsCallParamsSchema.safeParse(rawParams);
	if (!parse.success) {
		return makeRpcError(
			id,
			MCP_ERROR_CODES.invalidParams,
			"`tools/call` requires `{ name: string, arguments?: object }`.",
		);
	}
	const { name, arguments: args } = parse.data;
	const cap = input.caps.find((c) => c.name === name);
	if (!cap) {
		return makeRpcError(id, MCP_ERROR_CODES.toolNotFound, `Unknown tool: "${name}".`);
	}

	const wildcard = input.scopes.includes("*");
	if (!wildcard && !input.scopes.includes(cap.name)) {
		return makeRpcError(
			id,
			MCP_ERROR_CODES.toolDenied,
			`This token's scopes do not allow "${cap.name}".`,
		);
	}

	let envelope: CapabilityResult;
	try {
		envelope = await runCapability(
			cap,
			args ?? {},
			input.ctx,
			input.resolveRef ?? defaultResolveRef,
		);
	} catch (err) {
		// runCapability is contractually never-throws; fall through to a
		// transport-level error if the wrapper itself blows up.
		const message = err instanceof Error ? err.message : String(err);
		return makeRpcError(id, MCP_ERROR_CODES.internal, truncate(message));
	}

	// Translate the CapabilityResult to MCP's `tools/call` response shape.
	// `isError` flags non-ok outcomes so MCP-aware clients can highlight
	// them; the structured envelope is carried verbatim under `structured`.
	const mcpStatuses: ReadonlySet<CapabilityResult["status"]> = new Set(["ok", "partial"]);
	return makeRpcResult(id, {
		isError: !mcpStatuses.has(envelope.status),
		content: [{ type: "text", text: envelope.headline ?? envelope.status }],
		structuredContent: envelope,
	});
}

// ─── Internal — helpers ─────────────────────────────────────────────────────

function isReadOnlyVerb(name: string): boolean {
	return (
		name.startsWith("search_") ||
		name.startsWith("list_") ||
		name.startsWith("get_") ||
		name.startsWith("describe_") ||
		name.startsWith("read_") ||
		name === "discover_capabilities"
	);
}

/**
 * Best-effort introspection of the capability's strict input schema. We
 * project each top-level field as a permissive `additionalProperties:true`
 * object — same strategy as the AI SDK projector. The MCP client uses
 * this to surface a hint to the user; the strict parse still happens
 * inside `runCapability`.
 */
function extractInputProperties(cap: Capability): Record<string, unknown> {
	if (!(cap.input instanceof z.ZodObject)) return {};
	const shape = cap.input.shape as Record<string, z.ZodType>;
	const out: Record<string, unknown> = {};
	for (const name of Object.keys(shape)) {
		out[name] = { description: `See "${cap.name}" example arguments.` };
	}
	return out;
}

function truncate(s: string, max = 200): string {
	return s.length > max ? `${s.slice(0, max - 1)}…` : s;
}
