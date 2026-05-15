"use client";

/**
 * ModulesGroup — Settings → Modules.
 *
 * Horizontal entity tab toolbar at the top (slot-based, labels are dynamic).
 * Selecting a tab renders the sections that apply to that slot:
 *   - Every slot: <ModuleDisplaySection>
 *   - Every slot: <SlotFieldsSection>           (Custom fields)
 *   - Deal slot only: <SlotPipelinesSection>    (Pipelines)
 *
 * The active tab persists in the URL as `?tab=<slug>` using the org's renamed
 * entity slug (e.g. `?tab=inquiries` when Lead is renamed to Inquiry). If an
 * unknown slug arrives we fall back to the lead slot.
 *
 * Pattern to reuse for any future group that wants tabs: compose horizontal
 * thin buttons at the top + render the active-tab content below.
 */

import { parseAsString, useQueryState } from "nuqs";
import { useEffect, useMemo } from "react";
import { Button } from "@/components/ui/button";
import type { Id } from "@/convex/_generated/dataModel";
import type { EntitySlot } from "@/core/entities/shared/types";
import { useEntityLabels } from "@/core/shell/shared/hooks/useEntityLabels";
import { cn } from "@/lib/utils";
import type { OrgSettings } from "../../../types";
import { ModuleDisplaySection } from "./ModuleDisplaySection";
import { SlotFieldsSection } from "./SlotFieldsSection";
import { SlotPipelinesSection } from "./SlotPipelinesSection";

const SLOTS: EntitySlot[] = ["lead", "contact", "deal", "company"];

export function ModulesGroup({ org, orgId }: { org: OrgSettings; orgId: Id<"orgs"> }) {
	const labels = useEntityLabels(orgId);

	// Map the slot → dynamic URL slug (e.g. "lead" → "inquiries"). Used both to
	// write `?tab=` and to resolve the active tab on mount/back-nav.
	const slugBySlot = useMemo<Record<EntitySlot, string>>(
		() => ({
			lead: labels.lead.slug,
			contact: labels.contact.slug,
			deal: labels.deal.slug,
			company: labels.company.slug,
		}),
		[labels],
	);

	const slotBySlug = useMemo<Record<string, EntitySlot>>(() => {
		const map: Record<string, EntitySlot> = {};
		for (const slot of SLOTS) map[slugBySlot[slot]] = slot;
		// Also accept raw slot names so legacy `?tab=lead` deep-links keep working.
		for (const slot of SLOTS) if (!map[slot]) map[slot] = slot;
		return map;
	}, [slugBySlot]);

	const [tab, setTab] = useQueryState("tab", parseAsString.withDefault(slugBySlot.lead));
	const slot: EntitySlot = slotBySlug[tab ?? ""] ?? "lead";

	// Tell the shell which sub-group pill to highlight whenever the active
	// tab changes. The shell listens for `shell:section-active` and updates
	// its `activeSectionId` so the topnav pill stays in sync with the tab.
	useEffect(() => {
		const sectionId = `modules.${slot}`;
		window.dispatchEvent(new CustomEvent("shell:section-active", { detail: { sectionId } }));
	}, [slot]);

	// Listen for shell sub-group pill clicks. When the toolbar dispatches a
	// `shell:section-requested` event with id like `modules.<slot>` we switch
	// the active tab so the requested section actually renders. The shell then
	// retries its scroll-to-section with a small delay → the new element is
	// in the DOM and the smooth scroll fires.
	useEffect(() => {
		function onRequested(e: Event) {
			const id = (e as CustomEvent<{ sectionId: string }>).detail?.sectionId;
			if (!id?.startsWith("modules.")) return;
			// `modules.lead`, `modules.lead.display`, `modules.deal.fields` …
			const parts = id.split(".");
			const slotName = parts[1] as EntitySlot | undefined;
			if (!slotName || !SLOTS.includes(slotName)) return;
			const desired = slugBySlot[slotName];
			if (desired && desired !== tab) setTab(desired);
		}
		window.addEventListener("shell:section-requested", onRequested as EventListener);
		return () =>
			window.removeEventListener("shell:section-requested", onRequested as EventListener);
	}, [slugBySlot, tab, setTab]);

	return (
		<div className="flex flex-col gap-4">
			{/* Thin horizontal tab toolbar */}
			<div
				role="tablist"
				aria-label="Modules"
				className="flex w-full items-center gap-0.5 rounded-[var(--radius)] border bg-background p-0.5"
			>
				{SLOTS.map((s) => {
					const active = slot === s;
					return (
						<Button
							key={s}
							role="tab"
							aria-selected={active}
							type="button"
							variant="ghost"
							size="sm"
							onClick={() => setTab(slugBySlot[s])}
							className={cn(
								"h-7 flex-1 rounded-[calc(var(--radius)-2px)] px-2 text-xs font-medium",
								active
									? "bg-accent text-accent-foreground"
									: "text-muted-foreground hover:text-foreground",
							)}
						>
							{labels[s].plural}
						</Button>
					);
				})}
			</div>

			{/* Active-tab content */}
			<div id={`modules.${slot}`} className="grid gap-4 scroll-mt-4 rounded-[var(--radius)]">
				<ModuleDisplaySection slot={slot} orgId={orgId} modules={org.settings?.modules} />
				<SlotFieldsSection slot={slot} orgId={orgId} />
				{slot === "deal" && <SlotPipelinesSection slot={slot} orgId={orgId} />}
			</div>
		</div>
	);
}
