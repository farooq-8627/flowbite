/**
 * Sentry — edge runtime config (middleware, edge routes).
 *
 * Reads from env. No-ops if SENTRY_DSN is unset.
 */
import * as Sentry from "@sentry/nextjs";

const dsn = process.env.SENTRY_DSN ?? process.env.NEXT_PUBLIC_SENTRY_DSN;
const environment = process.env.SENTRY_ENVIRONMENT ?? process.env.NODE_ENV;
const isProd = environment === "production";

if (dsn) {
	Sentry.init({
		dsn,
		environment,
		tracesSampleRate: Number(process.env.SENTRY_TRACES_SAMPLE_RATE ?? (isProd ? 0.1 : 1)),
		sendDefaultPii: !isProd || process.env.SENTRY_SEND_PII === "true",
	});
}
