/**
 * Sentry — browser config.
 *
 * DSN, environment, and traces sample rate are read from env vars. If
 * `NEXT_PUBLIC_SENTRY_DSN` is unset (e.g. local dev without Sentry), Sentry
 * no-ops gracefully — no errors are shipped, no console noise.
 *
 * OWNER-PANEL EXCLUSION (Stage 3 — 2026-05-27):
 *   Owner-panel pages are excluded from Sentry. The middleware sets a non-
 *   secret cookie `is_owner_panel=1` on every owner-panel rewrite. The
 *   `beforeSend` callback inspects `document.cookie` and returns `null`
 *   (drop the event) when the cookie is present. This keeps the public
 *   slug out of the JS bundle (locked decision §9.3).
 *
 * NOISE FILTERS (2026-05-30):
 *   - `ignoreErrors`: drops noise that Sentry's official Next.js + JS
 *     guides recommend filtering (browser-extension errors,
 *     `ResizeObserver loop limit exceeded`, hydration mismatches that
 *     are usually transient + non-actionable, network-aborted fetches
 *     during navigation, third-party iframe / embed scripts).
 *   - `denyUrls`: drops events whose top stack frame is from a
 *     well-known third-party origin we can't fix (browser extensions,
 *     ad-blockers, analytics tools that silently get rewritten by
 *     hosts we don't control).
 *
 *   Both lists follow Sentry's own docs:
 *   https://docs.sentry.io/platforms/javascript/guides/nextjs/configuration/filtering/
 *   https://docs.sentry.io/platforms/javascript/guides/nextjs/configuration/options/#ignoreerrors
 *
 * SESSION REPLAY (2026-05-30):
 *   Replay is opt-in via env. When `NEXT_PUBLIC_SENTRY_REPLAY_ON_ERROR_SAMPLE_RATE`
 *   is set to a value > 0 (default `1.0`), every error event also captures
 *   the preceding ~30 seconds of UI as a replayable video. Normal-session
 *   sampling is set to 0 by default so we don't burn replay quota on
 *   sessions that never error. Text + media are masked by default for
 *   privacy — this matches Sentry's recommended secure-by-default config.
 *
 * Required envs (production):
 *   - NEXT_PUBLIC_SENTRY_DSN
 * Optional:
 *   - NEXT_PUBLIC_SENTRY_ENVIRONMENT (defaults to NODE_ENV)
 *   - NEXT_PUBLIC_SENTRY_TRACES_SAMPLE_RATE (defaults to 0.1 in prod, 1 in dev)
 *   - NEXT_PUBLIC_SENTRY_REPLAY_SESSION_SAMPLE_RATE (default 0)
 *   - NEXT_PUBLIC_SENTRY_REPLAY_ON_ERROR_SAMPLE_RATE (default 1.0 in prod, 0 in dev)
 *
 * Source: https://docs.sentry.io/platforms/javascript/guides/nextjs/
 */
import * as Sentry from "@sentry/nextjs";

const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;
const environment = process.env.NEXT_PUBLIC_SENTRY_ENVIRONMENT ?? process.env.NODE_ENV;
const isProd = environment === "production";

const OWNER_PANEL_COOKIE = "is_owner_panel";

function isOwnerPanelClient(): boolean {
	if (typeof document === "undefined") return false;
	const match = document.cookie.match(new RegExp(`(?:^|;\\s*)${OWNER_PANEL_COOKIE}=([^;]+)`));
	return match?.[1] === "1";
}

/**
 * Browser-noise filter. Each entry is matched against `event.exception`'s
 * top error message + the breadcrumb chain. Entries can be a substring
 * (case-insensitive in Sentry's matcher) or a regex.
 *
 * What's in here and why:
 *   - "ResizeObserver loop limit exceeded" / "ResizeObserver loop completed with undelivered notifications" —
 *     a benign Chrome diagnostic that fires when a layout pass takes >1
 *     frame; not a real error.
 *   - "Non-Error promise rejection captured" — third-party libraries
 *     reject with non-Error objects; nothing the user can do.
 *   - "AbortError: The operation was aborted" /
 *     "AbortError: The user aborted a request" — fetch aborts during
 *     navigation; expected behaviour, not a bug.
 *   - "NetworkError when attempting to fetch resource" /
 *     "Failed to fetch" — flaky networks; we already retry the queries
 *     that matter.
 *   - "Hydration failed" / "Text content does not match server-rendered HTML" —
 *     usually transient (browser extensions injecting markup, mismatched
 *     locale at first paint). Real hydration bugs surface separately as
 *     React errors with stack traces.
 *   - "Loading chunk N failed" — code-split chunks fail to load when a
 *     deploy happens mid-session; the next nav reloads the bundle.
 *   - "Script error." — cross-origin scripts whose stack we can't read;
 *     typically from extensions or ad-blockers.
 *   - "ChunkLoadError" — same root cause as "Loading chunk N failed".
 *   - PostHog Toolbar errors that fire when the toolbar itself is broken.
 *   - "Cannot redefine property: googletag" — ad-tech extension noise.
 */
