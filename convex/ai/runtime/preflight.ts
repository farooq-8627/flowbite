/**
 * Pre-flight context layer — convex/ai/runtime/preflight.ts
 *
 * Locked 2026-06-06 (per the user). The agent host originally drove
 * every entity-related turn through a `describe_entity` round-trip
 * before the first write — burning 2-4 of the 25 step budget on a
 * pure DB read of org-stable data the model could have had inlined
 * in the prompt from the first token.
 *
 * Pre-flight collapses that round-trip: AFTER the adaptive router
 * decides which capability groups to preload, we run ONE batch of
 * `fieldDefinitions.listByEntityForAI` reads (one per relevant entity
 * type), render the results into a compact "## Custom fields" block,
 * and inline it into the per-turn prompt TAIL. The tail is part of
 * the cached system prompt on Anthropic / OpenAI / Google so cache-
 * hit reads make the marginal token cost minimal; the win is one
 * fewer step per write-heavy turn.
 *
 * The block is informational, not normative — the model still calls
 * `describe_entity` when it needs the full payload (defaults, kind,
 * options, sensitive flags, etc.). Pre-flight just covers the 80%
 * case where "name + label + type + required + options" is enough
 * to fill a `customFields` slot correctly on the first try.
 *
 * Module is server-side ONLY — it imports `internal` and runs Convex
 * queries via the host's ActionCtx. Tests can exercise the pure
 * `renderPreflightContext` separately by constructing a
 * PreflightContext fixture.
 */
import { internal } from "../../_generated/api";
import type { CapabilityCtx, Principal } from "../registry/types";

/** The four CRM entity types that carry org-defined custom fields today. */
export type PreflightEntityType = "lead" | "contact" | "deal" | "company";

/** A single render-ready row pulled from `fieldDefinitions`. */
export type PreflightFieldRow = {
	name: string;
	label: string;
	type: string;
	required: boolean;
	/** Present for `type === "select"` / `"multiselect"` / similar. */
	options?: ReadonlyArray<string>;
};

/**
 * Result of a pre-flight read. `byEntity` is keyed by entity type so
 * `renderPreflightContext` can emit one heading per type. Empty entries
 * (org has no custom fields for that type) render no heading.
 */
export type PreflightContext = {
	byEntity: Partial<Record<PreflightEntityType, ReadonlyArray<PreflightFieldRow>>>;
};

/**
 * Map active capability group keys → the entity types whose custom
 * field definitions we should pre-load. The router already tells us
 * which groups it preloaded; this just unpacks them.
 *
 *   leads        → ["lead", "contact"]   (one file owns both)
 *   contacts     → ["contact"]
 *   deals        → ["deal"]
 *   companies    → ["company"]
 *   bulk         → all four              (bulk surface targets any)
 *
 * Other group keys (notes, tasks, timeline, settings…) contribute no
 * entity types — they don't read custom-field definitions in their
 * playbooks. Returning a deduped, sorted array keeps the read order
 * stable for tests.
 */
export function entityTypesForGroups(
	groups: ReadonlyArray<string>,
): ReadonlyArray<PreflightEntityType> {
	const set = new Set<PreflightEntityType>();
	for (const g of groups) {
		switch (g) {
			case "leads":
				set.add("lead");
				set.add("contact");
				break;
			case "contacts":
				set.add("contact");
				break;
			case "deals":
				set.add("deal");
				break;
			case "companies":
				set.add("company");
				break;
			case "bulk":
				set.add("lead");
				set.add("contact");
				set.add("deal");
				set.add("company");
				break;
		}
	}
	return Array.from(set).sort();
}

