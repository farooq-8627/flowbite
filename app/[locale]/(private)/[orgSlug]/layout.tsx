import { convexAuthNextjsToken } from "@convex-dev/auth/nextjs/server";
import { fetchQuery } from "convex/nextjs";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { DashboardError } from "@/components/errors/DashboardError";
import { api } from "@/convex/_generated/api";
import { OnboardingGuard } from "@/core/shell/shell/components/OnboardingGuard";
import { DashboardLayout } from "@/core/shell/shell/layouts/DashboardLayout";

/**
 * Org-scoped dashboard layout.
 *
 * SERVER-SIDE MEMBERSHIP GATE (added 2026-05-30)
 * ──────────────────────────────────────────────
 * If a signed-in user types another workspace's slug into the URL bar
 * (e.g. they're a member of `/orbitly` but navigate to `/reimaginy`),
 * we used to render the dashboard chrome with empty content — the
 * client `<OrgProvider>` couldn't resolve the slug → no `orgId` →
 * every child query stayed `"skip"` → the shell looked broken AND
 * subtly leaked "this slug looks like it might be valid" via the
 * mere fact that the chrome rendered.
 *
 * The fix here is defence-in-depth on the server boundary:
 *   1. `convexAuthNextjsToken()` reads the JWT cookie. If absent,
 *      the (private)/layout.tsx client guard handles the redirect
 *      to /signin — we don't try to enumerate orgs without auth.
 *   2. With a token, fetch `listMyOrgs` (the canonical query that
 *      ONLY returns the caller's own orgs). If `orgSlug` isn't in
 *      that list → `notFound()`.
 *
 * NO INFORMATION LEAK — `listMyOrgs` returns the same shape whether
 * `reimaginy` exists or not (it never queries the org table by slug);
 * an attacker probing for valid org slugs cannot distinguish "this
 * org doesn't exist" from "this org exists but I'm not a member".
 * Both render the locale-level 404 page.
 *
 * NEXT.JS NOT-FOUND ROUTING — calling `notFound()` here (in the
 * layout itself, NOT in a child) bubbles to the closest ANCESTOR
 * `not-found.tsx`, which is `app/[locale]/not-found.tsx`. That
 * renders a clean 404 with no dashboard chrome, which is exactly
 * what we want for "this workspace isn't yours". The sibling
 * `[orgSlug]/not-found.tsx` only fires when `notFound()` is called
 * from a child page (e.g. an entity-id route) — those still render
 * inside the dashboard shell so the user keeps navigation context.
 */
export default async function Layout({
	children,
	params,
}: Readonly<{
	children: ReactNode;
	params: Promise<{ orgSlug: string }>;
}>) {
	const { orgSlug } = await params;

	// Resolve auth + membership state outside any try-around-notFound() —
	// `notFound()` throws an error with `digest === "NEXT_NOT_FOUND"` that
	// MUST propagate up to Next.js's framework boundary. Wrapping it in a
	// try/catch swallows the special signal and falls through to a normal
	// render (broken UX). So we compute the boolean first, then call
	// `notFound()` outside the try.
	let authChecked = false;
	let isMember = false;
	try {
		const token = await convexAuthNextjsToken();
		if (token) {
			const myOrgs = await fetchQuery(api.orgs.queries.listMyOrgs, {}, { token });
			isMember = (myOrgs ?? []).some((entry) => entry.org.slug === orgSlug);
			authChecked = true;
		}
	} catch {
		// Auth or network failure — defer to the client-side `<PrivateLayout>`
		// which will render `null` then redirect to `/signin`. We do NOT
		// `notFound()` here because that would surface a 404 for a transient
		// network blip, which is the wrong UX.
	}

	if (authChecked && !isMember) {
		notFound();
	}

	return (
		<ErrorBoundary fallback={DashboardError}>
			<OnboardingGuard>
				<DashboardLayout orgSlug={orgSlug}>{children}</DashboardLayout>
			</OnboardingGuard>
		</ErrorBoundary>
	);
}
