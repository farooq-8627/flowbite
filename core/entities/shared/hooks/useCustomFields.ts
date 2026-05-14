"use client";

/**
 * useCustomFields — live list of user-defined custom fields for a given entity.
 *
 * Wraps `api.crm.fields.fieldDefinitions.queries.listByEntity` and maps each
 * row to the `{ key, label }` shape consumed by ViewOptionsMenu.
 *
 * The static FIELD_CATALOG still drives built-in fields (status, email, …);
 * this hook returns the delta — user-created fields like "Budget" or
 * "Contract file" — so the view-options popover can show both in a single list.
 *
 * Accepts either an `orgId` directly (settings pages) or an `orgSlug` (entity
 * views already in the dashboard shell).
 */

import { useQuery } from "convex/react";
import { useMemo } from "react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import type { EntitySlot } from "../types";

/** The slot name → the backend `entityType` value, plural in a few places. */
const SLOT_TO_ENTITY_TYPE: Record<EntitySlot, string> = {
	lead: "leads",
	contact: "contacts",
	deal: "deals",
	company: "companies",
};

export interface CustomField {
	key: string;
	label: string;
	type: string;
}

export function useCustomFields(slot: EntitySlot, orgId: Id<"orgs"> | undefined): CustomField[] {
	const entityType = SLOT_TO_ENTITY_TYPE[slot];
	const rows = useQuery(
		api.crm.fields.fieldDefinitions.queries.listByEntity,
		orgId ? { orgId, entityType } : "skip",
	);

	return useMemo(() => {
		return (rows ?? []).map((f) => ({
			key: f.name,
			label: f.label,
			type: f.type,
		}));
	}, [rows]);
}
