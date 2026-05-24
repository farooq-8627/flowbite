import { withSentryConfig } from "@sentry/nextjs";
import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

// ─── Security Headers (Phase 3A) ─────────────────────────────────────────────
//
// Production-grade defaults. Each header serves one purpose:
//
//   - Strict-Transport-Security: pin HTTPS for 2 years, include subdomains,
//     and request preload listing.
//   - X-Frame-Options: DENY all framing — prevents clickjacking.
//   - X-Content-Type-Options: nosniff — block MIME-sniffing attacks.
//   - Referrer-Policy: strict-origin-when-cross-origin — ship origin to
//     same-site, omit on downgrade.
//   - Permissions-Policy: turn off browser APIs we don't use (camera/mic
//     stay off; we don't have voice yet — Phase 3C will revisit).
//   - Content-Security-Policy: lock down third-party script + connect
//     origins. We allow:
//       * 'self' for our own assets.
//       * Convex deployment URL (browser SDK + signed file URLs).
//       * Convex Auth callback URLs.
//       * LemonSqueezy app + API for billing redirects.
//       * Resend (email tracking pixels never load in our flows; covered for safety).
//       * Sentry ingest tunnel (already proxied at /monitoring).
//       * PostHog ingest endpoints (already proxied at /ingest).
//
// CSP Notes:
//   - `unsafe-inline` on styles is unavoidable with Tailwind JIT until we
//     migrate to nonces. Documented as a known accepted risk.
//   - `unsafe-eval` on scripts is required by Next.js dev mode and Convex
//     real-time updates that use `Function` constructor for serialised
//     functions. We keep it because removing it breaks `next dev`.
//   - The CSP runs in REPORT-ONLY mode in development so locally-running
//     tooling (e.g. devtools, dev-only fetches) doesn't break. Production
//     deploys run in enforce mode automatically when `NODE_ENV === "production"`.
//
// To rotate the Convex deployment URL, update NEXT_PUBLIC_CONVEX_URL in
// `.env.production` — the CSP reads it at build time via process.env.

const isProd = process.env.NODE_ENV === "production";

/** Convex deployment URL → derive both the WS connect origin and HTTP origin. */
function getConvexHosts(): { http: string; ws: string; site: string } {
	// During build the env may be unset (CI smoke), fall back to wildcard.
	const url = process.env.NEXT_PUBLIC_CONVEX_URL;
	if (!url)
		return {
			http: "https://*.convex.cloud",
			ws: "wss://*.convex.cloud",
			site: "https://*.convex.site",
		};
	const hostname = new URL(url).hostname; // e.g. modest-fox-123.convex.cloud
	const stem = hostname.replace(/\.convex\.cloud$/, "");
	return {
		http: `https://${hostname}`,
		ws: `wss://${hostname}`,
		// Convex HTTP routes (auth callbacks, our LemonSqueezy webhook) live on convex.site.
		site: `https://${stem}.convex.site`,
	};
}

const convex = getConvexHosts();

const cspDirectives: Record<string, string[]> = {
	"default-src": ["'self'"],
	"script-src": ["'self'", "'unsafe-inline'", "'unsafe-eval'", "https://us-assets.i.posthog.com"],
	"style-src": ["'self'", "'unsafe-inline'"],
	"img-src": ["'self'", "data:", "blob:", "https:"],
	"font-src": ["'self'", "data:"],
	"connect-src": [
		"'self'",
		convex.http,
		convex.ws,
		convex.site,
		"https://api.lemonsqueezy.com",
		"https://app.lemonsqueezy.com",
		"https://api.resend.com",
		"https://*.sentry.io",
		"https://us.i.posthog.com",
		"https://us-assets.i.posthog.com",
	],
	"frame-src": ["'self'", "https://app.lemonsqueezy.com", "https://checkout.lemonsqueezy.com"],
	"frame-ancestors": ["'none'"],
	"base-uri": ["'self'"],
	"form-action": ["'self'", "https://app.lemonsqueezy.com"],
	"object-src": ["'none'"],
	"upgrade-insecure-requests": [],
};

const csp = Object.entries(cspDirectives)
	.map(([k, v]) => (v.length === 0 ? k : `${k} ${v.join(" ")}`))
	.join("; ");

const securityHeaders = [
	{
		key: "Strict-Transport-Security",
		value: "max-age=63072000; includeSubDomains; preload",
	},
	{ key: "X-Frame-Options", value: "DENY" },
	{ key: "X-Content-Type-Options", value: "nosniff" },
	{ key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
	{
		key: "Permissions-Policy",
		value: [
			"camera=()",
			"microphone=()",
			"geolocation=()",
			"interest-cohort=()",
			'payment=(self "https://app.lemonsqueezy.com")',
		].join(", "),
	},
	{
		// Report-Only in development so local tooling doesn't trip; enforce in prod.
		key: isProd ? "Content-Security-Policy" : "Content-Security-Policy-Report-Only",
		value: csp,
	},
];

const nextConfig: NextConfig = {
	async rewrites() {
		return [
			{
				source: "/ingest/static/:path*",
				destination: "https://us-assets.i.posthog.com/static/:path*",
			},
			{
				source: "/ingest/:path*",
				destination: "https://us.i.posthog.com/:path*",
			},
		];
	},
	async headers() {
		return [
			{
				// Apply globally. Per-route overrides can attach extra headers
				// where stricter rules are needed (e.g. embedded checkout pages).
				source: "/:path*",
				headers: securityHeaders,
			},
		];
	},
	// Required to support PostHog trailing slash API requests
	skipTrailingSlashRedirect: true,
};

const withNextIntl = createNextIntlPlugin();

export default withNextIntl(
	withSentryConfig(nextConfig, {
		// For all available options, see:
		// https://www.npmjs.com/package/@sentry/webpack-plugin#options
		// Org/project come from env so the project doesn't ship with one team's
		// hardcoded slug. Source-map upload is skipped if either is unset.
		org: process.env.SENTRY_ORG,
		project: process.env.SENTRY_PROJECT,
		authToken: process.env.SENTRY_AUTH_TOKEN,

		// Only print logs for uploading source maps in CI
		silent: !process.env.CI,

		// For all available options, see:
		// https://docs.sentry.io/platforms/javascript/guides/nextjs/manual-setup/

		// Upload a larger set of source maps for prettier stack traces (increases build time)
		widenClientFileUpload: true,

		// Skip source-map upload entirely if Sentry isn't configured for this build.
		disableLogger: true,
		sourcemaps: {
			disable: !process.env.SENTRY_AUTH_TOKEN,
		},

		// Route browser requests to Sentry through a Next.js rewrite to circumvent ad-blockers.
		// This can increase your server load as well as your hosting bill.
		// Note: Check that the configured route will not match with your Next.js middleware, otherwise reporting of client-
		// side errors will fail.
		tunnelRoute: "/monitoring",

		webpack: {
			// Enables automatic instrumentation of Vercel Cron Monitors. (Does not yet work with App Router route handlers.)
			// See the following for more information:
			// https://docs.sentry.io/product/crons/
			// https://vercel.com/docs/cron-jobs
			automaticVercelMonitors: true,

			// Tree-shaking options for reducing bundle size
			treeshake: {
				// Automatically tree-shake Sentry logger statements to reduce bundle size
				removeDebugLogging: true,
			},
		},
	}),
);
