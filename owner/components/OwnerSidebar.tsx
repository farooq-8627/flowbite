"use client";

/**
 * Owner-panel sidebar — minimal left rail with the 8 static nav items.
 *
 * Intentionally NOT wrapping the org-aware `<Sidebar>` primitive: the
 * owner panel has no orgId, no resizable preferences, no workspace
 * switcher, no AI panel. A flat Tailwind layout matches the panel's
 * "thin admin tool" shape and avoids dragging org-context coupling into
 * the owner surface.
 *
 * **URL contract.** Link hrefs use the PUBLIC slug-prefixed path
 * (`/<slug>/users`, etc.), never the internal `/xowner/users` segment.
 * Middleware blocks direct hits on `/xowner/...`; client-side
 * navigations from `<Link>` go to whatever URL is in `href` and would
 * 404 if we used the internal path. The slug is recovered at runtime
 * via `useOwnerPublicPrefix` (reads `usePathname()`), so the slug never
 * lands in the JS bundle.
 *
 * **Mobile** (added 2026-05-30 per user report). The static `<aside>`
 * is hidden on `<md`; on mobile the same nav body is rendered inside a
 * Sheet (`side="start"` so it follows text direction in RTL). The
 * Sheet's open state is owned by `<OwnerShell>` so the trigger button
 * (a hamburger in `<OwnerTopNav>`) and this component share one source
 * of truth. Clicking any nav link auto-closes the sheet via
 * `onOpenChange(false)` so the user lands on the destination without a
 * lingering overlay.
 *
 * Spec: PLATFORM-OWNER-PANEL.md §3.1, §6.
 */
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
	Sheet,
	SheetContent,
	SheetDescription,
	SheetHeader,
	SheetTitle,
} from "@/components/ui/sheet";
import { useOwnerPublicPrefix } from "../hooks/useOwnerPublicPrefix";
import { OWNER_NAV } from "../lib/ownerNav";

type OwnerSidebarProps = {
	/** Mobile sheet open state — owned by `<OwnerShell>`. */
	mobileOpen: boolean;
	/** Mobile sheet open-state setter — owned by `<OwnerShell>`. */
	onMobileOpenChange: (open: boolean) => void;
};

export function OwnerSidebar({ mobileOpen, onMobileOpenChange }: OwnerSidebarProps) {
	return (
		<>
			{/* Desktop — static rail at md+. Identical content to the mobile sheet. */}
			<aside
				aria-label="Platform owner navigation"
				className="hidden w-60 flex-shrink-0 flex-col border-e border-border bg-muted/30 md:flex"
			>
				<div className="flex h-14 items-center px-4">
					<span className="text-sm font-semibold tracking-tight">Platform Owner</span>
					<span className="ms-2 rounded-[var(--radius)] bg-amber-500/10 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-amber-700 dark:text-amber-400">
						Internal
					</span>
				</div>
				<OwnerNavBody />
				<div className="border-t border-border px-4 py-3 text-xs text-muted-foreground">
					<p className="font-medium text-foreground">Hard scope</p>
					<p className="mt-1 leading-relaxed">
						Platform metadata only. No org content. To inspect inside an org, join it as
						a member.
					</p>
				</div>
			</aside>

			{/* Mobile — same nav body inside a slide-out sheet. Hidden at md+. */}
			<Sheet open={mobileOpen} onOpenChange={onMobileOpenChange}>
				<SheetContent
					side="start"
					className="flex w-72 flex-col gap-0 bg-muted p-0 md:hidden"
				>
					<SheetHeader className="border-b border-border px-4 py-3 text-start">
						<SheetTitle className="flex items-center gap-2 text-sm font-semibold tracking-tight">
							Platform Owner
							<span className="rounded-[var(--radius)] bg-amber-500/10 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-amber-700 dark:text-amber-400">
								Internal
							</span>
						</SheetTitle>
						<SheetDescription className="sr-only">
							Platform owner navigation
						</SheetDescription>
					</SheetHeader>
					<OwnerNavBody onNavigate={() => onMobileOpenChange(false)} />
					<div className="mt-auto border-t border-border px-4 py-3 text-xs text-muted-foreground">
						<p className="font-medium text-foreground">Hard scope</p>
						<p className="mt-1 leading-relaxed">
							Platform metadata only. No org content. To inspect inside an org, join
							it as a member.
						</p>
					</div>
				</SheetContent>
			</Sheet>
		</>
	);
}

/**
 * The shared nav body — used by both the desktop `<aside>` and the
 * mobile Sheet so the two surfaces stay in lockstep when the nav list
 * grows.
 *
 * `onNavigate` (optional) fires after a link click. The mobile sheet
 * passes a callback that flips its open state to `false`, so tapping a
 * link both navigates AND dismisses the sheet in one gesture.
 */
function OwnerNavBody({ onNavigate }: { onNavigate?: () => void }) {
	const pathname = usePathname() ?? "";
	const publicPrefix = useOwnerPublicPrefix();

	return (
		<nav className="flex-1 overflow-y-auto px-2 pb-4 pt-2">
			<ul className="space-y-0.5">
				{OWNER_NAV.map((item) => {
					// `item.href` is `/users`, `/tiers`, etc. — combine with
					// the public prefix at runtime so the browser-visible
					// URL is `/<slug>/users` (passes through middleware) and
					// not `/xowner/users` (blocked).
					const href = publicPrefix ? `${publicPrefix}${item.href}` : item.href;
					const active = pathname === href || pathname.startsWith(`${href}/`);
					const Icon = item.icon;
					return (
						<li key={item.href}>
							<Link
								href={href}
								onClick={onNavigate}
								className={[
									"flex items-center gap-2 rounded-[var(--radius)] px-3 py-2 text-sm transition-colors",
									active
										? "bg-foreground text-background"
										: "text-muted-foreground hover:bg-muted hover:text-foreground",
								].join(" ")}
							>
								<Icon className="h-4 w-4" aria-hidden />
								<span className="truncate">{item.label}</span>
							</Link>
						</li>
					);
				})}
			</ul>
		</nav>
	);
}
