"use client";

import { cn } from "@/lib/utils";
import type { ShellGroup } from "./types";

type Props = {
	activeGroupId: string;
	onGroupChange: (groupId: string) => void;
	groups: ShellGroup[];
};

/**
 * Left-rail shell navigation — top-level groups only.
 *
 * Sub-sections are rendered as pills in the topnav slot (see ShellToolbar), not
 * here, so the sidebar stays short and scannable.
 *
 * Permissions are pre-filtered by the ShellLayout parent — this component does
 * not do permission checks of its own.
 */
export function ShellNav({ activeGroupId, onGroupChange, groups }: Props) {
	return (
		<aside className="flex w-full shrink-0 flex-col overflow-y-auto">
			<nav className="space-y-0.5">
				{groups.map((group) => {
					const isActive = activeGroupId === group.id;
					const Icon = group.icon;
					return (
						<button
							key={group.id}
							type="button"
							onClick={() => onGroupChange(group.id)}
							className={cn(
								"flex w-full items-center gap-2.5 rounded-[var(--radius)] px-3 py-2 text-sm transition-colors",
								isActive
									? "bg-accent text-accent-foreground font-medium"
									: "text-muted-foreground hover:bg-muted hover:text-foreground",
							)}
						>
							<Icon className="size-4 shrink-0" />
							{group.label}
						</button>
					);
				})}
			</nav>
		</aside>
	);
}
