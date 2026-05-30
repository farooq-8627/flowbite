"use client";

import { useConvexAuth, useQuery } from "convex/react";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo } from "react";
import { api } from "@/convex/_generated/api";

/**
 * Root page — routes authenticated users to their org dashboard.
 *
 * Decision tree (top to bottom):
 *   1. Auth still loading → spinner.
 *   2. Not authenticated → /signin.
 *   3. Pending invitation redirect → /join/<token>.
 *   4. User / orgs still loading → spinner.
 *   5. No org / onboarding incomplete → /onboarding.
 *   6. Has org + onboarding complete → /[orgSlug].
 *
 * FIX 2026-05-22: Both `currentUser` and `myOrgs` are now gated on
 * `isAuthenticated` — previously `users.queries.me` fired unconditionally,
 * threw `Unauthorized` when not authenticated, and crashed the page via
 * the error boundary instead of redirecting to /signin.
 *
 * FIX 2026-05-30: Replaced the in-render `redirect()` calls with
 * `useEffect` + `router.replace()`. Calling `redirect()` from a CLIENT
 * component throws `NEXT_REDIRECT` mid-render, which is what triggers
 * the production "Minified React error #310" the user reported. Putting
 * the navigation in an effect keeps the hook tree stable across re-
 * renders and lets React flush the current commit before navigating.
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
	const searchParams = useSearchParams();
	const pendingRedirect = safeRedirectTarget(searchParams.get("redirect"));
	const router = useRouter();

	// Both queries gated on auth — they return undefined (skip) until
	// auth is confirmed, which means no `Unauthorized` throws server-side.
	const currentUser = useQuery(api.users.queries.me, isAuthenticated ? {} : "skip");
	const myOrgs = useQuery(api.orgs.queries.listMyOrgs, isAuthenticated ? {} : "skip");

	// Compute the desired destination as a memoized string so the
	// useEffect only fires when the resolved target actually changes.
	// Returns `null` while data is still loading or the page is in an
	// "intermediate" state (e.g. auth resolved but queries still pending).
	const target = useMemo<string | null>(() => {
		if (isLoading) return null;
		if (!isAuthenticated) return "/signin";
		if (pendingRedirect) return pendingRedirect;
		if (currentUser === undefined || myOrgs === undefined) return null;
		if (!currentUser?.onboardingCompleted || myOrgs.length === 0) {
			return "/onboarding";
		}
		const defaultOrg = currentUser.defaultOrgId
			? myOrgs.find((m) => m.orgId === currentUser.defaultOrgId)
			: myOrgs[0];
		const slug = defaultOrg?.org.slug ?? myOrgs[0]?.org.slug;
		return slug ? `/${slug}` : "/onboarding";
	}, [isLoading, isAuthenticated, pendingRedirect, currentUser, myOrgs]);

	useEffect(() => {
		if (!target) return;
		router.replace(target);
	}, [target, router]);

	// Stable spinner placeholder — runs the same number of hooks
	// regardless of which branch above we're in. Critical for avoiding
	// React error #310 when auth flips during the page lifecycle.
	return (
		<main className="flex min-h-screen items-center justify-center">
			<div className="h-8 w-8 animate-spin rounded-full border-primary border-b-2" />
		</main>
	);
}
