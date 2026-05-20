/**
 * DashboardError — friendly fallback for both the React `<ErrorBoundary>`
 * and the App Router `error.tsx` boundary.
 *
 * This is the **production-grade surface**: icon, calm headline, supporting
 * copy, recovery actions. We deliberately do NOT render the underlying
 * error message, stack trace, or digest in the UI — those leak request ids,
 * file paths, and "ConvexError" / "Uncaught" tokens that read like a
 * crash. Engineers can still inspect everything via:
 *   - the browser devtools console (we log the full error object below)
 *   - Sentry (`captureException` runs in `error.tsx` and `ErrorBoundary`)
 *
 * The "Try again" button calls the App Router-supplied `reset()` to retry
 * the failing render. "Reload page" hard-refreshes. "Go back" pops history.
 *
 * @see components/ErrorBoundary.tsx for the React-side boundary
 * @see app/[locale]/(private)/error.tsx for the App Router boundary
 */

"use client";

import { AlertCircleIcon, ArrowLeftIcon, RefreshCwIcon, RotateCwIcon } from "lucide-react";
import { useEffect } from "react";
import { Button } from "@/components/ui/button";

interface DashboardErrorProps {
	/** Error thrown by the child tree. Both React ErrorBoundary and App Router pass this. */
	error?: (Error & { digest?: string }) | null;
	/** Optional reset — App Router provides this; legacy React boundary does not. */
	reset?: () => void;
}

export function DashboardError({ error, reset }: DashboardErrorProps = {}) {
	useEffect(() => {
		if (!error) return;
		// Keep the full error in the console for engineers debugging in dev or
		// inspecting prod via the browser devtools. Sentry already captures it
		// upstream — this is a developer-affordance, not user-facing.
		// eslint-disable-next-line no-console
		console.error("[DashboardError]", {
			name: error.name,
			message: error.message,
			digest: error.digest,
			stack: error.stack,
			cause: (error as { cause?: unknown }).cause,
		});
	}, [error]);

	return (
		<div className="flex min-h-[60vh] w-full items-center justify-center p-6">
			<div className="flex w-full max-w-md flex-col items-center gap-4 text-center">
				<div className="flex size-12 items-center justify-center rounded-full bg-destructive/10">
					<AlertCircleIcon className="size-6 text-destructive" aria-hidden />
				</div>

				<div className="space-y-1.5">
					<h1 className="text-xl font-semibold tracking-tight">Something went wrong</h1>
					<p className="text-sm text-muted-foreground">
						We hit an unexpected problem while loading this page. The team has been
						notified and is looking into it.
					</p>
				</div>

				<div className="flex flex-wrap items-center justify-center gap-2 pt-1">
					{reset && (
						<Button size="sm" onClick={reset} className="gap-1.5">
							<RotateCwIcon className="size-3.5" aria-hidden />
							Try again
						</Button>
					)}
					<Button
						size="sm"
						variant="outline"
						onClick={() => window.location.reload()}
						className="gap-1.5"
					>
						<RefreshCwIcon className="size-3.5" aria-hidden />
						Reload page
					</Button>
					<Button
						size="sm"
						variant="ghost"
						onClick={() => window.history.back()}
						className="gap-1.5"
					>
						<ArrowLeftIcon className="size-3.5" aria-hidden />
						Go back
					</Button>
				</div>
			</div>
		</div>
	);
}
