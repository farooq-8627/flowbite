import type { Id } from "@/convex/_generated/dataModel";

export type EntityLabel = { singular: string; plural: string; slug: string };

export type OrgEntityLabels = {
	lead?: EntityLabel;
	contact?: EntityLabel;
	deal?: EntityLabel;
	company?: EntityLabel;
};

export type OrgSettings = {
	_id: Id<"orgs">;
	name: string;
	slug: string;
	plan: string;
	logoStorageId?: Id<"_storage">;
	industry?: string;
	aiContext?: string;
	entityLabels?: OrgEntityLabels | null;
	settings?: {
		timezone?: string;
		defaultCurrency?: string;
		codePrefixes?: {
			person?: string;
			deal?: string;
			company?: string;
			followup?: string;
		};
		modules?: Array<{ slot: string; label?: string; hidden?: boolean; order?: number }>;
		badgeCountsVisible?: boolean;
		reminderDefaults?: {
			followUpWindowHours?: number;
			staleAlertDays?: number;
			morningBriefingEnabled?: boolean;
			morningBriefingTime?: string;
			rentAlertDays?: number;
			rentAlertEnabled?: boolean;
		};
	} | null;
};

/** Default entity labels — used as fallback when org hasn't customised them */
export const ENTITY_LABEL_DEFAULTS = {
	lead:    { singular: "Lead",    plural: "Leads",     slug: "leads"     },
	contact: { singular: "Contact", plural: "Contacts",  slug: "contacts"  },
	deal:    { singular: "Deal",    plural: "Deals",     slug: "deals"     },
	company: { singular: "Company", plural: "Companies", slug: "companies" },
} satisfies Required<OrgEntityLabels>;

export function resolveEntityLabels(raw?: OrgEntityLabels | null): Required<OrgEntityLabels> {
	return {
		lead:    { ...ENTITY_LABEL_DEFAULTS.lead,    ...(raw?.lead    ?? {}) },
		contact: { ...ENTITY_LABEL_DEFAULTS.contact, ...(raw?.contact ?? {}) },
		deal:    { ...ENTITY_LABEL_DEFAULTS.deal,    ...(raw?.deal    ?? {}) },
		company: { ...ENTITY_LABEL_DEFAULTS.company, ...(raw?.company ?? {}) },
	};
}
