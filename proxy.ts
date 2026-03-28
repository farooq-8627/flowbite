import {
	convexAuthNextjsMiddleware,
	createRouteMatcher,
	nextjsMiddlewareRedirect,
} from "@convex-dev/auth/nextjs/server";
import createIntlMiddleware from "next-intl/middleware";
import { routing } from "./i18n/routing";

const intlMiddleware = createIntlMiddleware(routing);
const isSignInPage = createRouteMatcher(["/signin", "/*/signin"]);
const isProtectedRoute = createRouteMatcher(["/", "/server", "/*/", "/*/server"]);

export default convexAuthNextjsMiddleware(async (request, { convexAuth }) => {
	if (isSignInPage(request) && (await convexAuth.isAuthenticated())) {
		return nextjsMiddlewareRedirect(request, "/");
	}
	if (isProtectedRoute(request) && !(await convexAuth.isAuthenticated())) {
		return nextjsMiddlewareRedirect(request, "/signin");
	}
	return intlMiddleware(request);
});

export const config = {
	matcher: ["/((?!.*\\..*|_next).*)", "/", "/(api|trpc)(.*)"],
};
