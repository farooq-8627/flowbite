/**
 * Dynamic field dispatcher — convex/crm/shared/dynamicFieldDispatch.ts
 *
 * SINGLE SOURCE OF TRUTH for "AI passed a flat row of field values, where
 * does each one go?" — driven 100% by the org's live `fieldDefinitions`
 * rows. NO hardcoded column allowlists ANYWHERE; if admin adds a
 * column-backed or fieldValues-backed field via the field manager, the
 * AI can write to it on the very next turn.
 *
 * Replaces TWO older anti-patterns that hardcoded entity columns:
 *   • `_shared/aiEntityPatch.ts:splitPatchForEntity::COLUMN_KEYS`
 *   • `crm/shared/bulkRowPartition.ts:ENTITY_COLUMN_KEYS`
 *
 * Both used a hardcoded set of "known column keys" per entity, which:
 *   1. Missed admin-added column-backed fields (false-negative drop).
 *   2. Drifted out of sync with createForAI mutation validators (status
 *      was a real lead column but missing from the bulk hardcode).
 *   3. Treated the data model as static, contradicting the documented
 *      "everything is upgradable / dynamic" principle.
 *
 * The dispatcher reads the org's `fieldDefinitions` rows ONCE per call
 * (caller pre-fetches via `loadFieldDefinitionsForEntity`) and routes
 * each top-level row key by the def's `storage` flag:
 *
 *   storage:"column"      → push to `columnArgs` keyed by `def.columnKey ?? def.name`
 *   storage:"fieldValues" → push to `customFields` keyed by `def.name`
 *   storage:"join"        → push to `joinFields`  keyed by `def.name`
 *                           (e.g. `tags` — caller handles separately)
 *   storage missing       → fall back to fieldValues bucket (matches
 *                           legacy data where pre-storage-flag fields
 *                           lived in fieldValues)
 *   no def found          → land in `dropped[]` so the caller can warn
 *                           the user / model
 *
 * The `customFields:{}` slot the AI sometimes sends explicitly is also
 * threaded through — its contents go through the same lookup so a model
 * that nested `{customFields:{"Property Type":"Apartment"}}` ends up at
 * `customFields:{property_type:"Apartment"}` (label → canonical name).
 *
 * Per-entity Convex `*ForAI` mutation validators are still the
 * authoritative WRITE surface — they hardcode their accepted column
 * args (Convex requires explicit arg validators). The dispatcher's
 * job is to RESHAPE the AI's flat row into the right buckets so the
 * mutation call doesn't fail with `ArgumentValidationError`. Anything
 * the dispatcher routes to columnArgs MUST match a key the createForAI
 * validator accepts. Mismatch surfaces as a per-row error from the
 * mutation itself — also picked up by the warnings rail in the bulk
 * runner.
 */

import { internal } from "../../_generated/api";
import type { Doc, Id } from "../../_generated/dataModel";
import type { CapabilityCtx } from "../../ai/registry/types";

// ─── Types ──────────────────────────────────────────────────────────────────

/** The four CRM entity types that carry org-defined dynamic fields. */
export type DynamicEntityType = "lead" | "contact" | "deal" | "company";

/**
 * Minimal projection of `fieldDefinitions` rows the dispatcher needs.
 * Loaders return this shape so tests + callers don't depend on the
 * full Doc<"fieldDefinitions"> surface.
 */
export type FieldDefRow = {
	name: string;
	label?: string;
	storage?: "column" | "fieldValues" | "join" | string;
	columnKey?: string;
	hidden?: boolean;
	system?: boolean;
};

/** What the dispatcher returns for ONE row. */
export type DispatchedRow = {
	/** Top-level args for the entity's `createForAI` / `updateForAI` mutation. */
	columnArgs: Record<string, unknown>;
	/** Map for the `customFields:{}` slot — written via `applyCustomFieldsForRecordImpl`. */
	customFields: Record<string, unknown>;
	/** Join-stored fields (e.g. `tags`). The caller handles persistence. */
	joinFields: Record<string, unknown>;
	/** Keys that matched no fieldDefinitions row — surfaced as warnings. */
	dropped: string[];
};

// ─── Lookup builder ─────────────────────────────────────────────────────────

/**
 * Read the org's live `fieldDefinitions` for an entity type and project
 * to the minimal shape the dispatcher needs. Failure-tolerant — RBAC
 * denial / schema drift returns an empty list so the caller falls back
 * to "everything dropped except known system slots" (better than silent
 * loss).
 *
 * One DB read per call. Caller is expected to cache for a turn.
 */
