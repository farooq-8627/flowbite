/**
 * PostHogProvider — wraps @posthog/next for analytics, feature flags, and pageview tracking.
 *
 * HOW IT WORKS:
 *   `PostHogProvider` from @posthog/next is a React Server Component (RSC).
 *   It reads the PostHog identity cookie server-side, bootstraps feature flags via posthog-node,
 *   and passes results to the client to eliminate first-render flag flicker.
 *   `PostHogPageView` (client component) automatically tracks App Router route changes.
 *
 * IMPORTANT:
 *   NO "use client" here — @posthog/next's PostHogProvider is exported only from the server
 *   bundle (react-server condition). Adding "use client" would make Next.js resolve the client
 *   bundle which does NOT export PostHogProvider, causing a build error.
 *
 *   Our env var is NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN; @posthog/next looks for NEXT_PUBLIC_POSTHOG_KEY.
 *   We pass apiKey explicitly so the package uses our var.
 *
 *   Because this is an RSC, every value passed to <PHProvider /> via `clientOptions` MUST be
 *   serialisable. Functions (e.g. `before_send`) cannot cross the server→client boundary —
 *   they must be registered on the client side after init. See `PostHogOwnerPanelGuard`.
 *
 * OWNER-PANEL EXCLUSION (Stage 3 — 2026-05-27):
 *   Owner-panel paths are excluded from PostHog. The middleware sets a non-secret cookie
 *   `is_owner_panel=1` on every owner-panel rewrite. `PostHogOwnerPanelGuard` (client) reads
 *   `document.cookie` and registers a `before_send` callback that returns `null` (drops the
 *   event) when the cookie is present. This keeps the public slug out of the JS bundle
 *   (locked decision §9.3).
 *
 * USAGE:
 *   Wraps root layout. Use `usePostHog()`, `useFeatureFlag()` in client components.
 *
 * Sources:
 * - node_modules/@posthog/next/README.md — official App Router setup (PostHogProvider is async RSC)
 * - node_modules/@posthog/next/dist/app/PostHogProvider.js — implementation reference
 * - PLATFORM-OWNER-PANEL.md §9 — telemetry exclusion contract
 */

import { PostHogProvider as PHProvider, PostHogPageView } from "@posthog/next";
import { type ReactNode, Suspense } from "react";
import { PostHogOwnerPanelGuard } from "./PostHogOwnerPanelGuard";

export function PostHogProvider({ children }: { children: ReactNode }) {
	const apiKey = process.env.NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN;

	if (!apiKey) {
		return <>{children}</>;
	}

	return (
		<PHProvider
			apiKey={apiKey}
			clientOptions={{
				api_host: "/ingest",
				ui_host: "https://us.posthog.com",
				defaults: "2026-01-30",
				capture_exceptions: true,
				debug: process.env.NODE_ENV === "development",
				// `before_send` lives on the client (registered by PostHogOwnerPanelGuard)
				// because RSCs cannot serialise functions across the server→client boundary.
			}}
			bootstrapFlags
		>
			<PostHogOwnerPanelGuard />
			<Suspense fallback={null}>
				<PostHogPageView />
			</Suspense>
			{children}
		</PHProvider>
	);
}
