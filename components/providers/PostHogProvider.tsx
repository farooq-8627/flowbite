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
 * USAGE:
 *   Wraps root layout. Use `usePostHog()`, `useFeatureFlag()` in client components.
 *
 * Sources:
 * - node_modules/@posthog/next/README.md — official App Router setup (PostHogProvider is async RSC)
 * - node_modules/@posthog/next/dist/app/PostHogProvider.js — implementation reference
 */

import { PostHogProvider as PHProvider, PostHogPageView } from "@posthog/next";
import { Suspense, type ReactNode } from "react";

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
			}}
			bootstrapFlags
		>
			<Suspense fallback={null}>
				<PostHogPageView />
			</Suspense>
			{children}
		</PHProvider>
	);
}
