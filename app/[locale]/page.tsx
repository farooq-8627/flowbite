"use client";

import { useConvexAuth, useQuery } from "convex/react";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { api } from "@/convex/_generated/api";

/**
 * Root page — redirects authenticated users to their org dashboard.
 * - Has org + onboarding complete → /dashboard/[slug]
 * - Has org but onboarding incomplete → /onboarding
 * - No org → /onboarding
 * - Not authenticated → /signin
 */
export default function Home() {
  const { isAuthenticated, isLoading } = useConvexAuth();
  const router = useRouter();
  const currentUser = useQuery(api.users.queries.me);
  const myOrgs = useQuery(
    api.orgs.queries.listMyOrgs,
    isAuthenticated ? {} : "skip",
  );

  useEffect(() => {
    if (isLoading) return;

    if (!isAuthenticated) {
      router.replace("/signin");
      return;
    }

    if (!currentUser || myOrgs === undefined) return; // still loading

    if (!currentUser.onboardingCompleted || myOrgs.length === 0) {
      router.replace("/onboarding");
      return;
    }

    // Redirect to default org, or first org
    const defaultOrg = currentUser.defaultOrgId
      ? myOrgs.find((m) => m.orgId === currentUser.defaultOrgId)
      : myOrgs[0];

    const slug = defaultOrg?.org.slug ?? myOrgs[0]?.org.slug;
    if (slug) {
      router.replace(`/${slug}/dashboard`);
    } else {
      router.replace("/onboarding");
    }
  }, [isAuthenticated, isLoading, currentUser, myOrgs, router]);

  return (
    <main className="flex min-h-screen items-center justify-center">
      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
    </main>
  );
}
