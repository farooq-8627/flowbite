/**
 * Custom-field key resolver — convex/crm/shared/customFieldKeys.ts
 *
 * Smaller models (Gemini Flash, NVIDIA Llama, Mistral) read the
 * `describe_entity` payload — which exposes both `key` (the internal
 * slug, e.g. `property_type`) and `label` (the user-facing string,
 * e.g. `"Property Type"`) — and routinely emit the LABEL when filling
 * a `customFields` slot. Per-entity `*ForAI` mutations validate keys
 * against `fieldDefinitions.name`, so the call rejects every row and
 * the batch returns "Created 0 of N — every row failed".
 *
 * Fix: at run start each calling capability reads the live
 * `fieldDefinitions` for the entity type ONCE, builds a lowercased
 * `label → name` AND `name → name` lookup, and rewrites each row's
 * keys to the canonical name BEFORE forwarding to the mutation.
 * Unrecognised keys pass through unchanged so the mutation's existing
 * `unknownFields` surfacing still works for the genuine-typo case
 * (and so column-field names like `displayName`, `email`, `status`
 * for `update_entity`'s mixed `fields` slot are untouched — column
 * names never appear as `label` in the customField lookup).
 *
 * Locked 2026-06-06. The resolver was originally inlined in
 * `convex/crm/shared/bulk/capabilities.ts` for `bulk_create_entities`;
 * extraction lets `create_lead`, `update_entity`, and `create_company`
 * share the exact same coercion path so behaviour stays consistent
 * across the bulk and per-entity surfaces.
 */
import { internal } from "../../_generated/api";
import type { CapabilityCtx } from "../../ai/registry/types";

/** The four CRM entity types that carry org-defined custom fields today. */
export type CustomFieldEntityType = "lead" | "contact" | "deal" | "company";

/**
 * A label/name → canonical-name resolver. Returned by
 * {@link buildCustomFieldKeyResolver}; closure semantics let the
 * lookup be built ONCE per call and applied per-row.
 *
 * Returns `undefined` on null/empty input so the caller can spread-skip
 * the slot (e.g. `...(resolved ? { customFields: resolved } : {})`).
 */
export type CustomFieldKeyResolver = (customFields: unknown) => Record<string, unknown> | undefined;

/**
 * Build a label→key resolver for one entity type's custom fields.
 *
 * The lookup is a `Map<lowercase string, canonical name>` keyed by:
 *   • the canonical name itself (so models that already emit `property_type`
 *     pass through unchanged)
 *   • the user-facing label (so models that emit `"Property Type"` get
 *     rewritten to `property_type`)
 *
 * Both lookups are case-insensitive — the model occasionally emits
 * `"property type"` or `"Property type"`. When a key matches NEITHER
 * the canonical name nor the label, it passes through unchanged so
 * the downstream mutation's `unknownFields` surfacing still flags it
 * to the model + user.
 *
 * On query failure (RBAC denied, schema drift, etc.) we fall back to a
 * pass-through resolver — the mutation's own validation will surface
 * any unknown keys in its existing return envelope.
 */
export async function buildCustomFieldKeyResolver(
	cap: CapabilityCtx,
	entityType: CustomFieldEntityType,
): Promise<CustomFieldKeyResolver> {
	const defs = (await cap.ctx
		.runQuery(internal.crm.fields.fieldDefinitions.queries.listByEntityForAI, {
			orgId: cap.principal.orgId,
			userId: cap.principal.userId,
			entityType,
		})
		.catch(() => [])) as Array<{ name: string; label: string }>;
	const lookup = new Map<string, string>();
	for (const d of defs) {
		if (typeof d.name === "string" && d.name.length > 0) {
			lookup.set(d.name.toLowerCase(), d.name);
		}
		if (typeof d.label === "string" && d.label.length > 0) {
			lookup.set(d.label.toLowerCase(), d.name);
		}
	}
	return makeResolverFromLookup(lookup);
}

/**
 * Pure helper used by {@link buildCustomFieldKeyResolver} and by tests.
 * Exported separately so unit tests can exercise the rewrite logic
 * without spinning up an `internalQuery`.
 */
export function makeResolverFromLookup(
	lookup: ReadonlyMap<string, string>,
): CustomFieldKeyResolver {
	return (customFields: unknown) => {
		if (!customFields || typeof customFields !== "object") return undefined;
		const entries = Object.entries(customFields as Record<string, unknown>);
		if (entries.length === 0) return undefined;
		const out: Record<string, unknown> = {};
		for (const [rawKey, value] of entries) {
			const lower = rawKey.toLowerCase();
			out[lookup.get(lower) ?? rawKey] = value;
		}
		return out;
	};
}
