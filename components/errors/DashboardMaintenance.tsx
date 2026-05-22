"use client";

/**
 * DashboardMaintenance — friendly 503 / "we're updating" surface.
 *
 * Used for:
 *   - Scheduled maintenance windows (read from a feature flag on the shell).
 *   - Phase 3+ canary deploys when a route is temporarily disabled.
 *
 * Visual language matches DashboardError / DashboardNotFound /
 * DashboardUnauthorized for a coherent recovery experience.
 */

import { RefreshCwIcon, WrenchIcon } from "lucide-react";
import { Button } from "@/components/ui/button";

export function DashboardMaintenance() {
	return (
		<div
			data-page="maintenance"
			className="flex min-h-[60vh] w-full items-center justify-center p-6"
		>
			<div className="flex w-full max-w-md flex-col items-center gap-4 text-center">
				<div className="flex size-12 items-center justify-center rounded-full bg-blue-500/10">
					<WrenchIcon className="size-6 text-blue-600" aria-hidden />
				</div>
				<div className="space-y-1.5">
					<h1 className="text-xl font-semibold tracking-tight">We'll be right back</h1>
					<p className="text-sm text-muted-foreground">
						We're rolling out an update. This usually takes a couple of minutes —
						refresh the page in a moment.
					</p>
				</div>
				<Button size="sm" onClick={() => window.location.reload()} className="gap-1.5">
					<RefreshCwIcon className="size-3.5" aria-hidden />
					Reload
				</Button>
			</div>
		</div>
	);
}
