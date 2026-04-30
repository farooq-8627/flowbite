/**
 * Dashboard Error Fallback
 * STATUS: IMPLEMENTED
 * 
 * Shown when an error occurs in the dashboard layout.
 * Provides user-friendly error message and recovery options.
 * 
 * Features:
 * - User-friendly error message
 * - Reload page button
 * - Go back button
 * - Error icon
 * 
 * @see components/ErrorBoundary.tsx for error boundary implementation
 * 
 * @example
 * <ErrorBoundary fallback={<DashboardError />}>
 *   <Dashboard />
 * </ErrorBoundary>
 */
"use client";

import { Button } from "@/components/ui/button";
import { AlertCircle } from "lucide-react";

export function DashboardError() {
	return (
		<div className="flex h-screen items-center justify-center">
			<div className="flex max-w-md flex-col items-center gap-4 text-center">
				<AlertCircle className="h-12 w-12 text-destructive" />
				<h1 className="text-2xl font-bold">Something went wrong</h1>
				<p className="text-muted-foreground">
					We encountered an error while loading the dashboard. Our team has been notified and is
					working on a fix.
				</p>
				<div className="flex gap-2">
					<Button onClick={() => window.location.reload()}>Reload Page</Button>
					<Button variant="outline" onClick={() => window.history.back()}>
						Go Back
					</Button>
				</div>
			</div>
		</div>
	);
}
