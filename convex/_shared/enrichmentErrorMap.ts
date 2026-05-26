/**
 * convex/_shared/enrichmentErrorMap.ts
 *
 * Stage 10 of `/SPRINT-PLAN.md` — enrichment-provider failure
 * recovery (`AI-AUDIT-COMPLETE.md §17` row "Provider returns 401 /
 * 429 / 500 — generic" / `AI-AGENT-CAPABILITY-AUDIT.md §3
 * Enrichment row`).
 *
 * Pre-Stage-10, `quarantined/enrichmentProviders.ts` did:
 *
 *     trace.push({ provider: "web_search", ok: false, error: String(e).slice(0, 300) });
 *
 * The user (and the model) saw the raw HTTP error or library
 * exception text and had no actionable next step. This helper maps
 * common provider failure modes to a stable code + a friendly
 * one-liner + an optional retry hint, which the orchestrator can
 * surface in the result card AND the model can use to decide whether
 * to retry, fall through to the next provider, or stop and ask the
 * user.
 *
 * Pure function. No I/O. Tested in `convex/stage10.test.ts`.
 */

export type EnrichmentProvider =
	| "web_search"
	| "linkedin_lookup"
	| "email_finder"
	| "domain_whois"
	| "unknown";

export type EnrichmentErrorCode =
	| "NOT_CONFIGURED"
	| "AUTH_FAILED"
	| "FORBIDDEN"
	| "RATE_LIMITED"
	| "QUOTA_EXCEEDED"
	| "NOT_FOUND"
	| "BAD_REQUEST"
	| "TIMEOUT"
	| "DNS_ERROR"
	| "NETWORK_ERROR"
	| "PROVIDER_DOWN"
	| "INVALID_RESPONSE"
	| "UNKNOWN";

export interface EnrichmentFriendlyError {
	/** Stable code for the orchestrator to switch on. */
	code: EnrichmentErrorCode;
	/** ≤ 80 chars — appears as the trace row's `error` headline. */
	short: string;
	/** ≤ 200 chars — full sentence the user sees. */
	message: string;
	/**
	 * Whether the orchestrator should retry the SAME provider before
	 * falling through. `true` for transient errors (rate-limit, 5xx,
	 * timeout). `false` for terminal errors (auth, not-found, malformed).
	 */
	retryable: boolean;
	/**
	 * Whether the orchestrator should fall through to the NEXT
	 * provider in the waterfall. `true` for everything except the
	 * cases where retrying the same provider is more useful than
	 * trying a different one (e.g. RATE_LIMITED — give it a moment).
	 *
	 * The orchestrator combines these flags as:
	 *   retryable && !fallThrough → retry same provider
	 *   !retryable && fallThrough → try next provider
	 *   retryable && fallThrough  → try next provider AND retry later
	 */
	fallThrough: boolean;
	/**
	 * Optional plain-English next-action the user (or model) can
	 * take. Pre-fills nicely into a `suggestedNext` chip.
	 */
	hint?: string;
}

// ─── Public API ──────────────────────────────────────────────────────────────

/**
 * Map a provider error onto a stable friendly envelope.
 *
 * Inputs we recognise:
 *   - `Response`-like objects with `status: number`.
 *   - `Error` / `TypeError` with `message` containing recognisable
 *     keywords ("ENOTFOUND", "ECONNRESET", "ETIMEDOUT", "abort").
 *   - `ConvexError` shape with `data.code`.
 *   - Plain strings.
 *
 * The function always returns a value — never throws. Unrecognised
 * inputs map to `code: "UNKNOWN"` with a generic recovery hint.
 */
export function mapEnrichmentError(
	provider: EnrichmentProvider,
	err: unknown,
): EnrichmentFriendlyError {
	// 1. Convex-style envelope wins (most precise).
	const convex = readConvexShape(err);
	if (convex) return decorate(provider, convex);

	// 2. HTTP status (Response-like).
	const status = readHttpStatus(err);
	if (status !== null) return decorate(provider, statusToFriendly(provider, status));

	// 3. Heuristic on the message string.
	const message = readMessage(err);
	const heuristic = heuristicFromMessage(message);
	if (heuristic) return decorate(provider, heuristic);

	// 4. Default fallback.
	return decorate(provider, {
		code: "UNKNOWN",
		short: "Unknown enrichment error",
		message: truncate(message || "Provider failed without a recognisable error.", 200),
		retryable: false,
		fallThrough: true,
	});
}

