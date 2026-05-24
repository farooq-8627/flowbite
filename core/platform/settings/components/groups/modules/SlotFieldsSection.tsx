"use client";

/**
 * SlotFieldsSection — per-slot Fields editor.
 *
 * Wraps the existing `FieldEditor` (create / edit / hide / delete / reorder).
 * Singular entityType matches `fieldDefinitions.entityType` everywhere else.
 *
 * 2026-05-20 — DEAL slot is intentionally excluded.
 *   Deal fields are stage-aware. Their editor lives under Settings →
 *   Pipelines → [pipeline] → Stage fields. Modules → Deal stays display-only
 *   to avoid two competing surfaces editing the same `fieldDefinitions` rows.
 */

import type { Id } from "@/convex/_generated/dataModel";
import type { EntitySlot } from "@/core/entities/shared/types";
import { useEntityLabels } from "@/core/shell/shared/hooks/useEntityLabels";
import { SettingsSection } from "../../shared/SettingsSection";
import { FieldEditor } from "./FieldEditor";

interface Props {
	slot: EntitySlot;
	orgId: Id<"orgs">;
}

export function SlotFieldsSection({ slot, orgId }: Props) {
	const labels = useEntityLabels();

	if (slot === "deal") {
		// Pipelines own deal fields. Show a deep-link instead of duplicating
		// the editor here.
		return (
			<SettingsSection
				id={`modules.${slot}.fields`}
				title="Fields"
				description={`${labels.deal.singular} fields are stage-aware. Manage them under Settings → Pipelines, where each stage can pick its own field set, required-field rules, and transition policy.`}
			>
				<div className="rounded-[var(--radius)] border border-dashed bg-muted/20 p-4 text-center">
					<p className="text-sm font-medium">Open Pipelines to manage stage fields</p>
					<p className="mt-1 text-xs text-muted-foreground">
						Deal fields differ from one stage to the next, so they live with the
						pipeline that uses them. The Pipelines settings group has a stage tab strip
						per pipeline with the same field editor.
					</p>
				</div>
			</SettingsSection>
		);
	}

	return (
		<SettingsSection
			id={`modules.${slot}.fields`}
			title="Fields"
			description="The fields that show up on this entity's form, table and profile. Reorder by dragging. Hide a field to remove it from every view at once."
		>
			<FieldEditor orgId={orgId} entityType={slot} />
		</SettingsSection>
	);
}
