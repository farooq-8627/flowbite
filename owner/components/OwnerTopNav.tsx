"use client";

/**
 * Owner-panel top nav — section title on the left, owner identity on the
 * right. No workspace switcher (no orgs here), no AI panel toggle (no org
 * context to chat about), no breadcrumbs (each section is a single
 * route).
 *
 * Spec: PLATFORM-OWNER-PANEL.md §3.1, §6.
 */
import { usePathname } from "next/navigation";
import { getActiveOwnerNavItem } from "../lib/ownerNav";
import { useOwnerProfile } from "./OwnerProvider";

export function OwnerTopNav() {
	const pathname = usePathname() ?? "";
	const active = getActiveOwnerNavItem(pathname);
	const profile = useOwnerProfile();
	const initials = (profile.name ?? profile.email).slice(0, 2).toUpperCase();

	return (
		<header className="flex h-14 items-center justify-between gap-3 border-b border-border bg-background/90 px-6 backdrop-blur">
			<div className="flex flex-col">
				<span className="text-xs uppercase tracking-wide text-muted-foreground">
					Platform owner
				</span>
				<h1 className="text-sm font-semibold leading-tight">
					{active?.label ?? "Owner panel"}
				</h1>
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
