/**
 * Error Boundary Component
 * STATUS: IMPLEMENTED
 * 
 * Catches React errors and prevents full-page crashes.
 * Logs errors to Sentry for monitoring and debugging.
 * 
 * Features:
 * - Catches rendering errors in child components
 * - Logs to Sentry with context
 * - Shows fallback UI on error
 * - Prevents error propagation
 * 
 * @see https://react.dev/reference/react/Component#catching-rendering-errors-with-an-error-boundary
 * @see components/errors/DashboardError.tsx for fallback UI
 * 
 * @example
 * <ErrorBoundary fallback={<DashboardError />}>
 *   <YourComponent />
 * </ErrorBoundary>
 */
"use client";

import React from "react";
import * as Sentry from "@sentry/nextjs";

interface Props {
	children: React.ReactNode;
	fallback: React.ReactNode;
}

interface State {
	hasError: boolean;
	error: Error | null;
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
		console.error("Error caught by boundary:", error, errorInfo);

		// Log to Sentry
		Sentry.captureException(error, {
			contexts: {
				react: {
					componentStack: errorInfo.componentStack,
				},
			},
		});
	}

	render() {
		if (this.state.hasError) {
			return this.props.fallback;
		}

		return this.props.children;
	}
}
