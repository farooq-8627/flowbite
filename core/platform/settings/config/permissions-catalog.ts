/**
 * Frontend permissions catalog — THIN LABEL-INTERPOLATION LAYER.
 *
 * The actual catalog of permissions lives in
 * `convex/_shared/permissions/catalog.ts` (the SSOT). This file does ONE
 * thing: take that catalog and interpolate `{lead}` / `{leads}` /
 * `{Lead}` / `{Leads}` placeholders with the org's renamed entity labels
 * so the role-editor UI shows "View inquiries" instead of "View leads"
 * when an admin renamed the entity.
 *
 * To add a permission: edit `convex/_shared/permissions/catalog.ts` —
 * NEVER edit this file. The role editor, the seed permissions, the
 * server-side `requireRole()`, and the migration backfill all derive
 * from the same SSOT automatically.
 *
 * Sources:
 *   - convex/_shared/permissions/catalog.ts (the SSOT)
 *   - core/shared/hooks/useEntityLabels.ts (label resolver)
 */

import {
	PERMISSION_CATALOG,
	PERMISSION_MODULE_LABELS,
	PERMISSION_MODULE_ORDER,
	type PermissionEntry,
} from "@/convex/_shared/permissions/catalog";
import {
	ENTITY_LABEL_DEFAULTS,
	type EntityLabels,
} from "@/core/shell/shared/hooks/useEntityLabels";

// ─── Types ───────────────────────────────────────────────────────────────────

export type PermissionDef = {
	key: string;
	label: string;
	description?: string;
};

export type PermissionModule = {
	id: string;
	label: string;
	description?: string;
	permissions: PermissionDef[];
};

// ─── Label interpolation ─────────────────────────────────────────────────────

/**
 * Build the placeholder map from EntityLabels. Lowercase tokens
 * (`{lead}` / `{leads}`) for in-sentence use, capitalised tokens
 * (`{Lead}` / `{Leads}`) for headlines / module titles.
 */
function buildTokenMap(labels: EntityLabels): Record<string, string> {
	const lc = (s: string) => s.toLowerCase();
	return {
		lead: lc(labels.lead.singular),
		leads: lc(labels.lead.plural),
		Lead: labels.lead.singular,
		Leads: labels.lead.plural,
		contact: lc(labels.contact.singular),
		contacts: lc(labels.contact.plural),
		Contact: labels.contact.singular,
		Contacts: labels.contact.plural,
		deal: lc(labels.deal.singular),
		deals: lc(labels.deal.plural),
		Deal: labels.deal.singular,
		Deals: labels.deal.plural,
		company: lc(labels.company.singular),
		companies: lc(labels.company.plural),
		Company: labels.company.singular,
		Companies: labels.company.plural,
	};
}

/**
 * Replace `{token}` placeholders with values from the token map. Unknown
 * tokens are left unchanged so the breakage is visible during dev.
 */
function interpolate(template: string, tokens: Record<string, string>): string {
	return template.replace(/\{(\w+)\}/g, (_, key) => tokens[key] ?? `{${key}}`);
}

// ─── Public API ──────────────────────────────────────────────────────────────

/**
 * Build the permission-module catalog for the given set of entity labels.
 *
 * Pass the hook output from `useEntityLabels()` — this keeps permission
 * labels in lockstep with the admin's renamed entities. Falls back to the
 * English defaults when called without an argument (e.g. from unit tests).
 */
export function getPermissionModules(
	labels: EntityLabels = ENTITY_LABEL_DEFAULTS,
): PermissionModule[] {
	const tokens = buildTokenMap(labels);

	// Group catalog by module while preserving catalog order within each
	// module. We then emit modules in the SSOT-defined order.
	const byModule = new Map<string, PermissionEntry[]>();
	for (const entry of PERMISSION_CATALOG) {
		const list = byModule.get(entry.module) ?? [];
		list.push(entry);
		byModule.set(entry.module, list);
	}

	return PERMISSION_MODULE_ORDER.filter((id) => byModule.has(id)).map((id) => {
		const meta = PERMISSION_MODULE_LABELS[id];
		const moduleLabel = meta?.label ? interpolate(meta.label, tokens) : id;
		return {
			id,
			label: moduleLabel,
			description: meta?.description,
			permissions: (byModule.get(id) ?? []).map((entry) => ({
				key: entry.key,
				label: interpolate(entry.label, tokens),
				description: entry.description ? interpolate(entry.description, tokens) : undefined,
			})),
		};
	});
}

/** Static fallback catalog using English defaults. */
export const PERMISSION_MODULES: PermissionModule[] = getPermissionModules();

/** Flat list of every permission key — used to validate roles. */
export const ALL_PERMISSION_KEYS: readonly string[] = PERMISSION_CATALOG.map((p) => p.key);