export async function loadFieldDefinitionsForEntity(
	cap: CapabilityCtx,
	entityType: DynamicEntityType,
): Promise<FieldDefRow[]> {
	const defs = (await cap.ctx
		.runQuery(internal.crm.fields.fieldDefinitions.queries.listByEntityForAI, {
			orgId: cap.principal.orgId,
			userId: cap.principal.userId,
			entityType,
		})
		.catch(() => [])) as Array<{
		name: string;
		label?: string;
		storage?: string;
		columnKey?: string;
		hidden?: boolean;
		system?: boolean;
	}>;
	return defs;
}

/**
 * Given the array of fieldDefinitions, build a case-insensitive
 * lookup map: `lower(name)` AND `lower(label)` → FieldDefRow.
 *
 * Used by both the dispatcher (this file) and any helper that wants to
 * resolve a label-shaped key to its canonical FieldDefRow.
 *
 * Hidden fields are EXCLUDED — admin opted them out of the UI; the AI
 * shouldn't write to them either. System-protected fields (e.g.
 * `personCode`) are INCLUDED but the entity's `createForAI` validator
 * will reject them as expected.
 */
export function buildFieldDefLookup(defs: FieldDefRow[]): Map<string, FieldDefRow> {
	const lookup = new Map<string, FieldDefRow>();
	for (const def of defs) {
		if (def.hidden === true) continue;
		const name = def.name?.toLowerCase();
		const label = def.label?.toLowerCase();
		if (name && name.length > 0 && !lookup.has(name)) lookup.set(name, def);
		if (label && label.length > 0 && !lookup.has(label)) lookup.set(label, def);
	}
	return lookup;
}

// ─── The dispatcher ─────────────────────────────────────────────────────────

/**
 * Pure function. Splits a flat row's keys into columnArgs / customFields
 * / joinFields / dropped buckets driven entirely by `fieldDefLookup`.
 *
 * Lookup precedence per top-level key:
 *   1. Match the lookup (lowercased name OR label).
 *      • storage:"column"      → columnArgs[def.columnKey ?? def.name] = value
 *      • storage:"fieldValues" → customFields[def.name] = value
 *      • storage:"join"        → joinFields[def.name] = value
 *      • storage missing       → customFields[def.name] = value (legacy default)
 *   2. Special key `customFields` — its CONTENTS are recursed through
 *      the same lookup so a model that nested label-shaped keys still
 *      lands in the right canonical-name bucket. Applied LAST so an
 *      explicit nested customFields entry beats a top-level lift on
 *      conflict.
 *   3. No lookup match → `dropped[]`. Caller surfaces as a warning.
 *
 * The dispatcher is deliberately DUMB about which columnArgs the
 * downstream mutation accepts — that's the mutation validator's job.
 * Mismatch (e.g. `status` is column-backed but `lead.createForAI`
 * doesn't accept it on create) surfaces as an `ArgumentValidationError`
 * which the bulk runner translates to a per-row failure.
 */
export function dispatchRowKeys(
	row: Record<string, unknown>,
	fieldDefLookup: ReadonlyMap<string, FieldDefRow>,
): DispatchedRow {
	const columnArgs: Record<string, unknown> = {};
	const customFields: Record<string, unknown> = {};
	const joinFields: Record<string, unknown> = {};
	const dropped: string[] = [];

	const explicitCustomFields =
		row.customFields && typeof row.customFields === "object" && !Array.isArray(row.customFields)
			? (row.customFields as Record<string, unknown>)
			: null;

	for (const [rawKey, value] of Object.entries(row)) {
		if (rawKey === "customFields") continue;
		if (value === undefined) continue;
		const def = fieldDefLookup.get(rawKey.toLowerCase());
		if (!def) {
			dropped.push(rawKey);
			continue;
		}
		routeToBucket(def, value, columnArgs, customFields, joinFields);
	}

	// Apply explicit customFields LAST so model intent wins on conflict.
	if (explicitCustomFields) {
		for (const [rawKey, value] of Object.entries(explicitCustomFields)) {
			if (value === undefined) continue;
			const def = fieldDefLookup.get(rawKey.toLowerCase());
			if (!def) {
				// An explicit-nested key with no fieldDefinition match
				// is still a customFields entry — pass it through under
				// the raw key so downstream `applyCustomFieldsForRecordImpl`
				// can surface it as `unknownFields[]` consistently with
				// how it has always handled this case.
				customFields[rawKey] = value;
				continue;
			}
			routeToBucket(def, value, columnArgs, customFields, joinFields);
		}
	}

	return { columnArgs, customFields, joinFields, dropped };
}

