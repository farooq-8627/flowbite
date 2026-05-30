/**
 * Application configuration.
 * All user-visible strings come from here — never hardcode app name in UI.
 * White-label: change these values (or override via env vars) per deployment.
 *
 * URL resolution order (most specific → most generic):
 *   1. NEXT_PUBLIC_APP_URL — explicit override per deployment.
 *   2. NEXT_PUBLIC_VERCEL_PROJECT_PRODUCTION_URL — Vercel's stable production
 *      domain. Vercel auto-injects this for Next.js (the framework-prefixed
 *      variant) AND it's available even on preview deployments. This is the
 *      one we want — a copy-paste of an invite link from a preview build
 *      should still point at the production domain, not the per-deploy hash.
 *   3. NEXT_PUBLIC_VERCEL_URL — Vercel's per-deployment URL (fallback). Only
 *      reached when (2) is missing AND (1) is unset. Useful for previews
 *      where the production URL hasn't been configured yet.
 *   4. http://localhost:3000 — final fallback for local dev.
 *
 * IMPORTANT: only `NEXT_PUBLIC_*` env vars are inlined into the client
 * bundle by Next.js. Reading the unprefixed `VERCEL_PROJECT_PRODUCTION_URL`
 * here would resolve correctly on the server but be `undefined` on the
 * client — which silently fell through to `NEXT_PUBLIC_VERCEL_URL` and
 * leaked the messy per-deployment hash URL into invitation links and the
 * onboarding slug preview. Fixed 2026-05-21.
 */
function resolveAppUrl(): string {
	// 1. explicit override
	if (process.env.NEXT_PUBLIC_APP_URL) {
		return process.env.NEXT_PUBLIC_APP_URL;
	}
	// 2. Vercel production URL (no scheme prefix) — works in client + server bundles
	if (process.env.NEXT_PUBLIC_VERCEL_PROJECT_PRODUCTION_URL) {
		return `https://${process.env.NEXT_PUBLIC_VERCEL_PROJECT_PRODUCTION_URL}`;
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
	description:
		process.env.NEXT_PUBLIC_APP_DESCRIPTION ??
		"The AI-powered CRM that adapts to your industry.",
	url: resolveAppUrl(),
	version: "0.1.0",
	/**
	 * Prefix used when generating platform-scoped org IDs.
	 * e.g. "ORB" → platformOrgId = "ORB-00042"
	 * Override via NEXT_PUBLIC_PLATFORM_PREFIX for white-label deployments.
	 */
	platformPrefix: process.env.NEXT_PUBLIC_PLATFORM_PREFIX ?? "ORB",
} as const;
