/**
 * DashboardNotFound — friendly 404 UI shown when `notFound()` is invoked
 * inside the dashboard segment, OR when an unmatched URL hits the locale
 * root. Pair with `app/[locale]/not-found.tsx` and segment-scoped
 * `not-found.tsx` files.
 *
 * Visual language matches `DashboardError` — calm icon, headline, supporting
 * copy, recovery actions — so the experience feels coherent regardless of
 * which boundary fires. The redesign (2026-05-30) leans into a more
 * delightful, less clinical surface: a big stylised "404" set against a
 * subtle gradient blob, a friendly explanation of WHY this happens, and a
 * short list of common recovery paths. The component API stays stable
 * (`homeHref`, `title`, `description`) so both surfaces (locale-level and
 * org-scoped) keep working without changes.
 *
 * Notes:
 * - `not-found.tsx` is rendered as a Server Component by default and does NOT
 *   receive props (no `params`/`searchParams`). To show the requested path
 *   we read `usePathname()` from a tiny client subcomponent — kept inline so
 *   the page stays a single file.
 * - The component is intentionally `"use client"` so the recovery buttons
 *   can call `router.back()` and read the current pathname.
 * - All paddings/margins use logical properties (`ms-*` / `me-*`) per the
 *   project's RTL rule. Border-radius uses `rounded-[var(--radius)]` so the
 *   surface respects the workspace's chosen radius.
 */

"use client";

import { ArrowLeftIcon, CompassIcon, HomeIcon, SearchIcon } from "lucide-react";
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
		"The page you're looking for doesn't exist, was moved, or you don't have access to it. Don't worry — let's get you back on track.";

	return (
		<div
			data-page="not-found"
			className="relative flex min-h-[80vh] w-full items-center justify-center overflow-hidden p-6"
		>
			{/*
			  Decorative background — soft radial gradient blob behind the
			  card. Hidden from screen readers (`aria-hidden`). Subtle in
			  light mode, slightly stronger in dark mode for depth.
			*/}
			<div
				aria-hidden
				className="-z-10 pointer-events-none absolute inset-0 flex items-center justify-center"
			>
				<div className="size-[42rem] max-w-full rounded-full bg-gradient-to-br from-primary/10 via-primary/5 to-transparent blur-3xl dark:from-primary/15 dark:via-primary/8" />
			</div>

			<div className="relative flex w-full max-w-xl flex-col items-center gap-6 text-center">
				{/*
				  Big, friendly "404" — gradient text + decorative compass
				  icon nestled in the middle of the zero. The compass nods
				  to the existing 404 component while the giant numerals
				  give the page a personality boost.
				*/}
				<div className="relative flex items-center justify-center" aria-hidden>
					<span className="bg-gradient-to-br from-primary to-primary/40 bg-clip-text font-bold text-[8rem] leading-none tracking-tight text-transparent sm:text-[10rem]">
						4
						<span className="relative inline-block">
							{/* The "0" — keep it the same gradient, but layer the icon on top */}
							<span aria-hidden>0</span>
							<span className="-translate-x-1/2 -translate-y-1/2 absolute top-1/2 left-1/2">
								<span className="flex size-12 items-center justify-center rounded-full border-4 border-background bg-primary/15 sm:size-16">
									<CompassIcon
										className="size-6 text-primary sm:size-8"
										aria-hidden
									/>
								</span>
							</span>
						</span>
						4
					</span>
				</div>

				{/* Headline + body copy */}
				<div className="space-y-2">
					<h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">{title}</h1>
					<p className="mx-auto max-w-md text-balance text-sm text-muted-foreground sm:text-base">
						{description ?? fallbackDescription}
					</p>
					{pathname && (
						<p className="pt-1 text-[11px] text-muted-foreground/80">
							You tried to reach{" "}
							<code className="rounded-[calc(var(--radius)-2px)] bg-muted px-1.5 py-0.5 font-mono text-[11px]">
								{pathname}
							</code>
						</p>
					)}
				</div>

				{/* Primary recovery actions */}
				<div className="flex flex-wrap items-center justify-center gap-2 pt-1">
					<Button asChild size="default" className="gap-1.5">
						<Link href={homeHref}>
							<HomeIcon className="size-4" aria-hidden />
							Take me home
						</Link>
					</Button>
					<Button
						size="default"
						variant="outline"
						onClick={() => router.back()}
						className="gap-1.5"
					>
						<ArrowLeftIcon className="size-4" aria-hidden />
						Go back
					</Button>
				</div>

				{/* Helpful tips — not a navigation list (we don't know the
				    org slug here, can't deep-link), just orientation copy. */}
				<div className="w-full max-w-md rounded-[var(--radius)] border border-border/60 bg-card/50 p-4 text-start">
					<p className="mb-2 flex items-center gap-1.5 text-xs font-medium text-foreground/80">
						<SearchIcon className="size-3.5 text-muted-foreground" aria-hidden />
						Some things you can try
					</p>
					<ul className="space-y-1.5 text-xs text-muted-foreground">
						<li className="flex items-start gap-2">
							<span
								aria-hidden
								className="mt-1 size-1 shrink-0 rounded-full bg-muted-foreground/60"
							/>
							<span>
								Check the URL for typos — workspace slugs are case-sensitive.
							</span>
						</li>
						<li className="flex items-start gap-2">
							<span
								aria-hidden
								className="mt-1 size-1 shrink-0 rounded-full bg-muted-foreground/60"
							/>
							<span>
								If a teammate shared this link, ask them to confirm you have access.
							</span>
						</li>
						<li className="flex items-start gap-2">
							<span
								aria-hidden
								className="mt-1 size-1 shrink-0 rounded-full bg-muted-foreground/60"
							/>
							<span>
								Use the workspace switcher in the sidebar to jump back to a familiar
								page.
							</span>
						</li>
					</ul>
				</div>
			</div>
		</div>
	);
}
