"use client";

import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Menu } from "lucide-react";
import { Button } from "@/components/ui/button";
import { AppSheet } from "@/components/ui/app-sheet";
import { SettingsNav } from "../components/SettingsNav";
import { SettingsContent } from "../components/SettingsContent";
import { SettingsSearch } from "../components/SettingsSearch";
import { useActiveGroup } from "../hooks/useActiveGroup";
import { scrollToSection } from "../hooks/useSettingsSearch";
import { SETTINGS_GROUPS, type SettingsGroupId } from "../config/settings-nav";
import {
	getVisibleSections,
	type SettingsSectionEntry,
} from "../config/settings-sections";
import { useState, useMemo, useEffect } from "react";
import { cn } from "@/lib/utils";
import { useNavSlot } from "@/core/shell/context/nav-slot-context";

// ─── Shared toolbar ───────────────────────────────────────────────────────────

function SettingsToolbar({
	sections,
	activeSectionId,
	onPickSection,
	onOpenSheet,
	query,
	onQueryChange,
	isSearching,
	className,
}: {
	sections: SettingsSectionEntry[];
	activeSectionId: string | null;
	onPickSection: (id: string) => void;
	onOpenSheet?: () => void;
	query: string;
	onQueryChange: (value: string) => void;
	isSearching: boolean;
	className?: string;
}) {
	return (
		<div className={cn("flex w-full items-center gap-2 flex-col sm:flex-row", className)}>
			<div className="flex flex-row items-center gap-1 w-full sm:w-auto shrink-0">
				{onOpenSheet && (
					<Button variant="ghost" size="icon" className="size-7 shrink-0" onClick={onOpenSheet}>
						<Menu className="size-4" />
					</Button>
				)}
				<SettingsSearch
					value={query}
					onChange={onQueryChange}
					className="w-fit sm:w-56 shrink-0"
				/>
			</div>
			{!isSearching && sections.length > 0 && (
				<div className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto scrollbar-none">
					{sections.map((sub) => (
						<button
							key={sub.id}
							type="button"
							onClick={() => onPickSection(sub.id)}
							className={cn(
								"shrink-0 rounded-[var(--radius)] px-2.5 py-1 text-xs transition-colors",
								activeSectionId === sub.id
									? "bg-accent text-accent-foreground font-medium"
									: "text-muted-foreground hover:bg-muted hover:text-foreground",
							)}
						>
							{sub.label}
						</button>
					))}
				</div>
			)}
		</div>
	);
}

// ─── Main View ────────────────────────────────────────────────────────────────

