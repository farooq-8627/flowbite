"use client";

/**
 * CRMGroup — Settings → CRM.
 *
 * Mirrors `ModulesGroup`'s sub-tab pattern: a thin horizontal tab toolbar at
 * the top of the group, where each tab maps to ONE sub-section of the
 * CRM-wide settings family. Selecting a tab renders only that sub-section's
 * editor.
 *
 *   • Tags        — shared CRM tags (legacy CRM-group content)
 *   • Notes       — sticky-note categories editor
 *   • Reminders   — workspace defaults for the reminders system
 *   • Follow-ups  — placeholder for the upcoming Follow-ups module
 *   • Timeline    — placeholder for the upcoming Timeline module
 *
 * The Notes / Reminders / Follow-ups / Timeline tabs used to live under their
 * own top-level "Notes" settings group; they were folded into CRM (2026-05-17)
 * because they're cross-cutting CRM-record concerns — there's no clean
 * separation between "notes" and the records they hang off. Each section id
 * stays prefixed with `notes.*` (e.g. `notes.categories`, `notes.reminders`)
 * so existing deep-links, the topnav pill highlight, and search keywords
 * keep working.
 *
 * The active tab is persisted in the URL as `?tab=<slug>` (via `nuqs`), same
 * convention as `ModulesGroup`. An unknown slug falls back to "tags".
 */

import { parseAsStringEnum, useQueryState } from "nuqs";
import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import type { Id } from "@/convex/_generated/dataModel";
import { useCurrentOrg } from "@/core/shell/shared/hooks/useCurrentOrg";
import { cn } from "@/lib/utils";
import type { OrgSettings } from "../../types";
import { resolveEntityLabels } from "../../types";
import { TagsSection } from "./crm/TagsSection";
import { FollowupsSection } from "./notes/FollowupsSection";
import { NoteCategoriesSection } from "./notes/NoteCategoriesSection";
import { RemindersSection } from "./notes/RemindersSection";
import { TimelineSection } from "./notes/TimelineSection";

const CRM_TABS = ["tags", "notes", "reminders", "followups", "timeline"] as const;
type CRMTab = (typeof CRM_TABS)[number];

const TAB_LABELS: Record<CRMTab, string> = {
	tags: "Tags",
	notes: "Notes",
	reminders: "Reminders",
	followups: "Follow-ups",
	timeline: "Timeline",
};

/**
 * Map every sub-tab to the canonical settings-section id. Used to keep the
 * topnav sub-group pill highlight synced with the active tab via the
 * `shell:section-active` event.
 *
 * Note: the section ids preserve their historical `notes.*` prefix even
 * though they now live under CRM — the prefix is part of the public deep-
 * link contract (URLs, AI tool hooks, search index keywords).
 */
const SECTION_ID_BY_TAB: Record<CRMTab, string> = {
	tags: "crm.tags",
	notes: "notes.categories",
	reminders: "notes.reminders",
	followups: "notes.followups",
	timeline: "notes.timeline",
};

export function CRMGroup({ org, orgId }: { org: OrgSettings; orgId: Id<"orgs"> }) {
	const labels = resolveEntityLabels(org.entityLabels);

	const { membership: myMembership } = useCurrentOrg();
	const canManageNoteCategories =
		myMembership?.permissions?.includes("notes.categories.manage") ?? false;

	const [tab, setTab] = useQueryState(
		"tab",
		parseAsStringEnum(CRM_TABS as unknown as string[]).withDefault("tags"),
	);
	const activeTab: CRMTab = tab as CRMTab;

	// Tell the shell which sub-group pill to highlight whenever the tab
	// changes. Same contract `ModulesGroup` uses — the shell listens for
	// `shell:section-active` and updates `activeSectionId`.
	useEffect(() => {
		const sectionId = SECTION_ID_BY_TAB[activeTab];
		window.dispatchEvent(new CustomEvent("shell:section-active", { detail: { sectionId } }));
	}, [activeTab]);

	// Listen for shell sub-group pill clicks. When the toolbar dispatches
	// `shell:section-requested` for one of our section ids, switch the
	// active tab so the requested section actually renders. The shell then
	// retries its scroll-to-section with a small delay → the new element is
	// in the DOM and the smooth scroll fires.
	useEffect(() => {
		function onRequested(e: Event) {
			const id = (e as CustomEvent<{ sectionId: string }>).detail?.sectionId;
			if (!id) return;
			// Map section id → tab. Try exact match first, then prefix-based fallback
			// so future ids like `crm.tags.something` or `notes.timeline.events`
			// still land on the right tab.
			const target = (Object.keys(SECTION_ID_BY_TAB) as CRMTab[]).find((t) => {
				const sid = SECTION_ID_BY_TAB[t];
				return id === sid || id.startsWith(`${sid}.`);
			});
			if (!target) return;
			if (target !== tab) setTab(target);
		}
		window.addEventListener("shell:section-requested", onRequested as EventListener);
		return () =>
			window.removeEventListener("shell:section-requested", onRequested as EventListener);
	}, [tab, setTab]);

	return (
		<div className="flex flex-col gap-4">
			{/* Thin horizontal sub-tab toolbar — same pattern as ModulesGroup. */}
			<div
				role="tablist"
				aria-label="CRM settings"
				className="flex w-full items-center gap-0.5 rounded-[var(--radius)] border bg-background p-0.5"
			>
				{CRM_TABS.map((t) => {
					const active = activeTab === t;
					return (
						<Button
							key={t}
							role="tab"
							aria-selected={active}
							type="button"
							variant="ghost"
							size="sm"
							onClick={() => setTab(t)}
							className={cn(
								"h-7 flex-1 rounded-[calc(var(--radius)-2px)] px-2 text-xs font-medium",
								active
									? "bg-accent text-accent-foreground"
									: "text-muted-foreground hover:text-foreground",
							)}
						>
							{TAB_LABELS[t]}
						</Button>
					);
				})}
			</div>

			{/* Active-tab content — render exactly one sub-section. The id on
			    the wrapper matches the canonical section id so scroll-to-anchor
			    + the shell's IntersectionObserver land on the right element. */}
			<div
				id={SECTION_ID_BY_TAB[activeTab]}
				className="grid gap-4 scroll-mt-4 rounded-[var(--radius)]"
			>
				{activeTab === "tags" && <TagsSection orgId={orgId} labels={labels} />}
				{activeTab === "notes" && (
					<NoteCategoriesSection orgId={orgId} canManage={canManageNoteCategories} />
				)}
				{activeTab === "reminders" && <RemindersSection org={org} orgId={orgId} />}
				{activeTab === "followups" && <FollowupsSection org={org} orgId={orgId} />}
				{activeTab === "timeline" && <TimelineSection />}
			</div>
		</div>
	);
}
