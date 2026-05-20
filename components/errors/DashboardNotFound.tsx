/**
 * DashboardNotFound — friendly 404 UI shown when `notFound()` is invoked
 * inside the dashboard segment, OR when an unmatched URL hits the locale
 * root. Pair with `app/[locale]/not-found.tsx` and segment-scoped
 * `not-found.tsx` files.
 *
 * Visual language matches `DashboardError` — calm icon, headline, supporting
 * copy, recovery actions — so the experience feels coherent regardless of
 * which boundary fires.
 *
 * Notes:
 * - `not-found.tsx` is rendered as a Server Component by default and does NOT
 *   receive props (no `params`/`searchParams`). To show the requested path
 *   we read `usePathname()` from a tiny client subcomponent — kept inline so
 *   the page stays a single file.
 * - The component is intentionally `"use client"` so the recovery buttons
 *   can call `window.history.back()` and `window.location.reload()`.
 */

"use client";

import { CompassIcon, HomeIcon } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";

interface DashboardNotFoundProps {
	/**
	 * Where the "Go to dashboard" button should point. Defaults to "/" which
	 * triggers the root redirect to the user's default org. Pages mounted
	 * inside an org segment can pass `/{orgSlug}` for a tighter recovery.
	 */
	homeHref?: string;
	/** Override the headline copy when needed (e.g. `Org not found`). */
	title?: string;
	/** Override the supporting copy. */
	description?: string;
}

export function DashboardNotFound({
	homeHref = "/",
	title = "Page not found",
	description,
}: DashboardNotFoundProps = {}) {
	const pathname = usePathname();
	const router = useRouter();

	const fallbackDescription =
		"The page you're looking for doesn't exist, was moved, or you don't have access. Double-check the address or jump back to a known page.";

	return (
		<div
			data-page="not-found"
			className="flex min-h-[60vh] w-full items-center justify-center p-6"
		>
			<div className="flex w-full max-w-md flex-col items-center gap-4 text-center">
				<div className="flex size-12 items-center justify-center rounded-full bg-muted">
					<CompassIcon className="size-6 text-muted-foreground" aria-hidden />
				</div>

				<div className="space-y-1.5">
					<h1 className="text-xl font-semibold tracking-tight">{title}</h1>
					<p className="text-sm text-muted-foreground">
						{description ?? fallbackDescription}
					</p>
					{pathname && (
						<p className="pt-1 text-[11px] text-muted-foreground/80">
							Requested:{" "}
							<code className="rounded-[calc(var(--radius)-2px)] bg-muted px-1.5 py-0.5 font-mono text-[11px]">
								{pathname}
							</code>
						</p>
					)}
				</div>

				<div className="flex flex-wrap items-center justify-center gap-2 pt-1">
					<Button asChild size="sm" className="gap-1.5">
						<Link href={homeHref}>
							<HomeIcon className="size-3.5" aria-hidden />
							Go to dashboard
						</Link>
					</Button>
					<Button
						size="sm"
						variant="ghost"
						onClick={() => router.back()}
						className="gap-1.5"
					>
						Go back
					</Button>
				</div>
			</div>
		</div>
	);
}
