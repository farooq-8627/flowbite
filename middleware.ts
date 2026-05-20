/**
 * Next.js Middleware — Auth guard + i18n locale routing.
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
import createIntlMiddleware from "next-intl/middleware";
import { routing } from "./i18n/routing";

const intlMiddleware = createIntlMiddleware(routing);

/**
 * Auth pages (signin, signup, join). Authenticated users get bounced off
 * these to `/` so they can't see the form while logged in. Patterns cover
 * both the un-prefixed path (`/signin` — before intl runs) and the locale-
 * prefixed path (`/en/signin` — after intl runs).
 *
 * NOTE the leaf `/join/:token` is matched too — once accepted, an
 * authenticated user shouldn't see the join page again.
 */
const isAuthPage = createRouteMatcher([
	"/signin",
	"/signup",
	"/:locale/signin",
	"/:locale/signup",
	"/join/:token",
	"/:locale/join/:token",
]);

/**
 * Routes that require authentication. Everything except `/`, the auth
 * pages above, and static / API endpoints excluded by the matcher config
 * below.
 *
 * Important: `/` and `/:locale` are intentionally excluded. The root page
 * makes its own redirect decision (signin / onboarding / org dashboard).
 *
 * `/onboarding`, `/[orgSlug]`, `/profile`, etc. all live under the private
 * group, so we use catch-alls.
 */
const isProtectedRoute = createRouteMatcher([
	"/onboarding",
	"/onboarding/(.*)",
	"/profile",
	"/profile/(.*)",
	"/:locale/onboarding",
	"/:locale/onboarding/(.*)",
	"/:locale/profile",
	"/:locale/profile/(.*)",
	// All workspace routes /[locale]/[orgSlug]/(...) — but exclude the
	// auth + onboarding + profile paths above, which we already match.
	// Anything under "/<locale>/<slug>" with slug not in (signin, signup,
	// onboarding, profile, join, api, _next, ingest, monitoring) is org-
	// scoped and protected.
	"/:locale/((?!signin$|signup$|onboarding|profile|join|api|_next|ingest|monitoring).+)",
]);

export default convexAuthNextjsMiddleware(async (request, { convexAuth }) => {
	// Use getToken() (cookie read, no network call) for the fast path.
	// Only call isAuthenticated() (Convex network call) when a redirect
	// decision actually depends on server-verified auth status.
	const token = await convexAuth.getToken();

	// Authenticated user on an auth page → bounce to home.
	if (isAuthPage(request) && token) {
		return nextjsMiddlewareRedirect(request, "/");
	}

	// Unauthenticated user on a protected route → bounce to signin.
	if (isProtectedRoute(request) && !token) {
		return nextjsMiddlewareRedirect(request, "/signin");
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
