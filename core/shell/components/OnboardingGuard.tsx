"use client";

import { useConvexAuth, useQuery } from "convex/react";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { api } from "@/convex/_generated/api";

/**
 * OnboardingGuard — redirects to /onboarding if the user hasn't completed it.
 *
 * Placed inside the dashboard layout so it runs on every dashboard page.
 * The middleware already handles unauthenticated → /signin, so we only
 * need to check onboardingCompleted here.
 */
export function OnboardingGuard({ children }: { children: React.ReactNode }) {
	const { isAuthenticated, isLoading } = useConvexAuth();
	const router = useRouter();
	const currentUser = useQuery(api.users.queries.me, isAuthenticated ? {} : "skip");

	useEffect(() => {
		if (isLoading || currentUser === undefined) return;
		if (!currentUser?.onboardingCompleted) {
			router.replace("/onboarding");
		}
	}, [isLoading, currentUser, router]);

	// Show nothing while checking — layout skeleton handles loading state
	if (isLoading || currentUser === undefined) return null;
	if (!currentUser?.onboardingCompleted) return null;

	return <>{children}</>;
}
