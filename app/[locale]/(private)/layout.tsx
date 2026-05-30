"use client";

import { useConvexAuth } from "convex/react";
import { usePathname, useRouter } from "next/navigation";
import { type ReactNode, useEffect } from "react";

/**
 * Auth guard for all private routes.
 *
 * RENDERING / REDIRECT CONTRACT
 * ─────────────────────────────
 * Calling `redirect()` from `next/navigation` inside a CLIENT component
 * works (it throws `NEXT_REDIRECT` which Next's error boundary catches),
 * but it has a nasty side effect: when the auth state flips from
 * authenticated → unauthenticated mid-render (e.g. the user clicks
 * "Log out" while looking at the dashboard), the redirect throws WHILE
 * children are still being rendered. React then re-renders with a
 * different number of hooks (because the throw happens after the
 * children have already mounted on the previous render) and you get
 *
 *   Minified React error #310; visit https://react.dev/errors/310
 *
 * which is the user's exact production symptom on 2026-05-30.
 *
 * The fix is to:
 *   1. Render a stable "loading" placeholder when auth is still
 *      resolving OR when the user is unauthenticated. The placeholder
 *      runs ZERO hooks of its own, so the hook-tree shape is constant
 *      (same number of hooks rendered before AND after sign-out).
 *   2. Schedule the navigation in a `useEffect` so it runs AFTER the
 *      render commits — never inside the render itself.
 *
 * The `<OrgProvider>` and the rest of the dashboard tree remain
 * unmounted while `isAuthenticated === false`, so there's no chance
 * of a stale Convex query firing without an auth token (which is what
 * causes the WebSocket reconnect noise reported alongside React #310).
 */
export default function PrivateLayout({ children }: { children: ReactNode }) {
	const { isAuthenticated, isLoading } = useConvexAuth();
	const pathname = usePathname();
	const router = useRouter();

	useEffect(() => {
		if (isLoading) return;
		if (!isAuthenticated) {
			const locale = pathname.split("/")[1] ?? "en";
			// `replace` (not `push`) so the protected URL doesn't end up
			// in history — prevents back-button loops.
			router.replace(`/${locale}/signin`);
		}
	}, [isAuthenticated, isLoading, pathname, router]);

	// Stable placeholder during BOTH "auth still loading" and "definitely
	// unauthenticated, navigation pending". Same hook count on every render,
	// regardless of auth flips. Returns `null` instead of a spinner so the
	// page doesn't flash content during fast logout transitions.
	if (isLoading || !isAuthenticated) return null;

	return <>{children}</>;
}
