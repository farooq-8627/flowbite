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
	permissions,
	onNavigate,
	className,
}: {
	sections: SettingsSectionEntry[];
	activeSectionId: string | null;
	onPickSection: (id: string) => void;
	onOpenSheet?: () => void;
	permissions: string[] | undefined;
	onNavigate: (groupId: SettingsGroupId, sectionId: string) => void;
	className?: string;
}) {
	return (
		<div className={cn("flex gap-2 overflow-hidden flex-col sm:flex-row", className)}>
			<div className="flex flex-row items-center">
				{onOpenSheet && (
					<Button variant="ghost" size="icon" className="size-7 shrink-0" onClick={onOpenSheet}>
						<Menu className="size-4" />
					</Button>
				)}
				<SettingsSearch
					permissions={permissions}
					onNavigate={onNavigate}
					className="w-full sm:w-52 shrink-0"
				/>
			</div>
			{sections.length > 0 && (
				<div className="flex flex-1 items-center gap-1 overflow-x-auto scrollbar-none">
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
	const { setSlot, clearSlot } = useNavSlot();

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
		if (sectionsForGroup.length === 0) return;
		const els = sectionsForGroup
			.map((s) => document.getElementById(s.id))
			.filter((el): el is HTMLElement => el !== null);
		if (els.length === 0) return;

		const observer = new IntersectionObserver(
			(entries) => {
				// Pick the entry closest to the top that is still in view.
				const visible = entries
					.filter((e) => e.isIntersecting)
					.sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0];
				if (visible) setActiveSectionId(visible.target.id);
			},
			{ rootMargin: "-10% 0px -70% 0px", threshold: 0 },
		);
		els.forEach((el) => observer.observe(el));
		return () => observer.disconnect();
	}, [sectionsForGroup, resolvedGroup]);

	// ── Side effects ─────────────────────────────────────────────────────────

	useEffect(() => {
		if (resolvedGroup !== activeGroup) setActiveGroup(resolvedGroup);
	}, [resolvedGroup, activeGroup, setActiveGroup]);

	const handleNavigate = (groupId: SettingsGroupId, sectionId: string) => {
		if (groupId !== resolvedGroup) setActiveGroup(groupId);
		setActiveSectionId(sectionId);
	};

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
				permissions={permissions}
				onNavigate={handleNavigate}
				className="hidden xl:flex w-full"
			/>,
		);
	// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [sectionsForGroup, resolvedSectionId, permissions]);

	useEffect(() => () => clearSlot(), [clearSlot]);

	// ─────────────────────────────────────────────────────────────────────────

	const handleGroupChange = (g: SettingsGroupId) => {
		setActiveGroup(g);
		setActiveSectionId(null);
		setSheetOpen(false);
		window.scrollTo({ top: 0, behavior: "auto" });
	};

	if (!orgId || settings === undefined || permissions === undefined) {
		return <div className="flex h-full items-center justify-center text-sm text-muted-foreground">Loading…</div>;
	}
	if (!settings) {
		return <div className="flex h-full items-center justify-center text-sm text-muted-foreground">Organization not found.</div>;
	}

	return (
		<div className="flex h-full overflow-hidden">
			<div className="hidden xl:flex">
				<SettingsNav
					activeGroup={resolvedGroup}
					onGroupChange={handleGroupChange}
					permissions={permissions}
					filteredGroups={visibleGroups}
					sections={sectionsForGroup}
					activeSectionId={resolvedSectionId}
					onSectionChange={handlePickSection}
				/>
			</div>

			<AppSheet
				open={sheetOpen}
				onOpenChange={setSheetOpen}
				title="Settings"
				side="left"
				width="13rem"
				className="p-2 pt-4"
			>
				<div className="flex h-11 shrink-0 items-center px-2">
					<span className="text-2xl font-semibold">Settings</span>
				</div>
				<SettingsNav
					activeGroup={resolvedGroup}
					onGroupChange={handleGroupChange}
					permissions={permissions}
					filteredGroups={visibleGroups}
					sections={sectionsForGroup}
					activeSectionId={resolvedSectionId}
					onSectionChange={handlePickSection}
				/>
			</AppSheet>

			<div className="flex flex-1 flex-col overflow-hidden">
				<SettingsToolbar
					sections={sectionsForGroup}
					activeSectionId={resolvedSectionId}
					onPickSection={handlePickSection}
					onOpenSheet={() => setSheetOpen(true)}
					permissions={permissions}
					onNavigate={handleNavigate}
					className="xl:hidden px-3 py-2 flex-wrap"
				/>
				<SettingsContent
					activeGroup={resolvedGroup}
					activeSubGroup={resolvedSectionId}
					org={settings}
					orgId={orgId}
					permissions={permissions}
				/>
			</div>
		</div>
	);
}

export function SettingsView({ orgSlug }: { orgSlug: string }) {
	return <SettingsViewInner orgSlug={orgSlug} />;
}
