"use client";

/**
 * Owner-panel top nav — section title on the left, owner identity on the
 * right. No workspace switcher (no orgs here), no AI panel toggle (no org
 * context to chat about), no breadcrumbs (each section is a single
 * route).
 *
 * **Mobile** (added 2026-05-30 per user report). On `<md` screens the
 * nav grows a hamburger button on the start side that opens the mobile
 * sidebar sheet. The open state lives in `<OwnerShell>` and is passed
 * down via the `onOpenSidebar` callback so this component stays
 * stateless. The button is hidden at `md+` because the static sidebar
 * rail is visible there.
 *
 * Spec: PLATFORM-OWNER-PANEL.md §3.1, §6.
 */
import { Menu } from "lucide-react";
import { usePathname } from "next/navigation";
import { Button } from "@/components/ui/button";
import { getActiveOwnerNavItem } from "../lib/ownerNav";
import { useOwnerProfile } from "./OwnerProvider";

type OwnerTopNavProps = {
	/** Open the mobile sidebar sheet. Owned by `<OwnerShell>`. */
	onOpenSidebar: () => void;
};

export function OwnerTopNav({ onOpenSidebar }: OwnerTopNavProps) {
	const pathname = usePathname() ?? "";
	const active = getActiveOwnerNavItem(pathname);
	const profile = useOwnerProfile();
	const initials = (profile.name ?? profile.email).slice(0, 2).toUpperCase();

	return (
		<header className="flex h-14 items-center justify-between gap-3 border-b border-border bg-background/90 px-4 backdrop-blur sm:px-6">
			<div className="flex min-w-0 items-center gap-2">
				{/* Mobile-only hamburger — opens the sidebar sheet. */}
				<Button
					type="button"
					variant="ghost"
					size="icon"
					className="-ms-2 size-9 md:hidden"
					onClick={onOpenSidebar}
					aria-label="Open navigation"
				>
					<Menu className="size-5" aria-hidden />
				</Button>
				<div className="flex min-w-0 flex-col">
					<span className="text-xs uppercase tracking-wide text-muted-foreground">
						Platform owner
					</span>
					<h1 className="truncate text-sm font-semibold leading-tight">
						{active?.label ?? "Owner panel"}
					</h1>
				</div>
			</div>
			<div className="flex items-center gap-3 text-sm">
				<div className="hidden text-end leading-tight md:block">
					<p className="font-medium">{profile.name ?? profile.email}</p>
					{profile.name ? (
						<p className="text-xs text-muted-foreground">{profile.email}</p>
					) : null}
				</div>
				<div
					aria-hidden
					className="flex h-8 w-8 items-center justify-center rounded-full bg-foreground text-xs font-semibold text-background"
				>
					{profile.avatarUrl ? (
						// biome-ignore lint/performance/noImgElement: Avatar URLs may be from arbitrary OAuth providers — Next/Image's loader config doesn't cover them. The image is small (32px) so optimisation is negligible.
						<img
							src={profile.avatarUrl}
							alt=""
							className="h-full w-full rounded-full object-cover"
						/>
					) : (
						<span>{initials}</span>
					)}
				</div>
			</div>
		</header>
	);
}
