"use client";

import { useConvexAuth, useQuery } from "convex/react";
import { useRouter } from "next/navigation";
import { useEffect, useMemo } from "react";
import { api } from "@/convex/_generated/api";
import { LandingView } from "./LandingView";

/**
 * HomeView — the public landing page at `/[locale]`.
 *
 * By default it just renders the marketing landing — it NEVER auto-redirects
 * a signed-in visitor away. Routing to the workspace only happens when
 * `autoRedirect` is set, which is true ONLY right after an explicit auth
 * action (the auth pages + the middleware bounce off `/signin`/`/signup` send
 * the user to `/?continue=1`). So: visiting `/` while logged in shows the
 * landing; clicking Sign in / Start free is what takes you onward.
 */
export function HomeView({ autoRedirect = false }: { autoRedirect?: boolean }) {
	const { isAuthenticated, isLoading } = useConvexAuth();
	const router = useRouter();
	const shouldResolve = autoRedirect && isAuthenticated;
	const currentUser = useQuery(api.users.queries.me, shouldResolve ? {} : "skip");
	const myOrgs = useQuery(api.orgs.queries.listMyOrgs, shouldResolve ? {} : "skip");

	const target = useMemo<string | null>(() => {
		if (!shouldResolve) return null;
		if (currentUser === undefined || myOrgs === undefined) return null;
		if (!currentUser?.onboardingCompleted || myOrgs.length === 0) return "/onboarding";
		const defaultOrg = currentUser.defaultOrgId
			? myOrgs.find((m) => m.orgId === currentUser.defaultOrgId)
			: myOrgs[0];
		const slug = defaultOrg?.org.slug ?? myOrgs[0]?.org.slug;
		return slug ? `/${slug}` : "/onboarding";
	}, [shouldResolve, currentUser, myOrgs]);

	useEffect(() => {
		if (target) router.replace(target);
	}, [target, router]);

	// Post-auth continue: show a spinner while we resolve the workspace, so the
	// user doesn't flash the marketing page on their way into the app. Falls
	// back to the landing if it turns out they aren't authenticated.
	if (autoRedirect && (isLoading || isAuthenticated)) {
		return (
			<main className="flex min-h-screen items-center justify-center">
				<div className="size-8 animate-spin rounded-full border-primary border-b-2" />
			</main>
		);
	}

	return <LandingView />;
}
