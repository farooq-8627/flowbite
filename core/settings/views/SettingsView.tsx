"use client";

import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Search, Menu } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { AppSheet } from "@/components/ui/app-sheet";
import { SettingsNav } from "../components/SettingsNav";
import { SettingsContent } from "../components/SettingsContent";
import { useActiveGroup } from "../hooks/useActiveGroup";
import { SETTINGS_GROUPS, type SettingsGroupId, type SettingsSubGroup } from "../config/settings-nav";
import { useState, useMemo, useEffect } from "react";
import { cn } from "@/lib/utils";
import { useNavSlot } from "@/core/shell/context/nav-slot-context";

// ─── Shared toolbar ───────────────────────────────────────────────────────────

function SettingsToolbar({
	search, onSearch, subGroups, activeSubGroup, onSubGroup, onOpenSheet, className, searchClassName,
}: {
	search: string;
	onSearch: (v: string) => void;
	subGroups: SettingsSubGroup[];
	activeSubGroup: string | null;
	onSubGroup: (id: string) => void;
	onOpenSheet?: () => void;
	className?: string;
	searchClassName?: string;
}) {
	return (
		<div className={cn("flex gap-2 overflow-hidden flex-col sm:flex-row", className)}>
			<div className="flex flex-row">
			{onOpenSheet && (
				<Button variant="ghost" size="icon" className="size-7 shrink-0" onClick={onOpenSheet}>
					<Menu className="size-4" />
				</Button>
			)}
			<div className="relative shrink-0 w-full sm:w-44">
				<Search className="pointer-events-none absolute start-2 top-1/2 size-3 -translate-y-1/2 text-muted-foreground" />
				<Input
					value={search}
					onChange={(e) => onSearch(e.target.value)}
					placeholder="Search…"
					className={cn("h-6 ps-6 text-xs", searchClassName)}
				/>
			</div>
			</div>
			{subGroups.length > 0 && (
				<div className="flex flex-1 items-center gap-1 overflow-x-auto scrollbar-none">
					{subGroups.map((sub) => (
						<button
							key={sub.id}
							type="button"
							onClick={() => onSubGroup(sub.id)}
							className={cn(
								"flex shrink-0 items-center gap-1.5 rounded-[var(--radius)] px-2.5 py-1 text-xs transition-colors",
								activeSubGroup === sub.id
									? "bg-accent text-accent-foreground font-medium"
									: "text-muted-foreground hover:bg-muted hover:text-foreground",
							)}
						>
							<sub.icon className="size-3.5 shrink-0" />
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
	const [search, setSearch] = useState("");
	const [activeSubGroup, setActiveSubGroup] = useState<string | null>(null);
	const [sheetOpen, setSheetOpen] = useState(false);
	const { setSlot, clearSlot } = useNavSlot();

	// ── Derived (no useEffect needed) ────────────────────────────────────────

	const visibleGroups = useMemo(() => {
		if (!permissions) return [];
		return SETTINGS_GROUPS.filter((g) => {
			if (g.ownerOnly) return permissions.includes("org.delete");
			if (g.permission) return permissions.includes(g.permission);
			return true;
		});
	}, [permissions]);

	const filteredGroups = useMemo(() => {
		const q = search.trim().toLowerCase();
		if (!q) return visibleGroups;
		return visibleGroups.map((g) => {
			const groupMatches = g.label.toLowerCase().includes(q);
			const matchedSubs = g.subGroups.filter(
				(s) => s.label.toLowerCase().includes(q) || s.description.toLowerCase().includes(q),
			);
			if (groupMatches || matchedSubs.length > 0) {
				return { ...g, subGroups: groupMatches ? g.subGroups : matchedSubs };
			}
			return null;
		}).filter(Boolean) as typeof visibleGroups;
	}, [visibleGroups, search]);

	// Derive active group — fall back to first visible if current is filtered out
	const resolvedGroup: SettingsGroupId =
		filteredGroups.some((g) => g.id === activeGroup)
			? activeGroup
			: (filteredGroups[0]?.id as SettingsGroupId) ?? activeGroup;

	const subGroups = filteredGroups.find((g) => g.id === resolvedGroup)?.subGroups ?? [];

	// Derive active sub-group — fall back to first if current is gone
	const resolvedSubGroup: string | null =
		subGroups.some((s) => s.id === activeSubGroup)
			? activeSubGroup
			: subGroups[0]?.id ?? null;

	// ── Side effects (genuinely external) ────────────────────────────────────

	// Sync URL when resolved group differs from stored group
	useEffect(() => {
		if (resolvedGroup !== activeGroup) setActiveGroup(resolvedGroup);
	}, [resolvedGroup, activeGroup, setActiveGroup]);

	// Inject into TopNav slot
	useEffect(() => {
		setSlot(
			<SettingsToolbar
				search={search}
				onSearch={setSearch}
				subGroups={subGroups}
				activeSubGroup={resolvedSubGroup}
				onSubGroup={setActiveSubGroup}
				className="hidden xl:flex w-full"
			/>,
		);
	// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [search, subGroups, resolvedSubGroup]);

	useEffect(() => () => clearSlot(), [clearSlot]);

	// ─────────────────────────────────────────────────────────────────────────

	const handleGroupChange = (g: SettingsGroupId) => {
		setActiveGroup(g);
		setActiveSubGroup(null);
		setSheetOpen(false);
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
					filteredGroups={filteredGroups}
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
					filteredGroups={filteredGroups}
				/>
			</AppSheet>

			<div className="flex flex-1 flex-col overflow-hidden">
				<SettingsToolbar
					search={search}
					onSearch={setSearch}
					subGroups={subGroups}
					activeSubGroup={resolvedSubGroup}
					onSubGroup={setActiveSubGroup}
					onOpenSheet={() => setSheetOpen(true)}
					className="xl:hidden px-3 py-2 flex-wrap"
					searchClassName="h-7"
				/>
				<SettingsContent
					activeGroup={resolvedGroup}
					activeSubGroup={resolvedSubGroup}
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