const IGNORE_ERRORS: Array<string | RegExp> = [
	"ResizeObserver loop limit exceeded",
	"ResizeObserver loop completed with undelivered notifications",
	"Non-Error promise rejection captured",
	/AbortError: The (operation|user aborted) (was aborted|a request)/,
	"NetworkError when attempting to fetch resource",
	"Failed to fetch",
	"Load failed",
	"Hydration failed",
	"Text content does not match server-rendered HTML",
	"There was an error while hydrating",
	/Loading chunk \d+ failed/,
	/Loading CSS chunk \d+ failed/,
	"ChunkLoadError",
	"Script error.",
	"Cannot redefine property: googletag",
	// Browser extension noise
	/^chrome-extension:\/\//,
	/^moz-extension:\/\//,
	/^safari-extension:\/\//,
	/^safari-web-extension:\/\//,
	// User-cancelled flows that bubble up as exceptions in some browsers
	"User cancelled",
	"User denied",
];

/**
 * URL-based deny list — drops events whose TOP stack frame originated
 * from one of these origins. Avoids the noise from extensions and
 * external scripts we don't control.
 */
const DENY_URLS: Array<string | RegExp> = [
	/^chrome-extension:\/\//,
	/^moz-extension:\/\//,
	/^safari-extension:\/\//,
	/^safari-web-extension:\/\//,
	// Common ad-blocker / extension iframes
	/extensions\//,
	// PostHog static assets — errors thrown inside posthog's own bundle
	// land in the user's stack via our /ingest/static proxy. Filter so
	// we don't double-report (PostHog has its own error tracking).
	/\/ingest\/static\//,
];

const replaySessionRate = Number(process.env.NEXT_PUBLIC_SENTRY_REPLAY_SESSION_SAMPLE_RATE ?? 0);
const replayErrorRate = Number(
	process.env.NEXT_PUBLIC_SENTRY_REPLAY_ON_ERROR_SAMPLE_RATE ?? (isProd ? 1.0 : 0),
);

if (dsn) {
	Sentry.init({
		dsn,
		environment,
		tracesSampleRate: Number(
			process.env.NEXT_PUBLIC_SENTRY_TRACES_SAMPLE_RATE ?? (isProd ? 0.1 : 1),
		),
		// Send PII in dev (eases debugging); off in prod for privacy unless explicit.
		sendDefaultPii: !isProd || process.env.NEXT_PUBLIC_SENTRY_SEND_PII === "true",
		enableLogs: !isProd,
		debug: false,

		// Noise filters — see lists above for rationale.
		ignoreErrors: IGNORE_ERRORS,
		denyUrls: DENY_URLS,

		// Session Replay — gated by env so an operator can flip it off
		// without redeploying (just unset the env vars). Replay is a
		// paid feature with quota implications + adds ~50KB to the
		// browser bundle. We default to "record on error only" in prod
		// and off in dev so the bundle cost is paid only when the
		// integration is actually in use.
		integrations:
			replaySessionRate > 0 || replayErrorRate > 0
				? [
						Sentry.replayIntegration({
							// Privacy-by-default: every <input>, <textarea>,
							// <select>, and free text node is masked. Owner
							// panels we already drop in beforeSend. Even
							// without that, any field a real customer could
							// ever see (email, account name, deal value) is
							// masked at the browser-recording layer so the
							// replay never contains live PII.
							maskAllText: true,
							maskAllInputs: true,
							blockAllMedia: true,
							// Keep network breadcrumbs (fetch/XHR) — they
							// don't contain payloads, just URLs + method +
							// status. Critical for debugging "the button
							// didn't fire" type bugs.
							networkDetailAllowUrls: [],
						}),
					]
				: [],
		replaysSessionSampleRate: replaySessionRate,
		replaysOnErrorSampleRate: replayErrorRate,

		beforeSend: (event, hint) => {
			// Drop owner-panel events without leaking the slug into the bundle.
			if (isOwnerPanelClient()) return null;
			// Drop events whose original error is a Next.js navigation
			// signal — `redirect()`, `notFound()`, etc. throw internal
			// errors that ErrorBoundary already re-throws via
			// `unstable_rethrow`, but if any other code path forwards
			// them to Sentry we drop them here as a final defence.
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
			if (isOwnerPanelClient()) return null;
			// Drop /monitoring transactions — that's our Sentry tunnel
			// route and capturing transactions for it would create a
			// loop where Sentry monitors itself.
			if (
				event.transaction === "/monitoring" ||
				event.transaction?.startsWith("/monitoring")
			) {
				return null;
			}
			return event;
		},
	});
}
