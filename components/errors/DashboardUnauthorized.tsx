"use client";

/**
 * DashboardUnauthorized — friendly 401/403 surface.
 *
 * Use cases:
 *   - Member role hits an Owner-only Settings page.
 *   - Permission gate fails inside a route's server boundary.
 *   - `forbidden()` is invoked on a public route the caller can't see.
 *
 * Visual language matches `<DashboardError>` / `<DashboardNotFound>` so
 * recovery feels coherent regardless of which boundary fires.
 */

import { ArrowLeftIcon, LockKeyholeIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";

interface DashboardUnauthorizedProps {
	/** Optional reason — e.g. "You need 'org.billing' to access this page." */
	description?: string;
	/** Optional admin contact name to suggest in the recovery copy. */
	contactName?: string;
}

export function DashboardUnauthorized({
	description,
	contactName,
}: DashboardUnauthorizedProps = {}) {
	const router = useRouter();
	const fallback =
		"You don't have permission to view this page. If you think this is a mistake, ask your workspace admin.";

	return (
		<div
			data-page="unauthorized"
			className="flex min-h-[60vh] w-full items-center justify-center p-6"
		>
			<div className="flex w-full max-w-md flex-col items-center gap-4 text-center">
				<div className="flex size-12 items-center justify-center rounded-full bg-amber-500/10">
					<LockKeyholeIcon className="size-6 text-amber-600" aria-hidden />
				</div>
				<div className="space-y-1.5">
					<h1 className="text-xl font-semibold tracking-tight">Access denied</h1>
					<p className="text-sm text-muted-foreground">
						{description ?? fallback}
						{contactName ? ` Contact ${contactName} to request access.` : ""}
					</p>
				</div>
				<div className="flex flex-wrap items-center justify-center gap-2 pt-1">
					<Button size="sm" onClick={() => router.back()} className="gap-1.5">
						<ArrowLeftIcon className="size-3.5" aria-hidden />
						Go back
					</Button>
				</div>
			</div>
		</div>
	);
}
