/**
 * normalizeError — turn ANY thrown value into a clean, user-facing message.
 *
 * Why this exists:
 *   Convex surfaces server errors on the client as `Error` instances whose
 *   `.message` looks like:
 *
 *     "[Request ID: abc] Server Error\nUncaught Error: ConvexError:
 *      Something went wrong\n  at handler (../convex/foo.ts:123:45)\n
 *      at runMutation ..."
 *
 *   Showing that to a user is unacceptable — it leaks request ids, file
 *   paths, line numbers, and an "Uncaught" prefix that reads like a crash.
 *
 *   This module strips the noise, extracts the underlying message (or
 *   `error.data.message` for object-payload `ConvexError`s), and maps a
 *   small set of well-known auth/network codes to friendly copy.
 *
 * Usage:
 *   ```ts
 *   import { normalizeError } from "@/lib/normalizeError";
 *
 *   try { await mutate(...); }
 *   catch (err) {
 *     toast.error("Couldn't save", { description: normalizeError(err) });
 *   }
 *   ```
 *
 *   Or pass a fallback when the normalizer can't recover anything:
 *   ```ts
 *   toast.error(normalizeError(err, "Something went wrong"));
 *   ```
 *
 * Design notes:
 *   - Pure function. No side effects, no logging. Logging is the caller's
 *     job (Sentry should already be capturing the original error elsewhere).
 *   - Tolerant of any input shape. Always returns a non-empty string.
 *   - Keep this list of known codes small — drift between server error
 *     constants and a client-side map is expensive. Map only the strings
 *     that genuinely benefit from rewording (auth codes, network).
 */

// ─── Known error codes → human-readable copy ──────────────────────────────────

const KNOWN_ERROR_MAP: Record<string, string> = {
	// Convex Auth / Password provider — the error.message contains these tokens.
	InvalidAccountId: "No account found with that email address.",
	InvalidSecret: "Incorrect password. Please try again.",
	AccountAlreadyExists: "An account with this email already exists. Try signing in instead.",
	OAuthAccountNotLinked: "This email is linked to a different sign-in method.",
	// Generic browser / fetch failures — these reach us when offline.
	"Failed to fetch": "Network error. Check your connection and try again.",
	"Load failed": "Network error. Check your connection and try again.",
	NetworkError: "Network error. Check your connection and try again.",
};

// ─── Stripping rules ──────────────────────────────────────────────────────────

/**
 * Strip Convex transport noise from a raw error message string.
 * Order matters — peel from the outside in.
 */
function stripConvexNoise(raw: string): string {
	let msg = raw;

	// 1. Request id wrapper: "[Request ID: abc123] ..."
	msg = msg.replace(/\[Request ID:\s*[^\]]+\]\s*/gi, "");

	// 2. Generic "Server Error" prefix (Convex prefixes most server-thrown errors).
	msg = msg.replace(/^Server Error\s*/i, "");

	// 3. JS engine "Uncaught" prefix. Different runtimes phrase this slightly
	//    differently — capture the common shapes.
	msg = msg.replace(/^Uncaught\s+(?:ConvexError|Error|TypeError|RangeError):\s*/i, "");
	msg = msg.replace(/^Uncaught\s+\(in promise\)\s*/i, "");

	// 4. ConvexError class label (when not preceded by Uncaught).
	msg = msg.replace(/^ConvexError:\s*/i, "");

	// 5. Stack trace tail — once we hit the first "  at <fn>" frame, drop
	//    everything from there on. Stack frames have file paths and line
	//    numbers which we never want to leak.
	const stackStart = msg.search(/\n\s*at\s+/);
	if (stackStart >= 0) {
		msg = msg.slice(0, stackStart);
	}

	// 6. Trailing whitespace / stray newlines.
	return msg.trim();
}

// ─── Extraction ──────────────────────────────────────────────────────────────

/**
 * Pull a string message out of an unknown thrown value.
 * Handles ConvexError-with-object-data, plain Error, string, and POJOs.
 */
function extractMessage(err: unknown): string | undefined {
	if (err == null) return undefined;
	if (typeof err === "string") return err;

	if (typeof err === "object") {
		const e = err as {
			message?: unknown;
			data?: unknown;
		};

		// `ConvexError({ code, message })` puts the structured payload on
		// `error.data`. Prefer that — it's the cleanest source.
		if (e.data !== undefined && e.data !== null) {
			if (typeof e.data === "string") return e.data;
			if (typeof e.data === "object") {
				const d = e.data as { message?: unknown };
				if (typeof d.message === "string" && d.message.length > 0) return d.message;
			}
		}

		// Standard Error.message fallback.
		if (typeof e.message === "string" && e.message.length > 0) return e.message;
	}

	// Last-resort coercion. Reject the unhelpful `[object Object]` shape —
	// it's worse UX than the fallback.
	try {
		const coerced = String(err);
		if (coerced === "[object Object]" || coerced.length === 0) return undefined;
		return coerced;
	} catch {
		return undefined;
	}
}

// ─── Public API ──────────────────────────────────────────────────────────────

/**
 * Turn an unknown thrown value into a clean, user-facing message.
 *
 * @param err      Anything caught by a try/catch.
 * @param fallback Message to return when nothing useful can be extracted.
 *                 Defaults to "Something went wrong. Please try again."
 */
export function normalizeError(
	err: unknown,
	fallback = "Something went wrong. Please try again.",
): string {
	const raw = extractMessage(err);
	if (!raw) return fallback;

	// Try mapping known codes BEFORE stripping — code names like
	// "InvalidSecret" appear inside the noisy message and we want to catch
	// them while they're still detectable.
	for (const [code, human] of Object.entries(KNOWN_ERROR_MAP)) {
		if (raw.includes(code)) return human;
	}

	const cleaned = stripConvexNoise(raw);
	return cleaned.length > 0 ? cleaned : fallback;
}

/**
 * Like `normalizeError`, but returns `undefined` when the cleaned message
 * is identical (or near-identical) to the title shown above it. Useful for
 * `toast.error(title, { description })` — a description that just repeats
 * the title is noise.
 */
export function normalizeErrorDescription(err: unknown, title?: string): string | undefined {
	const msg = normalizeError(err, "");
	if (!msg) return undefined;
	if (title && msg.toLowerCase() === title.toLowerCase()) return undefined;
	return msg;
}
