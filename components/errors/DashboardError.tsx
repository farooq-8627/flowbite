/**
 * DashboardError — fallback for both the React ErrorBoundary and the
 * App Router `error.tsx` boundary.
 *
 * For now it SHOWS the real error (message, digest, and stack) so the user
 * can paste the exact cause back to us. We log the full error object to the
 * console as well. Once the app is stable we'll wrap this in a
 * prettier production surface.
 */
"use client";

import { AlertCircle, RefreshCwIcon } from "lucide-react";
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
		// Dump the whole error so the real cause is visible in dev + prod.
		// eslint-disable-next-line no-console
		console.error("[DashboardError]", {
			name: error.name,
			message: error.message,
			digest: error.digest,
			stack: error.stack,
			cause: (error as { cause?: unknown }).cause,
		});
	}, [error]);

	const errorText = error?.message ?? "Unknown error";
	const stackText = error?.stack ?? "";
	const digest = error?.digest;

	return (
		<div className="flex min-h-[60vh] w-full items-center justify-center p-6">
			<div className="w-full max-w-2xl space-y-4">
				<div className="flex items-center gap-3">
					<AlertCircle className="size-5 shrink-0 text-destructive" aria-hidden />
					<h1 className="text-base font-semibold">Something went wrong</h1>
				</div>

				<p className="text-xs text-muted-foreground">
					The real error is shown below so you can copy-paste it back to us. Once the app
					is stable we'll replace this with a friendlier page.
				</p>

				<div className="overflow-hidden rounded-[var(--radius)] border bg-muted/40">
					<div className="border-b bg-muted/60 px-3 py-1.5 text-[11px] font-medium text-muted-foreground">
						{error?.name ?? "Error"}
						{digest ? (
							<span className="ms-2 font-mono text-[10px] opacity-70">
								digest: {digest}
							</span>
						) : null}
					</div>
					<pre className="max-h-40 overflow-auto whitespace-pre-wrap break-words px-3 py-2 text-xs text-foreground">
						{errorText}
					</pre>
					{stackText && (
						<details className="border-t bg-muted/30 px-3 py-2 text-[11px] text-muted-foreground">
							<summary className="cursor-pointer select-none font-medium">
								Stack trace
							</summary>
							<pre className="mt-1.5 max-h-56 overflow-auto whitespace-pre-wrap break-words font-mono text-[10px]">
								{stackText}
							</pre>
						</details>
					)}
				</div>

				<div className="flex flex-wrap gap-2">
					{reset && (
						<Button size="sm" onClick={reset} className="gap-1.5">
							<RefreshCwIcon className="size-3.5" />
							Try again
						</Button>
					)}
					<Button
						size="sm"
						variant="outline"
						onClick={() => window.location.reload()}
						className="gap-1.5"
					>
						Reload page
					</Button>
					<Button size="sm" variant="ghost" onClick={() => window.history.back()}>
						Go back
					</Button>
				</div>
			</div>
		</div>
	);
}
