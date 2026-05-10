"use client";

import { cn } from "@/lib/utils";
import { SETTINGS_GROUPS, type SettingsGroupId, type SettingsGroup } from "../config/settings-nav";

type Props = {
	activeGroup: SettingsGroupId;
	onGroupChange: (group: SettingsGroupId) => void;
	permissions: string[];
	filteredGroups?: SettingsGroup[];
};

export function SettingsNav({ activeGroup, onGroupChange, permissions, filteredGroups }: Props) {
	const groups = filteredGroups ?? SETTINGS_GROUPS.filter((g) => {
		if (g.ownerOnly) return permissions.includes("org.delete");
		if (g.permission) return permissions.includes(g.permission);
		return true;
	});

	return (
		<aside className="flex w-52 shrink-0 flex-col overflow-y-auto">
			{/* Settings heading — aligns with the search bar row height */}
			{/* <div className="flex h-11 shrink-0 items-center px-2">
				<span className="text-2xl font-semibold">SETTINGS</span>
			</div> */}
			<nav className="pr-2 space-y-0.5">
				{groups.map((group) => (
					<button
						key={group.id}
						type="button"
						onClick={() => onGroupChange(group.id as SettingsGroupId)}
						className={cn(
							"flex w-full items-center gap-2.5 rounded-[var(--radius)] px-3 py-2 text-sm transition-colors",
							activeGroup === group.id
								? "bg-accent text-accent-foreground font-medium"
								: "text-muted-foreground hover:bg-muted hover:text-foreground",
						)}
					>
						<group.icon className="size-4 shrink-0" />
						{group.label}
					</button>
				))}
			</nav>
		</aside>
	);
}
