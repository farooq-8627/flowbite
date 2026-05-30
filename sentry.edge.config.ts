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
 *
 * NOISE FILTERS (2026-05-30):
 *   Same Next.js-navigation-signal drops as the Node config. The edge
 *   runtime is more limited — no `process.cwd()`, no Node-only stdlib,
 *   etc. — but the navigation-signal pattern is identical, so we
 *   mirror it here.
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

const IGNORE_ERRORS: Array<string | RegExp> = [
	"NEXT_REDIRECT",
	"NEXT_NOT_FOUND",
	"NEXT_PERMANENT_REDIRECT",
	/NEXT_HTTP_ERROR_FALLBACK/,
	"AbortError",
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
