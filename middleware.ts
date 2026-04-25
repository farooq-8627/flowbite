/**
 * Next.js Middleware — Auth guard + i18n locale routing.
 *
 * HOW IT WORKS:
 *   1. Public routes (signin, signup) are accessible without authentication.
 *   2. Every other route requires authentication — unauthenticated users → /signin.
 *   3. Authenticated users visiting auth pages → redirected to home /.
 *   4. After auth checks, intlMiddleware handles locale detection and prefixing.
 *
 * POSTHOG FIX:
 *   In Next.js, middleware runs BEFORE next.config.ts rewrites. Without excluding
 *   /ingest/ from the matcher, intlMiddleware redirects /ingest/e → /en/ingest/e,
 *   which then fails the rewrite and returns 404. Excluding "ingest" from the
 *   matcher prevents this — PostHog requests go straight to the rewrite.
 *
 * REDIRECT LOOP FIX:
 *   The old pattern used isProtectedRoute([..., "/:locale", ...]) which matched
 *   /signin (treating "signin" as a locale segment). This caused an infinite loop
 *   for unauthenticated users at /signin. Switching to isPublicRoute (default-deny)
 *   solves this and is more secure for a B2B SaaS app.
 *
 * Sources:
 * - node_modules/@convex-dev/auth/dist/nextjs/server/index.d.ts — middleware API
 * - https://next-intl.dev/docs/routing/middleware — intlMiddleware composition
 */
import {
	convexAuthNextjsMiddleware,
	createRouteMatcher,
	nextjsMiddlewareRedirect,
} from "@convex-dev/auth/nextjs/server";
import createIntlMiddleware from "next-intl/middleware";
import { routing } from "./i18n/routing";

const intlMiddleware = createIntlMiddleware(routing);

/** Routes accessible without authentication */
const isPublicRoute = createRouteMatcher([
	"/signin",
	"/:locale/signin",
	"/signup",
	"/:locale/signup",
]);

export default convexAuthNextjsMiddleware(async (request, { convexAuth }) => {
	// Authenticated user visiting an auth page → redirect to home
	if (isPublicRoute(request) && (await convexAuth.isAuthenticated())) {
		return nextjsMiddlewareRedirect(request, "/");
	}

	// Unauthenticated user visiting a protected route → redirect to signin
	if (!isPublicRoute(request) && !(await convexAuth.isAuthenticated())) {
		return nextjsMiddlewareRedirect(request, "/signin");
	}

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