// ─── Internals ───────────────────────────────────────────────────────────────

interface FriendlyShape {
	code: EnrichmentErrorCode;
	short: string;
	message: string;
	retryable: boolean;
	fallThrough: boolean;
	hint?: string;
}

function decorate(provider: EnrichmentProvider, base: FriendlyShape): EnrichmentFriendlyError {
	// Append a provider-specific hint when one isn't already attached.
	if (base.hint) return base;
	return { ...base, hint: defaultHintFor(provider, base.code) };
}

function readConvexShape(err: unknown): FriendlyShape | null {
	if (typeof err !== "object" || err === null) return null;
	const data = (err as { data?: unknown }).data;
	if (typeof data !== "object" || data === null) return null;
	const code = (data as { code?: unknown }).code;
	if (typeof code !== "string") return null;
	switch (code) {
		case "PROVIDER_NOT_CONFIGURED":
			return {
				code: "NOT_CONFIGURED",
				short: "Provider not configured",
				message: "This enrichment provider is not enabled on the workspace yet.",
				retryable: false,
				fallThrough: true,
			};
		case "AUTH_FAILED":
		case "INVALID_API_KEY":
			return {
				code: "AUTH_FAILED",
				short: "Authentication failed",
				message: "The provider's API key was rejected. Update or rotate the key.",
				retryable: false,
				fallThrough: true,
			};
		default:
			return null;
	}
}

function readHttpStatus(err: unknown): number | null {
	if (typeof err !== "object" || err === null) return null;
	const direct = (err as { status?: unknown }).status;
	if (typeof direct === "number") return direct;
	const response = (err as { response?: { status?: unknown } }).response;
	if (response && typeof response.status === "number") return response.status;
	return null;
}

function readMessage(err: unknown): string {
	if (typeof err === "string") return err;
	if (typeof err === "object" && err !== null) {
		const direct = (err as { message?: unknown }).message;
		if (typeof direct === "string") return direct;
	}
	try {
		return String(err);
	} catch {
		return "";
	}
}

function statusToFriendly(provider: EnrichmentProvider, status: number): FriendlyShape {
	if (status === 401)
		return {
			code: "AUTH_FAILED",
			short: "401 Unauthorized",
			message: "The provider rejected the API key. Rotate the key in Settings → AI.",
			retryable: false,
			fallThrough: true,
		};
	if (status === 403)
		return {
			code: "FORBIDDEN",
			short: "403 Forbidden",
			message:
				"The provider key is valid but has no permission for this lookup. Upgrade the plan or use a different key.",
			retryable: false,
			fallThrough: true,
		};
	if (status === 404)
		return {
			code: "NOT_FOUND",
			short: "404 Not found",
			message: "The provider returned no record for this query.",
			retryable: false,
			fallThrough: true,
		};
	if (status === 429)
		return {
			code: "RATE_LIMITED",
			short: "429 Rate limited",
			message: "The provider's rate limit was hit. Try again in a few seconds.",
			retryable: true,
			fallThrough: false,
		};
	if (status === 402)
		return {
			code: "QUOTA_EXCEEDED",
			short: "402 Quota exceeded",
			message: `The ${provider} plan's monthly enrichment quota is used up. Top up the plan to continue.`,
			retryable: false,
			fallThrough: true,
		};
	if (status === 408 || status === 504)
		return {
			code: "TIMEOUT",
			short: `${status} Timeout`,
			message:
				"The provider took too long to respond. Retry or fall through to the next provider.",
			retryable: true,
			fallThrough: true,
		};
	if (status === 400 || status === 422)
		return {
			code: "BAD_REQUEST",
			short: `${status} Bad request`,
			message:
				"The provider rejected the query shape. Check the seed fields (name / company / domain).",
			retryable: false,
			fallThrough: true,
		};
	if (status >= 500)
		return {
			code: "PROVIDER_DOWN",
			short: `${status} Provider down`,
			message: "The provider is having issues. Falling through to the next provider.",
			retryable: true,
			fallThrough: true,
		};
	return {
		code: "UNKNOWN",
		short: `${status} unknown`,
		message: `Provider returned an unexpected status code ${status}.`,
		retryable: false,
		fallThrough: true,
	};
}

