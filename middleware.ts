/**
 * Next.js Middleware — Auth guard + i18n locale routing + Owner-panel rewrite.
 *
 * PATTERN
 * ───────
 * Follows the canonical convex-auth + next-intl composition documented at
 * https://labs.convex.dev/auth/authz/nextjs and
 * https://next-intl.dev/docs/routing/middleware:
 *
 *   1. Define an `isAuthPage` matcher (signin / signup / join). Authenticated
 *      users hitting these are redirected to `/` so they can't see the auth
 *      forms while signed in.
 *   2. Define an `isProtectedRoute` matcher (everything that requires auth).
 *      Unauthenticated users are redirected to `/signin`.
 *   3. The root `/` page is intentionally NOT matched as either — it's
 *      reachable by everyone. The client-rendered page at
 *      `app/[locale]/page.tsx` handles the "go to /onboarding or /[org]"
 *      branch for authenticated users and falls back to /signin for
 *      anonymous ones.
 *   4. After auth checks, `intlMiddleware` handles locale negotiation
 *      and prefixing.
 *
 * OWNER PANEL (added 2026-05-27)
 * ──────────────────────────────
 * The platform-owner panel lives at a hidden, env-configured URL. Two rules:
 *
 *   - `OWNER_PANEL_SLUG` (server-only env). The literal first path segment
 *     served as the panel root. Requests to `/<slug>[/...]` are REWRITTEN
 *     to `/xowner[/...]` (Next.js literal route tree) before any other
 *     middleware runs.
 *   - Direct hits on `/xowner[/...]` are BLOCKED (404). The internal
 *     literal segment is unreachable except via the rewrite. This
 *     prevents anyone from guessing the internal path.
 *
 * The rewrite also sets a non-secret `is_owner_panel=1` cookie so client-
 * side telemetry (PostHog, Sentry browser) can drop events without ever
 * reading the slug from the bundle. Server-side telemetry filters on the
 * pathname (`/xowner/*`) directly.
 *
 * Spec: PLATFORM-OWNER-PANEL.md §2 (URL & access control), §9 (telemetry).
 *
 * REDIRECT-LOOP FIX (2026-05-21)
 * ──────────────────────────────
 * The previous implementation matched `/` and `/:locale` as public routes
 * and unconditionally redirected authenticated users on any public route
 * to `/`. That caused an immediate loop because `/` itself is a public
 * route → redirect to `/` → loop.
 *
 * The new pattern only redirects away from explicit auth pages, never from
 * `/` or locale-prefix-only paths. The page at `/` makes its own redirect
 * decision based on the user's onboarding + org state.
 *
 * POSTHOG / SENTRY
 * ────────────────
 * Excluding `ingest` and `monitoring` from the matcher prevents intl
 * middleware from locale-prefixing those endpoints (which then fail their
 * rewrite to PostHog / Sentry).
 *
 * Sources:
 * - https://labs.convex.dev/auth/authz/nextjs (canonical pattern)
 * - https://next-intl.dev/docs/routing/middleware (composition)
 */
import {
	convexAuthNextjsMiddleware,
	createRouteMatcher,
	nextjsMiddlewareRedirect,
} from "@convex-dev/auth/nextjs/server";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import createIntlMiddleware from "next-intl/middleware";
import { routing } from "./i18n/routing";

const intlMiddleware = createIntlMiddleware(routing);

// ─── Owner panel ─────────────────────────────────────────────────────────────

/**
 * The owner-panel slug is read PER REQUEST (not captured at module-load
 * time). This is critical for `pnpm dev`: editing `.env.local` triggers
 * Next.js to reload the middleware bundle, but capturing the env var at
 * module top is brittle — readers reported the slug being `undefined`
 * for one request after a `.env.local` edit despite the file being
 * present. Reading per-request costs one `process.env` lookup which
 * Next.js inlines at build time anyway, so the runtime cost is zero.
 *
 * NOTE for dev: if you change `OWNER_PANEL_SLUG` in `.env.local` while
 * the dev server is running, RESTART `pnpm dev`. Next.js caches some
 * env reads across HMR cycles.
 */
