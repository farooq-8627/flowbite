/**
 * Error Boundary Component
 *
 * Catches React errors in child components and logs them to Sentry.
 *
 * Fallback can be:
 *   - a React node (e.g. <DashboardError />) — rendered as-is on error
 *   - a component (e.g. DashboardError) — rendered with `{ error, reset }`
 *
 * The component form lets the fallback surface the real error for debugging.
 */
"use client";

import * as Sentry from "@sentry/nextjs";
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
		return { hasError: true, error };
	}

	componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
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
