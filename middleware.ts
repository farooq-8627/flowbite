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
const isAuthPage = createRouteMatcher([
	"/signin",
	"/signup",
	"/:locale/signin",
	"/:locale/signup",
]);

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
		return nextjsMiddlewareRedirect(
			request,
			`/signin?redirect=${encodeURIComponent(target)}`,
		);
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