/**
 * Read the live `fieldDefinitions` for each entity type and build a
 * PreflightContext. Hidden + system fields are dropped — the model
 * shouldn't fill them, and surfacing them just bloats the prompt.
 *
 * Failure-tolerant: a per-entity query that throws (RBAC denied,
 * schema drift, etc.) lands as an empty list for that entity rather
 * than aborting the whole preflight. The host then runs the turn
 * without inlined context, and the model falls back to
 * `describe_entity` exactly as before.
 *
 * Cost: one `listByEntityForAI` query per entity type. Bulk turns
 * (group=bulk) burn 4 reads; per-entity turns burn 1-2. Each query
 * hits a single index (`by_org_and_entity`) — sub-millisecond.
 */
export async function loadPreflightContext(
	cap: Pick<CapabilityCtx, "ctx"> & { principal: Pick<Principal, "orgId" | "userId"> },
	entityTypes: ReadonlyArray<PreflightEntityType>,
): Promise<PreflightContext> {
	const byEntity: Partial<Record<PreflightEntityType, ReadonlyArray<PreflightFieldRow>>> = {};
	for (const entityType of entityTypes) {
		const defs = (await cap.ctx
			.runQuery(internal.crm.fields.fieldDefinitions.queries.listByEntityForAI, {
				orgId: cap.principal.orgId,
				userId: cap.principal.userId,
				entityType,
			})
			.catch(() => [])) as Array<{
			name?: unknown;
			label?: unknown;
			type?: unknown;
			required?: unknown;
			options?: unknown;
			hidden?: unknown;
			system?: unknown;
		}>;
		const rows: PreflightFieldRow[] = [];
		for (const d of defs) {
			if (typeof d.name !== "string" || typeof d.label !== "string") continue;
			if (d.hidden === true || d.system === true) continue;
			const type = typeof d.type === "string" ? d.type : "text";
			const required = d.required === true;
			const options = Array.isArray(d.options)
				? d.options.filter((o): o is string => typeof o === "string")
				: undefined;
			rows.push({
				name: d.name,
				label: d.label,
				type,
				required,
				...(options && options.length > 0 ? { options } : {}),
			});
		}
		if (rows.length > 0) byEntity[entityType] = rows;
	}
	return { byEntity };
}

/**
 * Render a PreflightContext into the markdown block that lands in the
 * per-turn prompt TAIL. Empty contexts render an empty string so the
 * caller can `if (block.length > 0) lines.push(block)`.
 *
 * The block is intentionally compact:
 *
 *   ## Custom fields
 *   _Use the `key` (NOT the `label`) when filling `customFields`._
 *   ### Lead
 *   - key:`property_type` label:"Property Type" type:select required options:[Apartment, Villa]
 *   - key:`budget_aed` label:"Budget (AED)" type:number
 *   ### Deal
 *   - …
 *
 * The reminder line about `key` vs `label` is the same hint baked into
 * the leads playbook — repeating it here next to the fields keeps it
 * fresh in the model's window without needing the tool round-trip.
 */
export function renderPreflightContext(pre: PreflightContext): string {
	const entries = Object.entries(pre.byEntity) as Array<
		[PreflightEntityType, ReadonlyArray<PreflightFieldRow>]
	>;
	const filled = entries.filter(([, rows]) => rows.length > 0);
	if (filled.length === 0) return "";
	const lines: string[] = [];
	lines.push("## Custom fields");
	lines.push(
		"_Use the `key` (NOT the `label`) when filling `customFields` — the runner coerces label-shaped keys as a safety net but unknown keys still surface as `unknownFields`._",
	);
	for (const [entityType, rows] of filled) {
		lines.push(`### ${entityType[0].toUpperCase()}${entityType.slice(1)}`);
		for (const r of rows) {
			const parts: string[] = [`key:\`${r.name}\``, `label:"${r.label}"`, `type:${r.type}`];
			if (r.required) parts.push("required");
			if (r.options && r.options.length > 0) {
				parts.push(
					`options:[${r.options.slice(0, 12).join(", ")}${r.options.length > 12 ? ", …" : ""}]`,
				);
			}
			lines.push(`- ${parts.join(" ")}`);
		}
	}
	return lines.join("\n").trim();
}
