"use client";

import { cn } from "@/lib/utils";
import { SETTINGS_GROUPS, type SettingsGroupId, type SettingsGroup } from "../config/settings-nav";
import type { SettingsSectionEntry } from "../config/settings-sections";

type Props = {
	activeGroup: SettingsGroupId;
	onGroupChange: (group: SettingsGroupId) => void;
	permissions: string[];
	/** Groups the user is allowed to see — pre-filtered by the parent */
	filteredGroups?: SettingsGroup[];
	/** Sub-sections of the currently active group (pre-filtered) */
	sections?: SettingsSectionEntry[];
	/** Which sub-section is currently in view (from scrollspy) */
	activeSectionId?: string | null;
	/** Called when a sub-section pill is clicked */
	onSectionChange?: (sectionId: string) => void;
};

/**
 * Left-rail settings navigation.
 *
 * Renders:
 *   - A top-level button per group (icon + label)
 *   - When a group is active, its dynamic sub-sections render beneath it as
 *     indented buttons. Clicking a sub-section scrolls its card into view.
 */
export function SettingsNav({
	activeGroup,
	onGroupChange,
	permissions,
	filteredGroups,
	sections = [],
	activeSectionId,
	onSectionChange,
}: Props) {
	const groups = filteredGroups ?? SETTINGS_GROUPS.filter((g) => {
		if (g.ownerOnly) return permissions.includes("org.delete");
		if (g.permission) return permissions.includes(g.permission);
		return true;
	});

	return (
		<aside className="flex w-52 shrink-0 flex-col overflow-y-auto">
			<nav className="pr-2 space-y-0.5">
				{groups.map((group) => {
					const isActive = activeGroup === group.id;
					return (
						<div key={group.id}>
							<button
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

							{isActive && sections.length > 0 && (
								<ul className="mt-0.5 ms-6 space-y-0.5 border-s border-border ps-2">
									{sections.map((section) => {
										const isCurrent = activeSectionId === section.id;
										return (
											<li key={section.id}>
												<button
													type="button"
													onClick={() => onSectionChange?.(section.id)}
													className={cn(
														"block w-full rounded-[var(--radius)] px-2 py-1 text-start text-xs transition-colors",
														isCurrent
															? "bg-accent/60 text-accent-foreground font-medium"
															: "text-muted-foreground hover:bg-muted hover:text-foreground",
													)}
												>
													{section.label}
												</button>
											</li>
										);
									})}
								</ul>
							)}
						</div>
					);
				})}
			</nav>
		</aside>
	);
}
