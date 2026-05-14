"use client";

/**
 * App Router error boundary for the private shell.
 *
 * The React `<ErrorBoundary>` inside layout.tsx catches synchronous render
 * errors. This file is Next.js's OWN boundary — it catches errors thrown from
 * server components, async loaders, and `notFound()` escapes that the React
 * boundary misses.
 *
 * Both boundaries share the same fallback (`<DashboardError>`), which — for
 * now — dumps the raw error so we can diagnose production issues instead of
 * seeing `NEXT_HTTP_ERROR_FALLBACK;404`.
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
