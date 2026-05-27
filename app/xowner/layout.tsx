import type { Metadata } from "next";
import "../[locale]/globals.css";
import {
	ConvexAuthNextjsServerProvider,
	convexAuthNextjsToken,
} from "@convex-dev/auth/nextjs/server";
import { fetchQuery } from "convex/nextjs";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import ConvexClientProvider from "@/components/ConvexClientProvider";
import { api } from "@/convex/_generated/api";

/**
 * Owner-panel root layout.
 *
 * **Why this is a SEPARATE root layout from `app/[locale]/layout.tsx`.**
 * The owner panel is intentionally outside the i18n segment (locked decision
 * L9 — English-only) and excluded from telemetry (L10). Reusing the locale
 * layout would inherit next-intl, theme cookies, font registry, PostHog, and
 * the dashboard-specific provider stack — none of which the panel needs.
 *
 * **Three gates run in this OUTER layout** (layers 1–3 of the spec). The
 * fourth gate (OTP cookie) is enforced by `(gated)/layout.tsx` so the
 * `auth/page.tsx` route can run without the OTP requirement (otherwise the
 * panel would redirect-loop on its own auth page).
 *
 *   1. Slug match — already enforced by middleware. If we got rendered, the
 *      slug matched (or someone direct-hit `/xowner` and the middleware
 *      blocked them).
 *   2. Authenticated — `convexAuthNextjsToken()` returns undefined if the
 *      user isn't signed in; we call `notFound()` rather than redirecting
 *      to signin so the panel's existence isn't confirmed.
 *   3. Email allow-list + super-admin role — `getOwnerProfile` query throws
 *      `SUPER_ADMIN_REQUIRED` from `requirePlatformOwner` if either fails.
 *
 * Spec: PLATFORM-OWNER-PANEL.md §2 (access control), §3.1 (folder layout),
 * §10 stage 0 + stage 1 + stage 2.
 */

export const metadata: Metadata = {
	title: "Platform Owner",
	description: "Platform owner control surface.",
	robots: { index: false, follow: false, nocache: true },
};

// Owner-panel pages must never be cached. We also re-validate the gate on
// every request — Convex query results would otherwise be cached too long.
export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function OwnerLayout({ children }: Readonly<{ children: ReactNode }>) {
	// Layer 2 — auth token must exist. Without a session we can't even
	// attempt the role check; bail to 404 so an attacker can't distinguish
	// "panel exists but I'm not signed in" from "panel doesn't exist".
	const token = await convexAuthNextjsToken();
	if (!token) notFound();

	// Layer 3 — role + email allow-list. `getOwnerProfile` throws if either
	// check fails. Catch and 404 so the response is identical to a non-
	// owner hitting the slug. NOTE: even the auth page runs this — we
	// don't want to send OTP codes to anyone who hasn't passed layers 2-3.
	try {
		await fetchQuery(api._platform.auth.queries.getOwnerProfile, {}, { token });
	} catch {
		notFound();
	}

	return (
		<ConvexAuthNextjsServerProvider>
			<html lang="en" dir="ltr" suppressHydrationWarning>
				<head>
					{/*
					  Owner-panel pages are explicitly NOT indexed and must not
					  be cached by browsers or CDNs. The middleware sets
					  `Cache-Control: no-store` and `X-Robots-Tag: noindex`;
					  this meta tag backstops the headers on naive crawlers.
					*/}
					<meta name="robots" content="noindex, nofollow, noarchive" />
				</head>
				<body className="min-h-screen bg-background font-sans antialiased">
					<ConvexClientProvider>{children}</ConvexClientProvider>
				</body>
			</html>
		</ConvexAuthNextjsServerProvider>
	);
}
