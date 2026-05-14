"use client";

/**
 * useEntityFieldValuesMap — single-query batched read of every custom field
 * value for one (orgId, entityType). The view passes the resulting map down to
 * card / column renderers so they can show "Budget", "Industry", "Resume"…
 * without each row triggering its own query.
 *
 * Shape: `valuesByEntityId[entityId][fieldName] = value`.
 *
 * Cost: O(values for the entityType) — bounded by the org's CRM size, scanned
 * once via the `fieldValues.by_entity` index prefix on (orgId, entityType).
 */

import { useQuery } from "convex/react";
import { useMemo } from "react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import type { EntitySlot } from "../types";

const SLOT_TO_ENTITY_TYPE: Record<EntitySlot, string> = {
	lead: "lead",
	contact: "contact",
	deal: "deal",
	company: "company",
};

export function useEntityFieldValuesMap(slot: EntitySlot, orgId: Id<"orgs"> | undefined) {
	const entityType = SLOT_TO_ENTITY_TYPE[slot];
	const data = useQuery(
		api.crm.fields.fieldValues.queries.listForEntityType,
		orgId ? { orgId, entityType } : "skip",
	);

	const valuesByEntityId = useMemo(
		() => (data ?? {}) as Record<string, Record<string, unknown>>,
		[data],
	);

	return { valuesByEntityId, isLoading: data === undefined };
}