function heuristicFromMessage(message: string): FriendlyShape | null {
	const lc = message.toLowerCase();
	if (
		lc.includes("enotfound") ||
		lc.includes("dns") ||
		lc.includes("getaddrinfo") ||
		lc.includes("eai_again")
	) {
		return {
			code: "DNS_ERROR",
			short: "DNS lookup failed",
			message:
				"Could not resolve the provider's hostname. Check the workspace's outbound DNS.",
			retryable: true,
			fallThrough: true,
		};
	}
	if (lc.includes("econnreset") || lc.includes("econnrefused") || lc.includes("network")) {
		return {
			code: "NETWORK_ERROR",
			short: "Network error",
			message: "The connection to the provider was reset. Retry shortly or fall through.",
			retryable: true,
			fallThrough: true,
		};
	}
	if (lc.includes("etimedout") || lc.includes("timeout") || lc.includes("aborted")) {
		return {
			code: "TIMEOUT",
			short: "Request timed out",
			message: "The provider did not respond in time.",
			retryable: true,
			fallThrough: true,
		};
	}
	if (lc.includes("invalid api key") || lc.includes("unauthorized")) {
		return {
			code: "AUTH_FAILED",
			short: "Authentication failed",
			message: "The provider rejected the API key. Rotate the key in Settings → AI.",
			retryable: false,
			fallThrough: true,
		};
	}
	if (lc.includes("rate limit") || lc.includes("too many requests")) {
		return {
			code: "RATE_LIMITED",
			short: "Rate limited",
			message: "The provider's rate limit was hit. Try again in a few seconds.",
			retryable: true,
			fallThrough: false,
		};
	}
	if (lc.includes("not configured") || lc.includes("no api key") || lc.includes("missing key")) {
		return {
			code: "NOT_CONFIGURED",
			short: "Provider not configured",
			message: "This enrichment provider is not enabled on the workspace yet.",
			retryable: false,
			fallThrough: true,
		};
	}
	if (lc.includes("invalid response") || lc.includes("unexpected token")) {
		return {
			code: "INVALID_RESPONSE",
			short: "Invalid response",
			message: "The provider returned a response we couldn't parse. Falling through.",
			retryable: false,
			fallThrough: true,
		};
	}
	return null;
}

function defaultHintFor(provider: EnrichmentProvider, code: EnrichmentErrorCode): string {
	switch (code) {
		case "NOT_CONFIGURED":
			if (provider === "web_search") return "Set FIRECRAWL_API_KEY in Convex env to enable.";
			if (provider === "linkedin_lookup")
				return "Linkedin lookup ships in Phase 4 — see Future-Enhancements.md §B.14.";
			if (provider === "email_finder")
				return "Email-finder ships in Phase 4 — see Future-Enhancements.md §B.15.";
			return "Enable the provider in Settings → AI.";
		case "AUTH_FAILED":
			return "Rotate the provider's API key in Settings → AI.";
		case "FORBIDDEN":
			return "The provider key works but lacks permission. Check the plan tier.";
		case "RATE_LIMITED":
			return "Wait a few seconds and retry, or fall through to the next provider.";
		case "QUOTA_EXCEEDED":
			return "Top up the provider plan or wait for the quota window to reset.";
		case "NOT_FOUND":
			return "No record matched. Try a different seed (e.g. add the company domain).";
		case "BAD_REQUEST":
			return "Adjust the seed fields and retry.";
		case "TIMEOUT":
			return "Retry shortly. If it persists, fall through to the next provider.";
		case "DNS_ERROR":
		case "NETWORK_ERROR":
			return "Check outbound networking; the provider hostname is not reachable.";
		case "PROVIDER_DOWN":
			return "Provider is having issues. Falling through to the next one.";
		case "INVALID_RESPONSE":
			return "The provider returned a response we couldn't parse. Falling through.";
		default:
			return "Falling through to the next provider.";
	}
}

function truncate(s: string, n: number): string {
	if (s.length <= n) return s;
	return `${s.slice(0, Math.max(0, n - 1))}…`;
}
