"use client";

/**
 * SlotFieldsSection — per-slot Fields editor.
 *
 * Wraps the existing `FieldEditor` (create / edit / hide / delete / reorder).
 * Singular entityType matches `fieldDefinitions.entityType` everywhere else.
 */

import type { Id } from "@/convex/_generated/dataModel";
import type { EntitySlot } from "@/core/entities/shared/types";
import { SettingsSection } from "../../shared/SettingsSection";
import { FieldEditor } from "../crm/FieldEditor";

interface Props {
	slot: EntitySlot;
	orgId: Id<"orgs">;
}

export function SlotFieldsSection({ slot, orgId }: Props) {
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
