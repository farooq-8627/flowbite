"use client";

/**
 * ModulesGroup — Settings → Modules.
 *
 * Horizontal entity tab toolbar at the top (Leads / Contacts / Deals / Companies).
 * Selecting a tab renders the sections that apply to that slot:
 *   - Every slot: <ModuleDisplaySection>
 *   - Every slot: <SlotFieldsSection>           (Custom fields)
 *   - Deal slot only: <SlotPipelinesSection>    (Pipelines)
 *
 * Active tab persists in the URL via `?tab=` so deep-links + reloads keep state.
 *
 * Pattern to reuse for any future group that wants tabs: compose horizontal
 * thin buttons at the top + render the active-tab content below.
 */

import { parseAsString, useQueryState } from "nuqs";
import { Button } from "@/components/ui/button";
import type { Id } from "@/convex/_generated/dataModel";
import type { EntitySlot } from "@/core/entities/shared/types";
import { useEntityLabels } from "@/core/shared/hooks/useEntityLabels";
import { cn } from "@/lib/utils";
import type { OrgSettings } from "../../../types";
import { ModuleDisplaySection } from "./ModuleDisplaySection";
import { SlotFieldsSection } from "./SlotFieldsSection";
import { SlotPipelinesSection } from "./SlotPipelinesSection";

const SLOTS: EntitySlot[] = ["lead", "contact", "deal", "company"];

function isSlot(v: string | null): v is EntitySlot {
	return v === "lead" || v === "contact" || v === "deal" || v === "company";
}

export function ModulesGroup({ org, orgId }: { org: OrgSettings; orgId: Id<"orgs"> }) {
	const labels = useEntityLabels(orgId);
	const [tab, setTab] = useQueryState("tab", parseAsString.withDefault("lead"));
	const slot: EntitySlot = isSlot(tab) ? tab : "lead";

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
							onClick={() => setTab(s)}
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
			<div className="grid gap-4">
				<ModuleDisplaySection slot={slot} orgId={orgId} modules={org.settings?.modules} />
				<SlotFieldsSection slot={slot} orgId={orgId} />
				{slot === "deal" && <SlotPipelinesSection slot={slot} orgId={orgId} />}
			</div>
		</div>
	);
}
