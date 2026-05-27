/**
 * Sentry — edge runtime config (middleware, edge routes).
 *
 * Reads from env. No-ops if SENTRY_DSN is unset.
 *
 * OWNER-PANEL EXCLUSION (Stage 3 — 2026-05-27):
 *   Same shape as the server config — drop events whose `request.url`
 *   pathname starts with `/xowner`. The middleware itself runs in this
 *   runtime, so any error thrown inside the owner-panel slug rewrite logic
 *   is also dropped.
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

if (dsn) {
	Sentry.init({
		dsn,
		environment,
		tracesSampleRate: Number(process.env.SENTRY_TRACES_SAMPLE_RATE ?? (isProd ? 0.1 : 1)),
		sendDefaultPii: !isProd || process.env.SENTRY_SEND_PII === "true",
		beforeSend: (event) => {
			if (isOwnerPanelUrl(event.request?.url)) return null;
			return event;
		},
		beforeSendTransaction: (event) => {
			if (isOwnerPanelUrl(event.request?.url)) return null;
			return event;
		},
	});
}