function getOwnerPanelSlug(): string | undefined {
	const raw = process.env.OWNER_PANEL_SLUG;
	const trimmed = raw?.trim();
	return trimmed && trimmed.length > 0 ? trimmed : undefined;
}

/**
 * Classify an inbound request against the owner-panel rules.
 *
 *   - `block`       — direct hit on `/xowner[/...]`. Always 404, regardless
 *                     of slug config. The internal segment is reachable only
 *                     via the rewrite.
 *   - `rewrite`     — public hit on `/<OWNER_PANEL_SLUG>[/...]`. Rewrite to
 *                     `/xowner[/...]` and continue.
 *   - `passthrough` — not an owner-panel request; let the rest of the
 *                     middleware chain handle it normally.
 */
function classifyOwnerRequest(req: NextRequest): "rewrite" | "block" | "passthrough" {
	const path = req.nextUrl.pathname;

	// Always block direct hits on the internal route segment, even if no
	// slug is configured — the segment must never be reachable.
	if (path === "/xowner" || path.startsWith("/xowner/")) return "block";

	// Read the slug per-request — see `getOwnerPanelSlug` doc-comment for
	// why we don't cache at module top.
	const slug = getOwnerPanelSlug();
	if (!slug) return "passthrough";

	if (path === `/${slug}` || path.startsWith(`/${slug}/`)) {
		return "rewrite";
	}

	return "passthrough";
}

/**
 * Build the rewritten URL `/<slug>[/...]` → `/xowner[/...]`. Preserves the
 * tail (everything after the slug), the query string, and the hash.
 */
function buildOwnerRewriteUrl(req: NextRequest): URL {
	const slug = getOwnerPanelSlug();
	if (!slug) {
		// classifyOwnerRequest guards against this, but TypeScript needs the
		// safety check for the slice math below.
		throw new Error("buildOwnerRewriteUrl called when OWNER_PANEL_SLUG is unset.");
	}
	const url = req.nextUrl.clone();
	const tail = url.pathname.slice(`/${slug}`.length); // "" | "/foo" | "/foo/bar"
	url.pathname = tail.length === 0 ? "/xowner" : `/xowner${tail}`;
	return url;
}

/**
 * Auth pages (signin, signup). Authenticated users get bounced off these
 * to `/` so they can't see the form while logged in. Patterns cover both
 * the un-prefixed path (`/signin` — before intl runs) and the locale-
 * prefixed path (`/en/signin` — after intl runs).
 *
 * NOTE: `/join/<token>` is NOT in this list. It's a protected route (see
 * `isProtectedRoute` below) so unauthenticated users get redirected to
 * /signin with `?redirect=/join/<token>` preserved. After auth they land
 * back on the join page to actually accept. Authenticated users on
 * `/join/<token>` always see the accept screen — even owners on a fresh
 * incognito tab.
 */
const isAuthPage = createRouteMatcher(["/signin", "/signup", "/:locale/signin", "/:locale/signup"]);

/**
 * Routes that require authentication. Everything except `/`, the auth
 * pages above, and static / API endpoints excluded by the matcher config
 * below.
 *
 * Important: `/` and `/:locale` are intentionally excluded. The root page
 * makes its own redirect decision (signin / onboarding / org dashboard).
 *
 * `/join/<token>` is in this list so the middleware can redirect to
 * `/signin?redirect=/join/<token>` — the only way an invited brand-new
 * user gets bounced through auth and then back to the accept screen
 * instead of getting dumped into onboarding.
 */
const isProtectedRoute = createRouteMatcher([
	"/onboarding",
	"/onboarding/(.*)",
	"/profile",
	"/profile/(.*)",
	"/join/:token",
	"/:locale/onboarding",
	"/:locale/onboarding/(.*)",
	"/:locale/profile",
	"/:locale/profile/(.*)",
	"/:locale/join/:token",
	// All workspace routes /[locale]/[orgSlug]/(...) — but exclude the
	// auth + onboarding + profile paths above, which we already match.
	// Anything under "/<locale>/<slug>" with slug not in (signin, signup,
	// onboarding, profile, join, api, _next, ingest, monitoring) is org-
	// scoped and protected.
	"/:locale/((?!signin$|signup$|onboarding|profile|join|api|_next|ingest|monitoring).+)",
]);

