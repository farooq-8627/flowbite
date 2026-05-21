"use client";

import { useConvexAuth, useQuery } from "convex/react";
import { redirect, useSearchParams } from "next/navigation";
import { api } from "@/convex/_generated/api";

/**
 * Root page — redirects authenticated users to their org dashboard.
 *
 * Decision tree (top to bottom):
 *   1. Loading auth/data → spinner.
 *   2. Not authenticated → /signin (middleware also handles this).
 *   3. **Pending invitation redirect** — if `?redirect=` points at a
 *      `/join/<token>` URL, send the user there before any onboarding
 *      check. This is the belt-and-suspenders that makes invited brand-new
 *      users land on the accept screen even if they got bounced through
 *      `/` somewhere along the way (OAuth round-trip, refresh, etc.).
 *   4. Has org + onboarding complete → /[slug]
 *   5. No org / onboarding incomplete → /onboarding
 *
 * Uses render-time `redirect()` instead of `useEffect + router.replace()`
 * for instant navigation without an extra render cycle.
 */

/**
 * Whitelist of post-auth redirect targets. Mirrors the helper in
 * SignInPage / SignUpPage — first-party in-app paths only, otherwise a
 * hostile referer could open-redirect through `/?redirect=…`.
 */
function safeRedirectTarget(raw: string | null): string | null {
	if (!raw) return null;
	if (!raw.startsWith("/")) return null;
	if (raw.startsWith("//")) return null;
	if (/^\/(?:[a-z]{2}\/)?join\/[^/?]+/.test(raw)) return raw;
	return null;
}

export default function Home() {
	const { isAuthenticated, isLoading } = useConvexAuth();
	const currentUser = useQuery(api.users.queries.me);
	const myOrgs = useQuery(api.orgs.queries.listMyOrgs, isAuthenticated ? {} : "skip");
	const searchParams = useSearchParams();
	const pendingRedirect = safeRedirectTarget(searchParams.get("redirect"));

	// Still loading auth or data — show spinner
	if (isLoading || currentUser === undefined || myOrgs === undefined) {
		return (
			<main className="flex min-h-screen items-center justify-center">
				<div className="h-8 w-8 animate-spin rounded-full border-primary border-b-2" />
			</main>
		);
	}

	if (!isAuthenticated || currentUser === null) {
		redirect("/signin");
	}

	// Honor a pending invitation redirect BEFORE any onboarding check.
	// This is the difference between an invited new user reaching the
	// accept screen vs. getting dumped into the "create your workspace"
	// wizard. Once the invite is accepted the link is dead, so this can't
	// loop.
	if (pendingRedirect) {
		redirect(pendingRedirect);
	}

	if (!currentUser.onboardingCompleted || myOrgs.length === 0) {
		redirect("/onboarding");
	}

	// Redirect to default org, or first org
	const defaultOrg = currentUser.defaultOrgId
		? myOrgs.find((m) => m.orgId === currentUser.defaultOrgId)
		: myOrgs[0];

	const slug = defaultOrg?.org.slug ?? myOrgs[0]?.org.slug;
	redirect(slug ? `/${slug}` : "/onboarding");
}
