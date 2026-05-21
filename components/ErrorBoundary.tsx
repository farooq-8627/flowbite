/**
 * Error Boundary Component
 *
 * Catches React errors in child components and logs them to Sentry.
 *
 * IMPORTANT — Next.js navigation signals
 * ──────────────────────────────────────
 * Next.js implements `redirect()`, `notFound()`, `permanentRedirect()`,
 * `forbidden()`, and `unauthorized()` by THROWING internal errors that the
 * framework's own boundaries unwind. A user-defined React error boundary
 * placed inside the App Router tree will otherwise catch those signals as
 * if they were real crashes and render its fallback — which is exactly the
 * "Something went wrong" symptom we hit when `<OnboardingGuard>` calls
 * `redirect("/onboarding")` for an invited user whose `onboardingCompleted`
 * was still `false`.
 *
 * The fix follows Next.js's own internal pattern (see
 * `next/dist/client/components/error-boundary.js::getDerivedStateFromError`)
 * — re-throw any router error from `getDerivedStateFromError` so React
 * propagates it up to the framework boundary that knows how to handle it.
 * `unstable_rethrow` is the public API for this check (it covers
 * `NEXT_REDIRECT`, `NEXT_NOT_FOUND`, `NEXT_HTTP_ERROR_FALLBACK;*`,
 * bailout-to-CSR, etc.) and is a no-op for ordinary errors.
 *
 * Fallback can be:
 *   - a React node (e.g. <DashboardError />) — rendered as-is on error
 *   - a component (e.g. DashboardError) — rendered with `{ error, reset }`
 *
 * The component form lets the fallback surface the real error for debugging.
 *
 * References
 * ──────────
 * - https://nextjs.org/docs/app/api-reference/functions/unstable_rethrow
 * - next/dist/client/components/error-boundary.js (canonical impl)
 */
"use client";

import * as Sentry from "@sentry/nextjs";
import { unstable_rethrow } from "next/navigation";
import React from "react";

type FallbackComponent = React.ComponentType<{
	error: Error & { digest?: string };
	reset: () => void;
}>;

interface Props {
	children: React.ReactNode;
	fallback: React.ReactNode | FallbackComponent;
}

interface State {
	hasError: boolean;
	error: (Error & { digest?: string }) | null;
}

export class ErrorBoundary extends React.Component<Props, State> {
	constructor(props: Props) {
		super(props);
		this.state = { hasError: false, error: null };
	}

	static getDerivedStateFromError(error: Error): State {
		// Pass through Next.js navigation signals (`redirect()`, `notFound()`,
		// `permanentRedirect()`, etc.). These are intentional control-flow
		// throws that the framework's own boundaries handle — catching them
		// here would render the error fallback instead of performing the
		// navigation.
		//
		// `unstable_rethrow` re-throws if the error is a router signal, and
		// is a no-op otherwise. Throwing from `getDerivedStateFromError`
		// propagates the error up to the next enclosing boundary, matching
		// Next.js's own ErrorBoundaryHandler behaviour.
		unstable_rethrow(error);
		return { hasError: true, error };
	}

	componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
		// Belt-and-suspenders: if anything slipped past `getDerivedStateFromError`
		// (e.g. a wrapped router error whose `cause` is a redirect signal),
		// re-throw it here too. `unstable_rethrow` walks the `cause` chain.
		unstable_rethrow(error);

		// Keep a full console trace so we can see the real cause in prod too.
		// eslint-disable-next-line no-console
		console.error("Error caught by boundary:", error, errorInfo);

		Sentry.captureException(error, {
			contexts: {
				react: {
					componentStack: errorInfo.componentStack,
				},
			},
		});
	}

	reset = () => {
		this.setState({ hasError: false, error: null });
	};

	render() {
		if (this.state.hasError && this.state.error) {
			const { fallback } = this.props;
			// Component form → pass error + reset for debugging.
			if (typeof fallback === "function") {
				const FallbackComp = fallback as FallbackComponent;
				return <FallbackComp error={this.state.error} reset={this.reset} />;
			}
			return fallback;
		}

		return this.props.children;
	}
}
