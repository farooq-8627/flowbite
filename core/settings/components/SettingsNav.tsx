"use client";

import { cn } from "@/lib/utils";
import { SETTINGS_GROUPS, type SettingsGroupId, type SettingsGroup } from "../config/settings-nav";

type Props = {
	activeGroup: SettingsGroupId;
	onGroupChange: (group: SettingsGroupId) => void;
	permissions: string[];
	/** Groups the user is allowed to see — pre-filtered by the parent */
	filteredGroups?: SettingsGroup[];
};

/**
 * Left-rail settings navigation — top-level groups only.
 *
 * Sub-sections (e.g. "Current plan", "Usage", "Invoices") are rendered as
 * pills in the topnav slot toolbar, not here, to avoid duplication and to
 * keep the sidebar short and scannable.
 */
export function SettingsNav({
	activeGroup,
	onGroupChange,
	permissions,
	filteredGroups,
}: Props) {
	const groups = filteredGroups ?? SETTINGS_GROUPS.filter((g) => {
		if (g.ownerOnly) return permissions.includes("org.delete");
		if (g.permission) return permissions.includes(g.permission);
		return true;
	});

	return (
		<aside className="flex w-52 shrink-0 flex-col overflow-y-auto">
			<nav className="pe-2 space-y-0.5">
				{groups.map((group) => {
					const isActive = activeGroup === group.id;
					return (
						<button
							key={group.id}
							type="button"
							onClick={() => onGroupChange(group.id as SettingsGroupId)}
							className={cn(
								"flex w-full items-center gap-2.5 rounded-[var(--radius)] px-3 py-2 text-sm transition-colors",
								isActive
									? "bg-accent text-accent-foreground font-medium"
									: "text-muted-foreground hover:bg-muted hover:text-foreground",
							)}
						>
							<group.icon className="size-4 shrink-0" />
							{group.label}
						</button>
					);
				})}
			</nav>
		</aside>
	);
}
