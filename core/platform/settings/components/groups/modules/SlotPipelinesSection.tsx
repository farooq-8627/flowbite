"use client";

/**
 * SlotPipelinesSection — per-slot pipeline editor.
 *
 * Only surfaces for slots that own a pipeline (today: "deal"; other slots
 * can be enabled later as their own pipelines are introduced).
 *
 * Lists all pipelines for the slot's entityType and renders one
 * PipelineEditor per row. Each editor is self-contained (inline rename,
 * color change, drag-reorder stages, stage codes, default-stage action).
 *
 * Reads pipelines from the centralized `usePipelines` hook so the
 * subscription is shared with the deals board and any other pipeline-
 * aware surface — no duplicate `useQuery` per consumer.
 */

import { useQuery } from "convex/react";
import { useCallback } from "react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { usePipelines } from "@/core/entities/_entities/deals/hooks/usePipelines";
import type { EntitySlot } from "@/core/entities/shared/types";
import { SettingsSection } from "../../shared/SettingsSection";
import { PipelineEditor } from "../pipelines/PipelineEditor";

const SLOT_TO_ENTITY_TYPE: Partial<Record<EntitySlot, "deal">> = {
	deal: "deal",
};

interface Props {
	slot: EntitySlot;
	orgId: Id<"orgs">;
}

export function SlotPipelinesSection({ slot, orgId }: Props) {
	const entityType = SLOT_TO_ENTITY_TYPE[slot];
	const pipelines = usePipelines(orgId);
	const dealCounts = useQuery(api.crm.fields.pipelines.queries.countByPipelines, { orgId });

	// No-op delete callback: this surface lists all pipelines stacked,
	// so when one is deleted the listByOrg subscription already removes
	// the row. Nothing for the parent to clear here.
	const handleDeleted = useCallback(() => {}, []);

	if (!entityType) return null;

	const filtered = pipelines?.filter((p) => p.entityType === entityType) ?? [];

	return (
		<SettingsSection
			id={`modules.${slot}.pipelines`}
			title="Pipelines"
			description="Stage workflows. Drag stages to reorder, click a stage to rename, click the color dot to recolor. Stage codes are used by AI and saved views."
		>
			<div className="flex flex-col gap-4 py-2">
				{pipelines === undefined ? null : filtered.length === 0 ? (
					<div className="rounded-[var(--radius)] border border-dashed py-8 text-center text-sm text-muted-foreground">
						No pipelines yet.
					</div>
				) : (
					filtered.map((p) => (
						<PipelineEditor
							key={p._id}
							pipeline={p}
							orgId={orgId}
							dealCount={dealCounts?.[p._id]}
							onDeleted={handleDeleted}
						/>
					))
				)}
			</div>
		</SettingsSection>
	);
}
