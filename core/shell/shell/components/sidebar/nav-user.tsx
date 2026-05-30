"use client";

import { useAuthActions } from "@convex-dev/auth/react";
import { Bell, CircleUser, CreditCard, LogOut, Settings } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuGroup,
	DropdownMenuItem,
	DropdownMenuLabel,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
	SidebarMenu,
	SidebarMenuButton,
	SidebarMenuItem,
	useSidebar,
} from "@/components/ui/sidebar";
import { Skeleton } from "@/components/ui/skeleton";
import { useMe, useOrgPermissions } from "@/core/shell/shared/hooks/useCurrentOrg";
import { getInitials } from "@/lib/utils";

/**
 * NavUser — bottom-of-sidebar user menu.
 *
 * Items
 * ─────
 *   - Account       → /{orgSlug}/settings?group=workspace§ion=workspace.profile
 *   - Notifications → /{orgSlug}/notifications  (full notifications page)
 *   - Billing       → /{orgSlug}/settings?group=billing
 *                     RBAC-gated on `org.viewBilling` (default Owner only).
 *                     Hidden for Admins / Members / Viewers without the
 *                     permission, matching the settings sidebar gating in
 *                     ShellLayout.
 *   - Settings      → /{orgSlug}/settings
 *   - Log out       → signOut()
 */
export function NavUser({ orgSlug }: { orgSlug?: string }) {
	const { isMobile } = useSidebar();
	const { signOut } = useAuthActions();
	const router = useRouter();
	const user = useMe();
	const permissions = useOrgPermissions();

	if (user === undefined) {
		return (
			<SidebarMenu>
				<SidebarMenuItem>
					<div className="flex h-10 items-center gap-2 px-2">
						<Skeleton className="size-7 rounded-[var(--radius)]" />
						<div className="flex-1 space-y-1">
							<Skeleton className="h-3 w-20" />
							<Skeleton className="h-2.5 w-28" />
						</div>
					</div>
				</SidebarMenuItem>
			</SidebarMenu>
		);
	}

	if (!user) return null;

	const name = user.name ?? "User";
	const email = (user.email ?? "").toLowerCase();
	const canViewBilling = permissions.includes("org.viewBilling");

	const accountHref = orgSlug
		? `/${orgSlug}/settings?group=workspace&section=workspace.profile`
		: undefined;
	const notificationsHref = orgSlug ? `/${orgSlug}/notifications` : undefined;
	const billingHref = orgSlug ? `/${orgSlug}/settings?group=billing` : undefined;
	const settingsHref = orgSlug ? `/${orgSlug}/settings` : undefined;

	return (
		<SidebarMenu>
			<SidebarMenuItem>
				<DropdownMenu>
					<DropdownMenuTrigger asChild>
						<SidebarMenuButton className="h-12 cursor-pointer data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground group-data-[collapsible=icon]:p-1!">
							<Avatar className="size-6 rounded-[var(--radius)]">
								<AvatarImage src={user.avatarUrl ?? undefined} alt={name} />
								<AvatarFallback className="rounded-[var(--radius)] text-xs">
									{getInitials(name)}
								</AvatarFallback>
							</Avatar>
							<div className="grid flex-1 leading-tight">
								<span className="truncate text-sm font-medium">{name}</span>
								<span className="truncate text-xs text-muted-foreground">
									{email}
								</span>
							</div>
						</SidebarMenuButton>
					</DropdownMenuTrigger>
					<DropdownMenuContent
						className="w-(--radix-dropdown-menu-trigger-width) min-w-56 rounded-[var(--radius)]"
						side={isMobile ? "bottom" : "right"}
						align="end"
						sideOffset={4}
					>
						<DropdownMenuLabel className="p-0 font-normal">
							<div className="flex items-center gap-2 px-2 py-2 text-sm">
								<Avatar className="size-7 rounded-[var(--radius)]">
									<AvatarImage src={user.avatarUrl ?? undefined} alt={name} />
									<AvatarFallback className="rounded-[var(--radius)] text-xs">
										{getInitials(name)}
									</AvatarFallback>
								</Avatar>
								<div className="grid flex-1 leading-tight">
									<span className="truncate font-medium">{name}</span>
									<span className="truncate text-xs text-muted-foreground">
										{email}
									</span>
								</div>
							</div>
						</DropdownMenuLabel>
						<DropdownMenuSeparator />
						<DropdownMenuGroup>
							{accountHref ? (
								<DropdownMenuItem asChild>
									<Link href={accountHref}>
										<CircleUser className="size-4 shrink-0" />
										Account
									</Link>
								</DropdownMenuItem>
							) : (
								<DropdownMenuItem disabled>
									<CircleUser className="size-4 shrink-0" />
									Account
								</DropdownMenuItem>
							)}
							{notificationsHref && (
								<DropdownMenuItem asChild>
									<Link href={notificationsHref}>
										<Bell className="size-4 shrink-0" />
										Notifications
									</Link>
								</DropdownMenuItem>
							)}
							{canViewBilling && billingHref && (
								<DropdownMenuItem asChild>
									<Link href={billingHref}>
										<CreditCard className="size-4 shrink-0" />
										Billing
									</Link>
								</DropdownMenuItem>
							)}
							{settingsHref && (
								<DropdownMenuItem asChild>
									<Link href={settingsHref}>
										<Settings className="size-4 shrink-0" />
										Settings
									</Link>
								</DropdownMenuItem>
							)}
						</DropdownMenuGroup>
						<DropdownMenuSeparator />
						<DropdownMenuItem
							onClick={() => {
								// Sign out, then navigate. Routing only AFTER signOut
								// resolves prevents the brief render where the
								// dashboard tree is still mounted with `isAuthenticated`
								// flipping to false — which is what triggers the
								// "WebSocket reconnect" log spam + React error #310.
								// Symmetric with `WorkspaceSwitcher` so both logout
								// surfaces behave identically.
								void signOut().then(() => router.push("/signin"));
							}}
						>
							<LogOut className="size-4 shrink-0" />
							Log out
						</DropdownMenuItem>
					</DropdownMenuContent>
				</DropdownMenu>
			</SidebarMenuItem>
		</SidebarMenu>
	);
}
