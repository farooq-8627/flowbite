"use client";

/**
 * App Router error boundary for the private dashboard shell.
 *
 * The React `<ErrorBoundary>` inside `[orgSlug]/layout.tsx` catches synchronous
 * render errors. This file is Next.js's OWN boundary — it catches errors thrown
 * from server components and async loaders that the React boundary misses.
 *
 * `notFound()` calls inside the org segment are caught by
 * `[orgSlug]/not-found.tsx` (a friendly 404 UI inside the shell), so they
 * should NOT reach this boundary. If you ever see `NEXT_HTTP_ERROR_FALLBACK;404`
 * here it means a route hierarchy is missing its `not-found.tsx` — add one
 * rather than letting the digest leak into the error UI.
 *
 * Both boundaries share the same friendly fallback (`<DashboardError>`).
 */

import * as Sentry from "@sentry/nextjs";
import { useEffect } from "react";
import { DashboardError } from "@/components/errors/DashboardError";

export default function PrivateError({
	error,
	reset,
}: {
	error: Error & { digest?: string };
	reset: () => void;
}) {
	useEffect(() => {
		Sentry.captureException(error);
	}, [error]);

	return <DashboardError error={error} reset={reset} />;
}
