/**
 * REST projector tests — S16.
 *
 * Locks the wire shape: `POST /ai/rest/<cap>` returns the envelope at 200,
 * non-200s carry a structured `{error, message}`. Same gate / coercion /
 * envelope as chat — proven by the cross-channel parity suite next door.
 */
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { ok } from "../result";
import type { Capability, CapabilityCtx, Principal } from "../types";
import { extractCapabilityName, handleRestRequest, isObjectBody } from "./rest";

// ─── Fixtures ────────────────────────────────────────────────────────────────

function makePrincipal(over: Partial<Principal> = {}): Principal {
	return {
		kind: "member",
		userId: "u1" as unknown as Principal["userId"],
		orgId: "o1" as unknown as Principal["orgId"],
		permissions: [],
		channel: "rest",
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
			whenToCall: "Cross-entity search.",
			goodExample: { query: "Sara" },
		},
		drive: { onSuccess: "narrate matches" },
		input: z.object({ query: z.string().min(1) }),
		run: async () => ok({ headline: "found 1 match" }),
		...over,
	};
}

// ─── extractCapabilityName ─────────────────────────────────────────────────

describe("extractCapabilityName", () => {
	it("returns the last path segment", () => {
		expect(extractCapabilityName("/ai/rest/search_crm")).toBe("search_crm");
		expect(extractCapabilityName("search_crm")).toBe("search_crm");
		expect(extractCapabilityName("/ai/rest/create_lead/")).toBe("create_lead");
	});
	it("returns undefined for empty / invalid paths", () => {
		expect(extractCapabilityName("")).toBeUndefined();
		expect(extractCapabilityName("/")).toBeUndefined();
		expect(extractCapabilityName("/ai/rest/")).toBe("rest"); // last segment
		expect(extractCapabilityName("/ai/rest/INVALID-cap")).toBeUndefined();
	});
});

// ─── isObjectBody ──────────────────────────────────────────────────────────

describe("isObjectBody", () => {
	it("accepts null / undefined / plain objects", () => {
		expect(isObjectBody(null)).toBe(true);
		expect(isObjectBody(undefined)).toBe(true);
		expect(isObjectBody({})).toBe(true);
		expect(isObjectBody({ a: 1 })).toBe(true);
	});
	it("rejects arrays / primitives", () => {
		expect(isObjectBody([])).toBe(false);
		expect(isObjectBody("string")).toBe(false);
		expect(isObjectBody(42)).toBe(false);
		expect(isObjectBody(true)).toBe(false);
	});
});

// ─── handleRestRequest ─────────────────────────────────────────────────────

describe("handleRestRequest — happy path", () => {
	it("executes the capability and returns 200 + envelope", async () => {
		const out = await handleRestRequest({
			path: "/ai/rest/search_crm",
			body: { query: "Sara" },
			caps: [makeCap()],
			ctx: makeCtx(),
			scopes: ["*"],
		});
		expect(out.httpStatus).toBe(200);
		const json = out.json as { status: string; headline: string };
		expect(json.status).toBe("ok");
		expect(json.headline).toBe("found 1 match");
	});

	it("accepts an empty body for caps that take no required args", async () => {
		const cap = makeCap({
			input: z.object({}),
			run: async () => ok({ headline: "ran with no args" }),
		});
		const out = await handleRestRequest({
			path: "/ai/rest/search_crm",
			body: null,
			caps: [cap],
			ctx: makeCtx(),
			scopes: ["*"],
		});
		expect(out.httpStatus).toBe(200);
		const json = out.json as { status: string };
		expect(json.status).toBe("ok");
	});
});

describe("handleRestRequest — error paths", () => {
	it("400 when path has no capability segment", async () => {
		const out = await handleRestRequest({
			path: "/",
			body: { query: "Sara" },
			caps: [makeCap()],
			ctx: makeCtx(),
			scopes: ["*"],
		});
		expect(out.httpStatus).toBe(400);
		const json = out.json as { error: string };
		expect(json.error).toBe("invalid_path");
	});

	it("404 when the capability name is unknown", async () => {
		const out = await handleRestRequest({
			path: "/ai/rest/no_such_tool",
			body: {},
			caps: [makeCap()],
			ctx: makeCtx(),
			scopes: ["*"],
		});
		expect(out.httpStatus).toBe(404);
		const json = out.json as { error: string };
		expect(json.error).toBe("tool_not_found");
	});

	it("400 when the body is not an object", async () => {
		const out = await handleRestRequest({
			path: "/ai/rest/search_crm",
			body: "not an object",
			caps: [makeCap()],
			ctx: makeCtx(),
			scopes: ["*"],
		});
		expect(out.httpStatus).toBe(400);
		const json = out.json as { error: string };
		expect(json.error).toBe("invalid_body");
	});

	it("403 when the token's scopes refuse the cap", async () => {
		const out = await handleRestRequest({
			path: "/ai/rest/search_crm",
			body: { query: "Sara" },
			caps: [makeCap()],
			ctx: makeCtx(),
			scopes: ["other_tool"],
		});
		expect(out.httpStatus).toBe(403);
		const json = out.json as { error: string };
		expect(json.error).toBe("tool_denied");
	});
});

describe("handleRestRequest — envelope passthrough", () => {
	it("a parse failure returns 200 + needs_repair envelope (NOT a 4xx)", async () => {
		const out = await handleRestRequest({
			path: "/ai/rest/search_crm",
			body: { query: 42 }, // schema requires string
			caps: [makeCap()],
			ctx: makeCtx(),
			scopes: ["*"],
		});
		// The wrapper turns the parse failure into `needs_repair`. The
		// HTTP status stays 200 — the structured envelope carries the
		// error so an external agent can self-correct on the next call.
		expect(out.httpStatus).toBe(200);
		const json = out.json as {
			status: string;
			repair?: { field: string };
		};
		expect(json.status).toBe("needs_repair");
		expect(json.repair?.field).toBe("query");
	});

	it("an RBAC denial returns 200 + denied envelope", async () => {
		const cap = makeCap({ permission: "leads.create" });
		const out = await handleRestRequest({
			path: "/ai/rest/search_crm",
			body: { query: "Sara" },
			caps: [cap],
			ctx: makeCtx(), // empty permissions
			scopes: ["*"],
		});
		expect(out.httpStatus).toBe(200);
		const json = out.json as { status: string };
		expect(json.status).toBe("denied");
	});
});