function SettingsViewInner({ orgSlug }: { orgSlug: string }) {
	const orgs = useQuery(api.orgs.queries.listMyOrgs);
	const orgEntry = orgs?.find((o) => o.org.slug === orgSlug);
	const orgId = orgEntry?.org._id;

	const settings = useQuery(api.orgs.queries.getFullSettings, orgId ? { orgId } : "skip");
	const permissions = useQuery(api.orgRoles.queries.getMyPermissions, orgId ? { orgId } : "skip");

	const { activeGroup, setActiveGroup } = useActiveGroup();
	const [activeSectionId, setActiveSectionId] = useState<string | null>(null);
	const [sheetOpen, setSheetOpen] = useState(false);
	const [query, setQuery] = useState("");
	const { setSlot, clearSlot } = useNavSlot();

	const isSearching = query.trim().length > 0;

	// ── Derived ──────────────────────────────────────────────────────────────

	const visibleGroups = useMemo(() => {
		if (!permissions) return [];
		return SETTINGS_GROUPS.filter((g) => {
			if (g.ownerOnly) return permissions.includes("org.delete");
			if (g.permission) return permissions.includes(g.permission);
			return true;
		});
	}, [permissions]);

	const resolvedGroup: SettingsGroupId =
		visibleGroups.some((g) => g.id === activeGroup)
			? activeGroup
			: (visibleGroups[0]?.id as SettingsGroupId) ?? activeGroup;

	// Sub-sections for the currently active group, filtered by permissions.
	const sectionsForGroup = useMemo(() => {
		if (!permissions) return [];
		return getVisibleSections(permissions, resolvedGroup);
	}, [permissions, resolvedGroup]);

	const resolvedSectionId: string | null =
		sectionsForGroup.some((s) => s.id === activeSectionId)
			? activeSectionId
			: sectionsForGroup[0]?.id ?? null;

	// ── Scrollspy — highlight the section currently visible in the viewport. ──
	useEffect(() => {
		if (isSearching || sectionsForGroup.length === 0) return;
		const els = sectionsForGroup
			.map((s) => document.getElementById(s.id))
			.filter((el): el is HTMLElement => el !== null);
		if (els.length === 0) return;

		const observer = new IntersectionObserver(
			(entries) => {
				const visible = entries
					.filter((e) => e.isIntersecting)
					.sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0];
				if (visible) setActiveSectionId(visible.target.id);
			},
			{ rootMargin: "-10% 0px -70% 0px", threshold: 0 },
		);
		els.forEach((el) => observer.observe(el));
		return () => observer.disconnect();
	}, [sectionsForGroup, resolvedGroup, isSearching]);

	// ── Side effects ─────────────────────────────────────────────────────────

	useEffect(() => {
		if (resolvedGroup !== activeGroup) setActiveGroup(resolvedGroup);
	}, [resolvedGroup, activeGroup, setActiveGroup]);

	const handlePickSection = (id: string) => {
		setActiveSectionId(id);
		scrollToSection(id);
	};

	// Inject toolbar into the topnav slot.
	useEffect(() => {
		setSlot(
			<SettingsToolbar
				sections={sectionsForGroup}
				activeSectionId={resolvedSectionId}
				onPickSection={handlePickSection}
				query={query}
				onQueryChange={setQuery}
				isSearching={isSearching}
				className="hidden xl:flex w-full"
			/>,
		);
	// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [sectionsForGroup, resolvedSectionId, query, isSearching]);

	useEffect(() => () => clearSlot(), [clearSlot]);

	// ─────────────────────────────────────────────────────────────────────────

	const handleGroupChange = (g: SettingsGroupId) => {
		setActiveGroup(g);
		setActiveSectionId(null);
		setQuery("");
		setSheetOpen(false);
		window.scrollTo({ top: 0, behavior: "auto" });
	};

	if (!orgId || settings === undefined || permissions === undefined) {
		return null;
	}
	if (!settings) {
		return <div className="flex h-full items-center justify-center text-sm text-muted-foreground">Organization not found.</div>;
	}

	return (
		<div className="flex h-full overflow-hidden">
			<div className="hidden w-52 shrink-0 pe-2 xl:flex">
				<SettingsNav
					activeGroup={resolvedGroup}
					onGroupChange={handleGroupChange}
					permissions={permissions}
					filteredGroups={visibleGroups}
				/>
			</div>

			<AppSheet
				open={sheetOpen}
				onOpenChange={setSheetOpen}
				title="Settings"
				side="left"
				width="16rem"
				className="p-3 pt-4"
			>
				<div className="flex h-11 shrink-0 items-center px-2">
					<span className="text-2xl font-semibold">Settings</span>
				</div>
				<SettingsNav
					activeGroup={resolvedGroup}
					onGroupChange={handleGroupChange}
					permissions={permissions}
					filteredGroups={visibleGroups}
				/>
			</AppSheet>

			<div className="flex flex-1 flex-col overflow-hidden">
				<SettingsToolbar
					sections={sectionsForGroup}
					activeSectionId={resolvedSectionId}
					onPickSection={handlePickSection}
					onOpenSheet={() => setSheetOpen(true)}
					query={query}
					onQueryChange={setQuery}
					isSearching={isSearching}
					className="xl:hidden px-3 py-2 flex-wrap"
				/>
				<SettingsContent
					activeGroup={resolvedGroup}
					activeSubGroup={resolvedSectionId}
					org={settings}
					orgId={orgId}
					permissions={permissions}
					query={query}
				/>
			</div>
		</div>
	);
}

export function SettingsView({ orgSlug }: { orgSlug: string }) {
	return <SettingsViewInner orgSlug={orgSlug} />;
}
