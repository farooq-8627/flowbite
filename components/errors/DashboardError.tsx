/**
 * DashboardError — friendly fallback for both the React `<ErrorBoundary>`
 * and the App Router `error.tsx` boundary.
 *
 * Top section is the production-grade UI: icon, calm headline, recovery
 * actions. The raw error message + stack trace are tucked into a collapsed
 * `<details>` so users can copy them when reporting an issue, but they're
 * not the first thing the user sees.
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
		// inspecting prod via the browser devtools.
		// eslint-disable-next-line no-console
		console.error("[DashboardError]", {
			name: error.name,
			message: error.message,
			digest: error.digest,
			stack: error.stack,
			cause: (error as { cause?: unknown }).cause,
		});
	}, [error]);

	const errorMessage = error?.message;
	const stackText = error?.stack;
	const digest = error?.digest;

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
						notified.
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

				{(errorMessage || stackText || digest) && (
					<details className="mt-2 w-full overflow-hidden rounded-[var(--radius)] border bg-muted/40 text-start">
						<summary className="cursor-pointer select-none px-3 py-1.5 text-[11px] font-medium text-muted-foreground hover:text-foreground">
							Technical details
							{digest ? (
								<span className="ms-2 font-mono text-[10px] opacity-70">
									digest: {digest}
								</span>
							) : null}
						</summary>
						<div className="border-t bg-muted/30">
							{errorMessage && (
								<pre className="max-h-32 overflow-auto whitespace-pre-wrap break-words px-3 py-2 text-[11px] text-foreground">
									{errorMessage}
								</pre>
							)}
							{stackText && (
								<pre className="max-h-56 overflow-auto whitespace-pre-wrap break-words border-t px-3 py-2 font-mono text-[10px] text-muted-foreground">
									{stackText}
								</pre>
							)}
						</div>
					</details>
				)}
			</div>
		</div>
	);
}
