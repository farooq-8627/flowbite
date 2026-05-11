"use client";

import { useAuthActions } from "@convex-dev/auth/react";
import { useQuery } from "convex/react";
import { Check, ChevronsUpDown, Command, LogOut, Plus, UserPlus } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuGroup,
	DropdownMenuItem,
	DropdownMenuLabel,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { SidebarMenu, SidebarMenuButton, SidebarMenuItem } from "@/components/ui/sidebar";
import { Skeleton } from "@/components/ui/skeleton";
import { APP_CONFIG } from "@/config/app-config";
import { api } from "@/convex/_generated/api";

export function WorkspaceSwitcher({ currentOrgSlug }: { currentOrgSlug: string }) {
	const { signOut } = useAuthActions();
	const router = useRouter();
	const orgs = useQuery(api.orgs.queries.listMyOrgs);
	const currentOrg = orgs?.find((o) => o.org.slug === currentOrgSlug)?.org;

	if (orgs === undefined) {
		return (
			<SidebarMenu>
				<SidebarMenuItem>
					<div className="flex h-10 items-center gap-2 px-2">
						<Skeleton className="size-5 rounded-[var(--radius)]" />
						<Skeleton className="h-3 w-24 flex-1" />
					</div>
				</SidebarMenuItem>
			</SidebarMenu>
		);
	}

	const displayName = currentOrg?.name ?? APP_CONFIG.name;

	return (
		<SidebarMenu>
			<SidebarMenuItem>
				<DropdownMenu>
					<DropdownMenuTrigger asChild>
						<SidebarMenuButton className="h-10 cursor-pointer data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground">
							<Command className="size-4 shrink-0 text-primary" />
							<span className="flex-1 truncate text-sm font-medium">
								{displayName}
							</span>
							<ChevronsUpDown className="ms-auto size-4 shrink-0 opacity-50" />
						</SidebarMenuButton>
					</DropdownMenuTrigger>

					<DropdownMenuContent
						className="w-(--radix-dropdown-menu-trigger-width) min-w-56 rounded-[var(--radius)]"
						side="bottom"
						align="start"
						sideOffset={2}
					>
						<DropdownMenuLabel className="p-0 font-normal">
							<div className="flex items-center gap-2 px-3 py-1 text-sm">
								<Command className="size-4 shrink-0 text-primary" />
								<div className="grid flex-1 leading-tight ms-1">
									<span className="truncate font-medium">{displayName}</span>
									<span className="truncate text-xs text-muted-foreground font-mono ">
										{currentOrg?.platformOrgId}
									</span>
								</div>
							</div>
						</DropdownMenuLabel>
						<DropdownMenuSeparator />
						{orgs.length > 1 && (
							<>
								{orgs
									.filter(({ org }) => org.slug !== currentOrgSlug)
									.map(({ org }) => (
										<DropdownMenuItem key={org._id} asChild>
											<Link prefetch={false} href={`/${org.slug}`}>
												<Command className="size-4 shrink-0 opacity-50" />
												<span className="flex-1 truncate">{org.name}</span>
												<Check className="ms-auto size-4 shrink-0 opacity-0" />
											</Link>
										</DropdownMenuItem>
									))}
								<DropdownMenuSeparator />
							</>
						)}
						<DropdownMenuGroup>
							<DropdownMenuItem asChild>
								<Link prefetch={false} href="/onboarding">
									<Plus className="size-4 shrink-0" />
									Create workspace
								</Link>
							</DropdownMenuItem>
							<DropdownMenuItem asChild>
								<Link prefetch={false} href="/join">
									<UserPlus className="size-4 shrink-0" />
									Join workspace
								</Link>
							</DropdownMenuItem>
						</DropdownMenuGroup>
						{/* <DropdownMenuSeparator /> */}
						<DropdownMenuItem
							onClick={() => void signOut().then(() => router.push("/signin"))}
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
