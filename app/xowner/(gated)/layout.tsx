import {
	ConvexAuthNextjsServerProvider,
	convexAuthNextjsToken,
} from "@convex-dev/auth/nextjs/server";
import { fetchQuery } from "convex/nextjs";
import { notFound, redirect } from "next/navigation";
import type { ReactNode } from "react";
import { api } from "@/convex/_generated/api";
import { readOwnerOtpCookie, verifyOwnerOtpCookie } from "@/lib/owner-otp-cookie";
import { OwnerShell } from "@/owner/components/OwnerShell";
import { ownerPublicPath } from "@/owner/lib/owner-public-prefix";

/**
 * Owner-panel **gated** layout.
 *
 * Sits inside the route group `app/xowner/(gated)/`. Every section that
 * exposes platform state (overview / users / tiers / etc.) lives under
 * this layout. The `auth/` route lives OUTSIDE the group so it can render
 * without the OTP cookie — otherwise the panel would redirect-loop on
 * its own auth page.
 *
 * Layer 4 (OTP cookie) of the layered access gate (PLATFORM-OWNER-PANEL.md
 * §2.3). The previous layers (auth + role + email allow-list) are checked
 * in the OUTER layout; we re-fetch the profile here to mount it in
 * `<OwnerShell>` (the layout boundary clears the previous layout's local
 * variables — Next.js' design contract).
 *
 * Cookie validation:
 *   - `owner_otp_verified` cookie must be present.
 *   - HMAC must verify against `OWNER_OTP_COOKIE_SECRET`.
 *   - The cookie's `userId` must match the authenticated user.
 *   - The cookie's `expiresAt` must still be in the future.
 *
 * Any failure → redirect to `OWNER_PATHS.auth` (the OTP entry page). The
 * redirect target stays inside the owner-panel route tree, so the URL
 * the user sees is the public slug-prefixed path.
 *
 * Spec: PLATFORM-OWNER-PANEL.md §10 stage 1-G + §2.3 layer 4.
 */
export default async function OwnerGatedLayout({ children }: Readonly<{ children: ReactNode }>) {
	// Layers 2 + 3 already ran in the outer layout. They throw on
	// failure, so by the time we get here the user is authenticated +
	// allow-listed. We still re-fetch the profile because Next.js
	// layouts can't share state across the boundary, and `<OwnerShell>`
	// needs the profile object.
	const token = await convexAuthNextjsToken();
	if (!token) notFound();

	let profile: Awaited<
		ReturnType<typeof fetchQuery<typeof api._platform.auth.queries.getOwnerProfile>>
	>;
	try {
		profile = await fetchQuery(api._platform.auth.queries.getOwnerProfile, {}, { token });
	} catch {
		notFound();
	}

	// Layer 4 — OTP cookie. Bound to the same userId as the auth token.
	const raw = await readOwnerOtpCookie();
	const verified = await verifyOwnerOtpCookie(raw, profile.userId as string);
	if (!verified) {
		// Redirect to the PUBLIC slug-prefixed auth path. Sending the
		// browser to the internal `/xowner/auth` would bounce off
		// middleware's direct-hit block (404). The middleware sets the
		// `x-owner-public-prefix` request header on every rewrite so
		// we can reconstruct the slug here without reading env.
		redirect(await ownerPublicPath("/auth"));
	}

	return (
		// The outer layout already opened ConvexAuthNextjsServerProvider; we
		// re-open here so this gated subtree still has `useAuthToken()`
		// available even if Next.js re-mounts the boundary.
		<ConvexAuthNextjsServerProvider>
			<OwnerShell profile={profile}>{children}</OwnerShell>
		</ConvexAuthNextjsServerProvider>
	);
}
