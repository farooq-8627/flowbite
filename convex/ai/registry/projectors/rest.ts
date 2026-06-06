/**
 * REST projector — S16.
 *
 * Exposes the capability registry as plain HTTP endpoints. The HTTP route
 * in `convex/http.ts` mounts ONE entry point at
 * `POST /ai/rest/<capability>` — the path's last segment names the cap;
 * the JSON body is the args; the response is a JSON-encoded
 * `CapabilityResult` envelope.
 *
 * Design rules:
 *   1. ONE execution path. Same `runCapability` chat + MCP take.
 *   2. The wire format is the envelope verbatim — `{status, headline, …}`.
 *      A 200 means "the wrapper responded"; a non-`ok` status lives in the
 *      body (`status:"denied"`, `status:"needs_step_up"`, …).
 *   3. Transport-level failures map to small HTTP codes:
 *        - `401`  unauthenticated (no token / bad token / revoked)        ← handled in `convex/http.ts`
 *        - `403`  authenticated but token scopes refuse the cap          ← here
 *        - `404`  unknown capability name                                 ← here
 *        - `400`  body is not valid JSON object                           ← here
 *        - `405`  HTTP method other than POST (the route must accept POST only)
 *
 * The projector is pure — `handleRestRequest({path, body, caps, ctx, scopes})`
 * returns `{httpStatus, json}`. The HTTP route turns that into a `Response`.
 *
 * Why not auto-derive a path per cap (`POST /ai/rest/search_crm`)? Because
 * Convex's `httpRouter` is non-parameterised: every path that wants the
 * same handler is registered statically. Mounting ONE endpoint and
 * extracting the cap-name from the URL keeps the route table readable
 * (one row, not 150).
 */

import { resolveRef as defaultResolveRef } from "../resolveRef";
import type { Capability, CapabilityCtx, CapabilityResult } from "../types";
import { type RefResolver, runCapability } from "../wrapper";

// ─── Types ──────────────────────────────────────────────────────────────────

export type HandleRestInput = {
	/** The full request URL pathname (e.g. `/ai/rest/search_crm`). */
	path: string;
	/** Parsed JSON body — `null` is allowed (some `safe`/`reversible` caps take `{}`). */
	body: unknown;
	/** The full capability registry. */
	caps: readonly Capability[];
	/** Already-authenticated CapabilityCtx (principal + token-derived channel). */
	ctx: CapabilityCtx;
	/** Token's scope allow-list. `["*"]` ⇒ every cap the principal has perm for. */
	scopes: readonly string[];
	/** Override the ref resolver in tests. */
	resolveRef?: RefResolver;
};

export type HandleRestOutput = {
	httpStatus: number;
	/** What goes in the response body. Already the JSON-serialisable envelope. */
	json: unknown;
};

// ─── Pure helpers (exported for tests) ──────────────────────────────────────

/**
 * Pull the capability name out of a REST path. The handler accepts both
 * `/ai/rest/<name>` (top-level mount) and `<name>` (when callers prefer
 * to strip the prefix themselves). Returns `undefined` when the path is
 * empty / has trailing-slash-only / contains characters that can't appear
 * in a capability name.
 */
export function extractCapabilityName(path: string): string | undefined {
	const trimmed = path.replace(/\/+$/, "").replace(/^\/+/, "");
	if (trimmed.length === 0) return undefined;
	const last = trimmed.split("/").pop();
	if (!last) return undefined;
	if (!/^[a-z][a-z0-9_]{1,63}$/i.test(last)) return undefined;
	return last;
}

/** Discover whether the body is "JSON-object-shaped" (or null/undefined). */
export function isObjectBody(body: unknown): body is Record<string, unknown> | null | undefined {
	if (body === null || body === undefined) return true;
	if (typeof body !== "object") return false;
	if (Array.isArray(body)) return false;
	return true;
}

// ─── Public API ─────────────────────────────────────────────────────────────

/**
 * Route ONE REST request through the capability wrapper. Always returns
 * a structured `{httpStatus, json}`, never throws. The HTTP route serialises
 * the JSON body and sets the status code.
 */
export async function handleRestRequest(input: HandleRestInput): Promise<HandleRestOutput> {
	const name = extractCapabilityName(input.path);
	if (!name) {
		return {
			httpStatus: 400,
			json: { error: "invalid_path", message: "REST path must end with a capability name." },
		};
	}
	const cap = input.caps.find((c) => c.name === name);
	if (!cap) {
		return {
			httpStatus: 404,
			json: { error: "tool_not_found", message: `Unknown capability: "${name}".` },
		};
	}

	if (!isObjectBody(input.body)) {
		return {
			httpStatus: 400,
			json: {
				error: "invalid_body",
				message: "REST body must be a JSON object (or empty).",
			},
		};
	}

	const wildcard = input.scopes.includes("*");
	if (!wildcard && !input.scopes.includes(cap.name)) {
		return {
			httpStatus: 403,
			json: {
				error: "tool_denied",
				message: `This token's scopes do not allow "${cap.name}".`,
			},
		};
	}

	let envelope: CapabilityResult;
	try {
		envelope = await runCapability(
			cap,
			(input.body ?? {}) as Record<string, unknown>,
			input.ctx,
			input.resolveRef ?? defaultResolveRef,
		);
	} catch (err) {
		// runCapability is contractually never-throws; this catches the
		// runtime-host blowup (e.g. the ctx resolver throws). Surface a
		// structured envelope so the caller still sees a typed error.
		const message = err instanceof Error ? err.message : String(err);
		envelope = {
			status: "business_error",
			headline: `The "${cap.name}" capability failed unexpectedly.`,
			errors: [{ item: cap.name, reason: truncate(message) }],
		};
	}

	return { httpStatus: 200, json: envelope };
}

// ─── Internal — helpers ─────────────────────────────────────────────────────

function truncate(s: string, max = 200): string {
	return s.length > max ? `${s.slice(0, max - 1)}…` : s;
}
