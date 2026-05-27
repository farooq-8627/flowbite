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
 * Required envs (production):
 *   - NEXT_PUBLIC_SENTRY_DSN
 * Optional:
 *   - NEXT_PUBLIC_SENTRY_ENVIRONMENT (defaults to NODE_ENV)
 *   - NEXT_PUBLIC_SENTRY_TRACES_SAMPLE_RATE (defaults to 0.1 in prod, 1 in dev)
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
		beforeSend: (event) => {
			// Drop owner-panel events without leaking the slug into the bundle.
			if (isOwnerPanelClient()) return null;
			return event;
		},
		beforeSendTransaction: (event) => {
			if (isOwnerPanelClient()) return null;
			return event;
		},
	});
}
