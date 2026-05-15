"use client";

import { useConvexAuth, useQuery } from "convex/react";
import { redirect } from "next/navigation";
import { api } from "@/convex/_generated/api";

/**
 * Root page — redirects authenticated users to their org dashboard.
 * - Has org + onboarding complete → /[slug]
 * - Has org but onboarding incomplete → /onboarding
 * - No org → /onboarding
 * - Not authenticated → /signin (handled by middleware, but guarded here too)
 *
 * Uses render-time redirect() instead of useEffect + router.replace()
 * for instant navigation without an extra render cycle.
 */
export default function Home() {
	const { isAuthenticated, isLoading } = useConvexAuth();
	const currentUser = useQuery(api.users.queries.me);
	const myOrgs = useQuery(api.orgs.queries.listMyOrgs, isAuthenticated ? {} : "skip");

	// Still loading auth or data — show spinner
	if (isLoading || currentUser === undefined || myOrgs === undefined) {
		return (
			<main className="flex min-h-screen items-center justify-center">
				<div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
			</main>
		);
	}

	if (!isAuthenticated || currentUser === null) {
		redirect("/signin");
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
