/**
 * Entity-label types & defaults — extracted into a leaf module so
 * `useCurrentOrg.tsx` and `useEntityLabels.ts` can both import from here
 * without forming a cycle.
 *
 * Don't add hooks or React-only code here.
 */

export type EntityLabel = { singular: string; plural: string; slug: string };
export type EntitySlot = "lead" | "contact" | "deal" | "company";
export type EntityLabels = Record<EntitySlot, EntityLabel>;

export const ENTITY_LABEL_DEFAULTS: EntityLabels = {
	lead: { singular: "Lead", plural: "Leads", slug: "leads" },
	contact: { singular: "Contact", plural: "Contacts", slug: "contacts" },
	deal: { singular: "Deal", plural: "Deals", slug: "deals" },
	company: { singular: "Company", plural: "Companies", slug: "companies" },
};

/** Merge server labels with defaults so every slot is always fully populated. */
export function mergeEntityLabelDefaults(
	raw: Partial<EntityLabels> | null | undefined,
): EntityLabels {
	return {
		lead: { ...ENTITY_LABEL_DEFAULTS.lead, ...(raw?.lead ?? {}) },
		contact: { ...ENTITY_LABEL_DEFAULTS.contact, ...(raw?.contact ?? {}) },
		deal: { ...ENTITY_LABEL_DEFAULTS.deal, ...(raw?.deal ?? {}) },
		company: { ...ENTITY_LABEL_DEFAULTS.company, ...(raw?.company ?? {}) },
	};
}
