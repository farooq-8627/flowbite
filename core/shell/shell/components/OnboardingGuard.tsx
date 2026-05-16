"use client";

import { useConvexAuth, useQuery } from "convex/react";
import { redirect, usePathname } from "next/navigation";
import { api } from "@/convex/_generated/api";

/**
 * OnboardingGuard — redirects to `/{locale}/onboarding` if the user hasn't
 * completed onboarding yet.
 *
 * The middleware already handles unauthenticated → /signin, so we only need
 * to check `onboardingCompleted` here.
 *
 * Render-time `redirect()` from `next/navigation` is used (matching
 * `app/[locale]/(private)/layout.tsx`) — a `useEffect` waterfall would let
 * the dashboard layout start mounting before the redirect fires, causing a
 * brief flash of the dashboard chrome on slow networks.
 *
 * Auth check ordering:
 *   1. Wait for `useConvexAuth` to settle.
 *   2. Wait for `useQuery(users.me)` to settle.
 *   3. If onboarding incomplete → render-time redirect (throws to next.js).
 *   4. Otherwise render the children.
 */
export function OnboardingGuard({ children }: { children: React.ReactNode }) {
	const { isAuthenticated, isLoading } = useConvexAuth();
	const currentUser = useQuery(api.users.queries.me, isAuthenticated ? {} : "skip");
	const pathname = usePathname();

	// Loading: render nothing — the layout's outer Suspense fallback covers this.
	if (isLoading || currentUser === undefined) return null;

	// Authenticated but onboarding not done → redirect at render time.
	// Locale prefix is preserved so RTL-aware redirects don't lose the locale.
	if (!currentUser?.onboardingCompleted) {
		const locale = pathname.split("/")[1] ?? "en";
		redirect(`/${locale}/onboarding`);
	}

	return <>{children}</>;
}
