/**
 * Sentry — server (Node.js runtime) config.
 *
 * Reads from env. No-ops if SENTRY_DSN is unset.
 *
 * OWNER-PANEL EXCLUSION (Stage 3 — 2026-05-27):
 *   Server-side errors thrown inside owner-panel handlers are excluded from
 *   Sentry. The `beforeSend` callback inspects `event.request.url` and drops
 *   events for paths matching `/xowner` (the internal route tree the
 *   middleware rewrites the public slug to).
 *
 * NOISE FILTERS (2026-05-30):
 *   - Drop Next.js navigation signals (`NEXT_REDIRECT`, `NEXT_NOT_FOUND`,
 *     `NEXT_HTTP_ERROR_FALLBACK;*`). These are intentional control-flow
 *     throws that the framework converts into HTTP responses; they land
 *     in `onRequestError` as if they were real crashes.
 *   - Drop expected ConvexError variants that surface known business
 *     conditions (rate limits, auth-required, validation failures) — they
 *     belong in product analytics, not error tracking.
 *
 * Required envs (production):
 *   - SENTRY_DSN  (server-side; can be the same value as NEXT_PUBLIC_SENTRY_DSN)
 * Optional:
 *   - SENTRY_ENVIRONMENT
 *   - SENTRY_TRACES_SAMPLE_RATE
 */
import * as Sentry from "@sentry/nextjs";

const dsn = process.env.SENTRY_DSN ?? process.env.NEXT_PUBLIC_SENTRY_DSN;
const environment = process.env.SENTRY_ENVIRONMENT ?? process.env.NODE_ENV;
const isProd = environment === "production";

function isOwnerPanelUrl(url: string | undefined): boolean {
	if (!url) return false;
	try {
		const path = new URL(url, "http://localhost").pathname;
		return path === "/xowner" || path.startsWith("/xowner/");
	} catch {
		return false;
	}
}

/**
 * Server-side ignore list — these strings + regexes match against
 * `event.exception.values[0].value` (the error message) AND error
 * `name`. Same intent as the client list: drop noise that we already
 * handle (or that we explicitly classify as expected behaviour) so
 * the Sentry quota is reserved for real bugs.
 */
const IGNORE_ERRORS: Array<string | RegExp> = [
	// Next.js intentional throws — these are NOT errors. They're how
	// Next implements navigation. They reach onRequestError because
	// the framework re-throws them after the client commits.
	"NEXT_REDIRECT",
	"NEXT_NOT_FOUND",
	"NEXT_PERMANENT_REDIRECT",
	/NEXT_HTTP_ERROR_FALLBACK/,
	// Convex rate limits + business validation errors are expected
	// states (the user typed a duplicate slug, hit a quota, etc.) —
	// surfaced via toast in the UI, not real bugs to triage.
	"RATE_LIMITED",
	"FORBIDDEN",
	"INVITATION_NOT_FOUND",
	"INVITATION_EXPIRED",
	"INVITATION_ALREADY_USED",
	"INVITATION_EMAIL_MISMATCH",
	// Expected aborts during navigation
	"AbortError",
	"AbortController",
];

if (dsn) {
	Sentry.init({
		dsn,
		environment,
		tracesSampleRate: Number(process.env.SENTRY_TRACES_SAMPLE_RATE ?? (isProd ? 0.1 : 1)),
		sendDefaultPii: !isProd || process.env.SENTRY_SEND_PII === "true",
		ignoreErrors: IGNORE_ERRORS,
		beforeSend: (event, hint) => {
			if (isOwnerPanelUrl(event.request?.url)) return null;
			// Last-line defence: drop events whose `originalException` is
			// a Next.js navigation signal. Matches the client config —
			// keep the two sides in sync if you change either.
			const err = hint?.originalException;
			if (err && typeof err === "object" && "digest" in err) {
				const digest = String((err as { digest?: unknown }).digest ?? "");
				if (
					digest === "NEXT_REDIRECT" ||
					digest === "NEXT_NOT_FOUND" ||
					digest.startsWith("NEXT_HTTP_ERROR_FALLBACK")
				) {
					return null;
				}
			}
			return event;
		},
		beforeSendTransaction: (event) => {
			if (isOwnerPanelUrl(event.request?.url)) return null;
			return event;
		},
	});
}
