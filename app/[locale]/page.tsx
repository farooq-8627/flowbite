"use client";

import { useConvexAuth, useQuery } from "convex/react";
import { redirect, useSearchParams } from "next/navigation";
import { api } from "@/convex/_generated/api";

/**
 * Root page — redirects authenticated users to their org dashboard.
 *
 * Decision tree (top to bottom):
 *   1. Auth still loading → spinner.
 *   2. Not authenticated → /signin immediately (no DB queries needed).
 *   3. Pending invitation redirect → send to /join/<token> before onboarding.
 *   4. User / orgs still loading → spinner (auth settled, waiting on data).
 *   5. No org / onboarding incomplete → /onboarding.
 *   6. Has org + onboarding complete → /[slug].
 *
 * FIX 2026-05-22: Both `currentUser` and `myOrgs` are now gated on
 * `isAuthenticated` — previously `users.queries.me` fired unconditionally,
 * threw `Unauthorized` when not authenticated, and crashed the page via
 * the error boundary instead of redirecting to /signin.
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

	// Both queries gated on auth — they return undefined (skip) until auth
	// is confirmed, which means no Unauthorized throws.
	const currentUser = useQuery(api.users.queries.me, isAuthenticated ? {} : "skip");
	const myOrgs = useQuery(api.orgs.queries.listMyOrgs, isAuthenticated ? {} : "skip");

	// ── Step 1: auth still resolving ──────────────────────────────────
	if (isLoading) {
		return (
			<main className="flex min-h-screen items-center justify-center">
				<div className="h-8 w-8 animate-spin rounded-full border-primary border-b-2" />
			</main>
		);
	}

	// ── Step 2: not authenticated — fast path, no DB wait ─────────────
	if (!isAuthenticated) {
		redirect("/signin");
	}

	// ── Step 3: pending join redirect (before onboarding check) ───────
	if (pendingRedirect) {
		redirect(pendingRedirect);
	}

	// ── Step 4: auth settled but DB queries still loading ─────────────
	if (currentUser === undefined || myOrgs === undefined) {
		return (
			<main className="flex min-h-screen items-center justify-center">
				<div className="h-8 w-8 animate-spin rounded-full border-primary border-b-2" />
			</main>
		);
	}

	// ── Step 5: profile deleted / no org / onboarding incomplete ──────
	if (!currentUser?.onboardingCompleted || myOrgs.length === 0) {
		redirect("/onboarding");
	}

	// ── Step 6: send to default org ───────────────────────────────────
	const defaultOrg = currentUser.defaultOrgId
		? myOrgs.find((m) => m.orgId === currentUser.defaultOrgId)
		: myOrgs[0];

	const slug = defaultOrg?.org.slug ?? myOrgs[0]?.org.slug;
	redirect(slug ? `/${slug}` : "/onboarding");
}
