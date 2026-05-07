"use client";

import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";

/** Default labels — used as fallback when org hasn't configured custom labels */
const DEFAULTS = {
	lead: { singular: "Lead", plural: "Leads", slug: "leads" },
	contact: { singular: "Contact", plural: "Contacts", slug: "contacts" },
	deal: { singular: "Deal", plural: "Deals", slug: "deals" },
	company: { singular: "Company", plural: "Companies", slug: "companies" },
} as const;

export type EntitySlot = keyof typeof DEFAULTS;
export type EntityLabel = { singular: string; plural: string; slug: string };
export type EntityLabels = Record<EntitySlot, EntityLabel>;

/**
 * Returns entity labels for the org with fallbacks to defaults.
 * Use this everywhere entity names appear — never hardcode "Lead", "Contact" etc.
 *
 * @example
 * const labels = useEntityLabels(orgId);
 * <h1>{labels.lead.plural}</h1>  // "Leads" or "Inquiries" or whatever org configured
 */
export function useEntityLabels(orgId: Id<"orgs">): EntityLabels {
	const labels = useQuery(api.orgs.queries.getEntityLabels, { orgId });

	return {
		lead: labels?.lead ?? DEFAULTS.lead,
		contact: labels?.contact ?? DEFAULTS.contact,
		deal: labels?.deal ?? DEFAULTS.deal,
		company: labels?.company ?? DEFAULTS.company,
	};
}
