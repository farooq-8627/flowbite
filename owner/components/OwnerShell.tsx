"use client";

/**
 * Owner-panel shell — sidebar + topnav + scrollable main region.
 *
 * Mirrors the org dashboard shell shape (sidebar on the start side,
 * topnav above content) but is otherwise standalone — no providers, no
 * theme switching, no responsive collapse logic. The owner panel runs on
 * a single workstation typically; the rail simply hides on narrow
 * viewports.
 *
 * The shell mounts a minimal `sonner` Toaster (NOT the project's
 * `<Toaster>` wrapper from `components/ui/sonner.tsx`, which depends on
 * next-themes) so owner-panel mutations can surface success/error
 * feedback. The Toaster auto-positions and fires from the same `toast`
 * function used everywhere else.
 *
 * Spec: PLATFORM-OWNER-PANEL.md §3.1, §6.
 */
import type { ReactNode } from "react";
import { Toaster } from "sonner";
import { type OwnerProfile, OwnerProvider } from "./OwnerProvider";
import { OwnerSidebar } from "./OwnerSidebar";
import { OwnerTopNav } from "./OwnerTopNav";

export function OwnerShell({ profile, children }: { profile: OwnerProfile; children: ReactNode }) {
	return (
		<OwnerProvider profile={profile}>
			<div className="flex min-h-screen bg-background text-foreground">
				<OwnerSidebar />
				<div className="flex min-w-0 flex-1 flex-col">
					<OwnerTopNav />
					<main data-owner-scroll="true" className="flex-1 overflow-y-auto">
						<div className="mx-auto max-w-5xl px-6 py-6">{children}</div>
					</main>
				</div>
			</div>
			<Toaster position="bottom-right" closeButton richColors />
		</OwnerProvider>
	);
}
