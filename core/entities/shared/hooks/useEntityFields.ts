"use client";

/**
 * useEntityFields — the single field-system entry point for ANY consumer
 * (table, form, card, view options, profile).
 *
 * Reads `fieldDefinitions` rows for the given slot, sorts by `order`, and
 * exposes pre-categorised buckets so consumers don't re-derive them. Also
 * triggers a one-time idempotent seed if the org has zero rows for the slot
 * (lazy fallback for existing dev orgs that pre-date dynamic fields — new
 * orgs get rows on onboarding).
 *
 * SCOPE
 *   `allFields`        — every row, ordered.
 *   `visibleFields`    — `!hidden` (admin-global hide).
 *   `tableFields`      — visible, presentable as a column. Today this equals
 *                        `visibleFields`. We deliberately do NOT filter tables
 *                        by `showInStages` — tables are cross-stage views.
 *   `formFields`       — visible, editable, AND honors `showInStages` when
 *                        `currentStageId` is provided (deal forms).
 *   `cardPinnedKinds`  — fixed by design (avatar, name, email, code, tags).
 *
 * SEEDING
 *   When the query resolves to an empty array AND we have a real orgId,
 *   we fire `ensureForOrg(orgId)` once. Idempotent on the server. The
 *   reactive query re-fires when rows appear.
 *
 * DEFINING NEW SPECIAL RENDERERS
 *   Add the `kind` to the dispatcher in shared/components/cells (cells) and
 *   shared/components/inputs (form). The hook itself is renderer-agnostic.
 */

import { useMutation, useQuery } from "convex/react";
import { useEffect, useMemo, useRef } from "react";
import { api } from "@/convex/_generated/api";
import type { Doc, Id } from "@/convex/_generated/dataModel";
import type { EntitySlot } from "../types";

const SLOT_TO_ENTITY_TYPE: Record<EntitySlot, string> = {
	lead: "lead",
	contact: "contact",
	deal: "deal",
	company: "company",
};

/** Kinds that have a designed slot on the card. Cards do NOT iterate fields. */
export const CARD_PINNED_KINDS = new Set([
	"displayName",
	"email",
	"tags",
	"personCode",
	"entityCode",
]);

export type FieldDef = Doc<"fieldDefinitions">;

interface UseEntityFieldsOptions {
	/** Deal-only: filter `formFields` by current stage (honors `showInStages`). */
	currentStageId?: string;
}

export interface UseEntityFieldsResult {
	allFields: FieldDef[];
	visibleFields: FieldDef[];
	tableFields: FieldDef[];
	formFields: FieldDef[];
	cardPinnedKinds: typeof CARD_PINNED_KINDS;
	isLoading: boolean;
}

export function useEntityFields(
	slot: EntitySlot,
	orgId: Id<"orgs"> | undefined,
	options?: UseEntityFieldsOptions,
): UseEntityFieldsResult {
	const entityType = SLOT_TO_ENTITY_TYPE[slot];
	const rows = useQuery(
		api.crm.fields.fieldDefinitions.queries.listByEntity,
		orgId ? { orgId, entityType } : "skip",
	);
	const ensureForOrg = useMutation(api.crm.fields.fieldDefinitions.mutations.ensureForOrg);

	// Lazy-seed: if the query has resolved (not undefined) but is empty for a
	// real org, fire the idempotent ensureForOrg mutation exactly once per
	// (orgId, entityType) per session.
	const seededFor = useRef<Set<string>>(new Set());
	useEffect(() => {
		if (!orgId) return;
		if (rows === undefined) return;
		if (rows.length > 0) return;
		const key = `${orgId}::${entityType}`;
		if (seededFor.current.has(key)) return;
		seededFor.current.add(key);
		ensureForOrg({ orgId }).catch(() => {
			// safe to ignore — idempotent on the server; transient failure self-heals next render
		});
	}, [orgId, entityType, rows, ensureForOrg]);

	return useMemo<UseEntityFieldsResult>(() => {
		const all = rows ?? [];
		const visible = all.filter((f) => !f.hidden);

		const table = visible;

		const form = visible.filter((f) => {
			// Read-only, system-generated kinds are never edited in forms.
			if (f.kind === "personCode" || f.kind === "entityCode") return false;
			// Stage-aware filtering: if `showInStages` is set, only include the
			// field when the current stage matches (deal forms). When no current
			// stage is supplied, default to "show all" (admin editing template).
			if (f.showInStages && f.showInStages.length > 0) {
				if (!options?.currentStageId) return true;
				return f.showInStages.includes(options.currentStageId);
			}
			return true;
		});

		return {
			allFields: all,
			visibleFields: visible,
			tableFields: table,
			formFields: form,
			cardPinnedKinds: CARD_PINNED_KINDS,
			isLoading: rows === undefined,
		};
	}, [rows, options?.currentStageId]);
}