export default convexAuthNextjsMiddleware(async (request, { convexAuth }) => {
	// ─── Owner panel — runs FIRST so it short-circuits everything else ────
	const ownerKind = classifyOwnerRequest(request);
	if (ownerKind === "block") {
		// Hide the internal route from probing — return a Next.js 404 so
		// the response shape matches a non-existent path.
		return new NextResponse(null, { status: 404 });
	}
	if (ownerKind === "rewrite") {
		const slug = getOwnerPanelSlug();
		if (!slug) {
			// classifyOwnerRequest only returns "rewrite" when slug is set,
			// but TS needs the narrowing for the header-build below.
			return new NextResponse(null, { status: 404 });
		}
		const rewritten = buildOwnerRewriteUrl(request);

		// Forward the operator slug to the rendered page tree as a request
		// header. Server components / layouts read this via `headers()` to
		// build redirects + links that target the PUBLIC slug-prefixed URL
		// rather than the internal `/xowner/...` segment (which middleware
		// blocks on direct hits).
		const requestHeaders = new Headers(request.headers);
		requestHeaders.set("x-owner-public-prefix", `/${slug}`);

		const response = NextResponse.rewrite(rewritten, {
			request: { headers: requestHeaders },
		});
		// Non-secret cookie used by client-side telemetry filters to drop
		// events without reading the slug from the bundle. The cookie value
		// itself is intentionally trivial; presence is the signal.
		response.cookies.set({
			name: "is_owner_panel",
			value: "1",
			path: "/",
			httpOnly: false,
			sameSite: "lax",
			secure: process.env.NODE_ENV === "production",
			maxAge: 60 * 60, // 1 hour — long enough for the session, short enough that a
			// stale cookie on a subsequent non-owner navigation expires.
		});
		// Owner-panel responses must not be cached by browsers or CDNs.
		response.headers.set("Cache-Control", "no-store, no-cache, must-revalidate");
		response.headers.set("X-Robots-Tag", "noindex, nofollow");
		return response;
	}

	// Use getToken() (cookie read, no network call) for the fast path.
	// Only call isAuthenticated() (Convex network call) when a redirect
	// decision actually depends on server-verified auth status.
	const token = await convexAuth.getToken();

	// Authenticated user on an auth page (signin / signup) → bounce to
	// home. /join/<token> is intentionally NOT in the auth-page set —
	// signed-in users clicking an invite link must reach the accept
	// screen.
	if (isAuthPage(request) && token) {
		return nextjsMiddlewareRedirect(request, "/");
	}

	// Unauthenticated user on a protected route → bounce to signin, but
	// preserve the original target so signin can return them after auth.
	// This is the chain that makes invitation links work for brand-new
	// users: /join/<token> → /signin?redirect=/join/<token> → (sign up)
	// → /join/<token>. Without the redirect param the SignIn page falls
	// back to "/" which then routes a no-org user into onboarding.
	if (isProtectedRoute(request) && !token) {
		const target = request.nextUrl.pathname + request.nextUrl.search;
		return nextjsMiddlewareRedirect(request, `/signin?redirect=${encodeURIComponent(target)}`);
	}

	// Otherwise let next-intl handle locale negotiation + prefix.
	return intlMiddleware(request);
});

export const config = {
	matcher: [
		// Exclude: static files with extensions, _next internals, PostHog ingest proxy,
		// and Sentry tunnel route (/monitoring). Both "ingest" and "monitoring" must be
		// excluded so intlMiddleware doesn't locale-prefix them before rewrites/handlers run.
		"/((?!.*\\..*|_next|ingest|monitoring).*)",
		"/",
		"/(api|trpc)(.*)",
	],
};
