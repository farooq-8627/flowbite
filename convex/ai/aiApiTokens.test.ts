/**
 * convex/ai/aiApiTokens.test.ts — S16.
 *
 * Pure-helper tests for the API-token surface. The mutations + actions
 * themselves are exercised by `crossChannelParity.test.ts` via the http
 * route smoke flow; this file locks the parsing / hashing / scope
 * contract that the rest of the projector depends on.
 */
import { describe, expect, it } from "vitest";
import {
	buildTokenPlaintext,
	hashTokenPlaintext,
	normaliseScopes,
	orgPrefixFromSlug,
	parseAuthorizationHeader,
	randomTokenHex,
	resolveChannel,
	tokenPrefixForDisplay,
	tokenScopeAllows,
} from "./aiApiTokens";

describe("parseAuthorizationHeader", () => {
	it("strips Bearer / Token prefix (case-insensitive)", () => {
		expect(parseAuthorizationHeader("Bearer abc.def")).toBe("abc.def");
		expect(parseAuthorizationHeader("bearer abc.def")).toBe("abc.def");
		expect(parseAuthorizationHeader("Token xyz")).toBe("xyz");
		expect(parseAuthorizationHeader("  Bearer   xyz  ")).toBe("xyz");
	});
	it("accepts a bare token value", () => {
		expect(parseAuthorizationHeader("ot_acme_abc")).toBe("ot_acme_abc");
	});
	it("returns undefined for empty / missing headers", () => {
		expect(parseAuthorizationHeader(undefined)).toBeUndefined();
		expect(parseAuthorizationHeader(null)).toBeUndefined();
		expect(parseAuthorizationHeader("")).toBeUndefined();
		expect(parseAuthorizationHeader("   ")).toBeUndefined();
	});
});

describe("orgPrefixFromSlug", () => {
	it("lowercases + strips non-alnum + caps to 6 chars", () => {
		expect(orgPrefixFromSlug("Acme-Corp")).toBe("acmeco");
		expect(orgPrefixFromSlug("My Company 123")).toBe("mycomp");
		expect(orgPrefixFromSlug("WEBSTOR")).toBe("webstor".slice(0, 6));
	});
	it("pads short slugs with `x` to fill 6 chars", () => {
		expect(orgPrefixFromSlug("ab")).toBe("abxxxx");
		expect(orgPrefixFromSlug("")).toBe("xxxxxx");
	});
});

describe("buildTokenPlaintext + tokenPrefixForDisplay", () => {
	it("builds the documented `ot_<orgPrefix>_<random>` shape", () => {
		const plaintext = buildTokenPlaintext("acmeco", "deadbeefdeadbeefdeadbeefdeadbeef");
		expect(plaintext).toBe("ot_acmeco_deadbeefdeadbeefdeadbeefdeadbeef");
		expect(plaintext.startsWith("ot_")).toBe(true);
		// The 12-char display prefix lets the UI uniquely identify a token.
		expect(tokenPrefixForDisplay(plaintext)).toBe("ot_acmeco_de");
	});
});

describe("randomTokenHex", () => {
	it("returns 32 lowercase hex chars and is non-deterministic", () => {
		const a = randomTokenHex();
		const b = randomTokenHex();
		expect(a).toMatch(/^[0-9a-f]{32}$/);
		expect(b).toMatch(/^[0-9a-f]{32}$/);
		expect(a).not.toBe(b);
	});
});

describe("hashTokenPlaintext", () => {
	it("returns SHA-256 hex (64 chars) and is deterministic", async () => {
		const a = await hashTokenPlaintext("ot_acmeco_deadbeef");
		const b = await hashTokenPlaintext("ot_acmeco_deadbeef");
		expect(a).toBe(b);
		expect(a).toMatch(/^[0-9a-f]{64}$/);
	});
	it("different plaintexts hash to different digests", async () => {
		const a = await hashTokenPlaintext("plaintext-one");
		const b = await hashTokenPlaintext("plaintext-two");
		expect(a).not.toBe(b);
	});
});

describe("normaliseScopes", () => {
	it("collapses empty input to ['*']", () => {
		expect(normaliseScopes(undefined)).toEqual(["*"]);
		expect(normaliseScopes([])).toEqual(["*"]);
		expect(normaliseScopes(["", "   "])).toEqual(["*"]);
	});
	it("dedupes + trims valid scope names", () => {
		expect(normaliseScopes(["search_crm", " search_crm ", "create_lead"])).toEqual([
			"search_crm",
			"create_lead",
		]);
	});
	it("accepts the wildcard alongside other scopes", () => {
		expect(normaliseScopes(["*", "search_crm"])).toEqual(["*", "search_crm"]);
	});
	it("throws on invalid scope names", () => {
		expect(() => normaliseScopes(["BAD-NAME"])).toThrow();
		expect(() => normaliseScopes(["1leading_digit"])).toThrow();
	});
});

describe("resolveChannel", () => {
	it("only accepts mcp / rest, defaults to rest", () => {
		expect(resolveChannel("mcp")).toBe("mcp");
		expect(resolveChannel("rest")).toBe("rest");
		expect(resolveChannel("chat")).toBe("rest");
		expect(resolveChannel(null)).toBe("rest");
		expect(resolveChannel(undefined)).toBe("rest");
	});
});

describe("tokenScopeAllows", () => {
	it("wildcard allows every cap", () => {
		expect(tokenScopeAllows(["*"], "create_lead")).toBe(true);
		expect(tokenScopeAllows(["*", "noise"], "anything")).toBe(true);
	});
	it("explicit allow-list", () => {
		expect(tokenScopeAllows(["search_crm"], "search_crm")).toBe(true);
		expect(tokenScopeAllows(["search_crm"], "create_lead")).toBe(false);
	});
	it("empty scopes blocks everything (defensive)", () => {
		expect(tokenScopeAllows([], "search_crm")).toBe(false);
	});
});
