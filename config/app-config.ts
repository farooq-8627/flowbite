/**
 * Application configuration.
 * All user-visible strings come from here — never hardcode app name in UI.
 * White-label: change these values (or override via env vars) per deployment.
 *
 * URL resolution order (most specific → most generic):
 *   1. NEXT_PUBLIC_APP_URL — explicit override per deployment.
 *   2. VERCEL_PROJECT_PRODUCTION_URL — Vercel's stable production URL on
 *      preview / production deployments (no leading "https://").
 *   3. NEXT_PUBLIC_VERCEL_URL — Vercel's per-deployment URL when the build
 *      runs on Vercel (also no leading scheme). Useful for previews where
 *      the production URL hasn't been set yet.
 *   4. http://localhost:3000 — final fallback for local dev.
 *
 * The chain is evaluated at *build time* on Vercel because all
 * `NEXT_PUBLIC_*` vars are inlined into the client bundle. Setting
 * `NEXT_PUBLIC_APP_URL` in Vercel project settings is the canonical way
 * to make the onboarding URL preview show the real domain.
 */
function resolveAppUrl(): string {
	// 1. explicit override
	if (process.env.NEXT_PUBLIC_APP_URL) {
		return process.env.NEXT_PUBLIC_APP_URL;
	}
	// 2. Vercel production URL (no scheme prefix)
	if (process.env.VERCEL_PROJECT_PRODUCTION_URL) {
		return `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`;
	}
	// 3. Vercel per-deployment URL (preview / branch)
	if (process.env.NEXT_PUBLIC_VERCEL_URL) {
		return `https://${process.env.NEXT_PUBLIC_VERCEL_URL}`;
	}
	// 4. local dev fallback
	return "http://localhost:3000";
}

export const APP_CONFIG = {
	name: process.env.NEXT_PUBLIC_APP_NAME ?? "Orbitly",
	description: process.env.NEXT_PUBLIC_APP_DESCRIPTION ?? "AI-Powered CRM for Gulf Businesses",
	url: resolveAppUrl(),
	version: "0.1.0",
	/**
	 * Prefix used when generating platform-scoped org IDs.
	 * e.g. "ORB" → platformOrgId = "ORB-00042"
	 * Override via NEXT_PUBLIC_PLATFORM_PREFIX for white-label deployments.
	 */
	platformPrefix: process.env.NEXT_PUBLIC_PLATFORM_PREFIX ?? "ORB",
} as const;