/** Route ONE (def, value) pair into the right bucket. Internal helper. */
function routeToBucket(
	def: FieldDefRow,
	value: unknown,
	columnArgs: Record<string, unknown>,
	customFields: Record<string, unknown>,
	joinFields: Record<string, unknown>,
): void {
	const storage = def.storage;
	if (storage === "column") {
		const columnKey = def.columnKey ?? def.name;
		columnArgs[columnKey] = value;
		return;
	}
	if (storage === "join") {
		joinFields[def.name] = value;
		return;
	}
	// "fieldValues" OR undefined storage (legacy) → custom-field slot.
	customFields[def.name] = value;
}

// ─── Convenience: load + dispatch in one call ───────────────────────────────

/**
 * Read fieldDefinitions for the entity AND dispatch the row in one
 * helper call. Most write capabilities want this end-to-end shape.
 *
 * Returns the dispatched row PLUS the lookup map so a caller dispatching
 * many rows in one turn (bulk_create_entities) can reuse the lookup
 * without paying for a second DB read.
 */
export async function loadAndDispatchRow(
	cap: CapabilityCtx,
	entityType: DynamicEntityType,
	row: Record<string, unknown>,
): Promise<{ dispatched: DispatchedRow; lookup: ReadonlyMap<string, FieldDefRow> }> {
	const defs = await loadFieldDefinitionsForEntity(cap, entityType);
	const lookup = buildFieldDefLookup(defs);
	return { dispatched: dispatchRowKeys(row, lookup), lookup };
}

// ─── Re-export convenience type for `splitPatchForEntity` callers ──────────

/** Lookup constructed from a `Doc<"fieldDefinitions">[]` for the patch helper. */
export function fieldDefLookupFromDocs(
	defs: Array<Doc<"fieldDefinitions">>,
	options?: { includeHidden?: boolean },
): Map<string, FieldDefRow> {
	const projected: FieldDefRow[] = defs.map((d) => ({
		name: d.name,
		label: d.label,
		storage: d.storage,
		columnKey: d.columnKey,
		hidden: d.hidden,
		system: d.system,
	}));
	const filtered = options?.includeHidden
		? projected
		: projected.filter((d) => d.hidden !== true);
	return buildFieldDefLookup(filtered);
}

/**
 * Re-export the entity → table mapping the patch helper needs. Kept here
 * so any future caller using the dispatcher's lookup also has access to
 * the canonical entity-id type discriminator without re-importing from
 * `_shared/aiEntityPatch.ts` (avoids a circular module).
 */
export type DispatchedEntityId = Id<"leads"> | Id<"contacts"> | Id<"deals"> | Id<"companies">;

/**
 * Helper for single-record create capabilities — dispatches the AI's
 * extra `fields:` slot (+ optional `customFields:` slot) through the
 * unified dispatcher so column-backed fields lift to columnArgs and
 * fieldValues-backed fields land in customFields.
 *
 * Locked 2026-06-06 — replaces the per-capability `customFieldsResolver`
 * + `applyCustomFieldsForRecord` two-step pattern. The caller spreads
 * the returned `columnArgs` alongside its typed-args call to
 * `*.createForAI` (typed args win on conflict — model's explicit
 * intent wins over the dispatcher's inferred bucket).
 *
 * Returns `null` for `customFields` when the bucket would be empty so
 * the caller can spread-skip the slot:
 *   `...(d.customFields ? { customFields: d.customFields } : {})`.
 */
export async function dispatchSingleRecordFields(
	cap: CapabilityCtx,
	entityType: DynamicEntityType,
	slots: {
		fields?: Record<string, unknown>;
		customFields?: Record<string, unknown>;
	},
): Promise<{
	columnArgs: Record<string, unknown>;
	customFields: Record<string, unknown> | null;
	dropped: string[];
}> {
	const combined: Record<string, unknown> = {};
	if (slots.fields) {
		for (const [k, v] of Object.entries(slots.fields)) {
			if (v !== undefined) combined[k] = v;
		}
	}
	if (slots.customFields) combined.customFields = slots.customFields;

	const defs = await loadFieldDefinitionsForEntity(cap, entityType);
	const lookup = buildFieldDefLookup(defs);
	const dispatched = dispatchRowKeys(combined, lookup);

	return {
		columnArgs: dispatched.columnArgs,
		customFields:
			Object.keys(dispatched.customFields).length > 0 ? dispatched.customFields : null,
		dropped: [...dispatched.dropped, ...Object.keys(dispatched.joinFields)],
	};
}
