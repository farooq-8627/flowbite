import * as Sentry from "@sentry/nextjs";

// PostHog is initialized by PostHogProvider (components/providers/PostHogProvider.tsx)
// via @posthog/next's ClientPostHogProvider. Initializing here would cause a double-init
// conflict. All posthog options (capture_exceptions, debug, etc.) are passed via
// PostHogProvider's clientOptions prop.

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
