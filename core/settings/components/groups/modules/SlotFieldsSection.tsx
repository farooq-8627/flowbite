"use client";

/**
 * SlotFieldsSection — per-slot Custom Fields editor.
 *
 * Thin wrapper over the existing `FieldEditor` with a SettingsSection frame
 * so the card shares the same visual rhythm as every other settings card.
 *
 * `FieldEditor` is plural-keyed ("leads", "contacts", ...) — we map the slot
 * to its plural key here.
 */

import type { Id } from "@/convex/_generated/dataModel";
import type { EntitySlot } from "@/core/entities/shared/types";
import { SettingsSection } from "../../shared/SettingsSection";
import { FieldEditor } from "../crm/FieldEditor";

const SLOT_TO_ENTITY_TYPE: Record<EntitySlot, "leads" | "contacts" | "deals" | "companies"> = {
	lead: "leads",
	contact: "contacts",
	deal: "deals",
	company: "companies",
};

interface Props {
	slot: EntitySlot;
	orgId: Id<"orgs">;
}

export function SlotFieldsSection({ slot, orgId }: Props) {
	const entityType = SLOT_TO_ENTITY_TYPE[slot];
	return (
		<SettingsSection
			id={`modules.${slot}.fields`}
			title="Custom Fields"
			description="Add your own fields — text, number, date, select, boolean. Shown in the detail view, searchable, exportable."
		>
			<FieldEditor orgId={orgId} entityType={entityType} />
		</SettingsSection>
	);
}
