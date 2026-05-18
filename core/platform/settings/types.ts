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
		modules?: Array<{
			slot: string;
			label?: string;
			hidden?: boolean;
			order?: number;
			defaultView?: "list" | "board";
			cardFields?: string[];
			listColumns?: string[];
			boardGroupBy?: string;
		}>;
		badgeCountsVisible?: boolean;
		reminderDefaults?: {
			followUpWindowHours?: number;
			staleAlertDays?: number;
			morningBriefingEnabled?: boolean;
			morningBriefingTime?: string;
			rentAlertDays?: number;
			rentAlertEnabled?: boolean;
		};
		/**
		 * Follow-up cadence defaults — apply to reminders with
		 * `source === "followup"` only. See
		 * CODE-ARCHITECTURE-TIMELINE-FOLLOWUPS.md.
		 */
		followupDefaults?: {
			defaultDueOffsetDays?: number;
			defaultPriority?: "low" | "normal" | "high" | "urgent";
			autoCloseAfterDays?: number;
			notifyAssignee?: boolean;
			requireDealCode?: boolean;
			reminderBeforeHours?: number;
		};
		/**
		 * File upload policy. Controls which file categories are accepted
		 * across the workspace. Empty / undefined = allow all.
		 * Categories: "image" | "pdf" | "document" | "spreadsheet" | "video"
		 *           | "audio" | "archive" | "other"
		 */
		fileUpload?: {
			allowedMimeCategories?: string[];
			maxSizeMb?: number;
		};
	} | null;
};

/** Default entity labels — used as fallback when org hasn't customised them */
export const ENTITY_LABEL_DEFAULTS = {
	lead: { singular: "Lead", plural: "Leads", slug: "leads" },
	contact: { singular: "Contact", plural: "Contacts", slug: "contacts" },
	deal: { singular: "Deal", plural: "Deals", slug: "deals" },
	company: { singular: "Company", plural: "Companies", slug: "companies" },
} satisfies Required<OrgEntityLabels>;

export function resolveEntityLabels(raw?: OrgEntityLabels | null): Required<OrgEntityLabels> {
	return {
		lead: { ...ENTITY_LABEL_DEFAULTS.lead, ...(raw?.lead ?? {}) },
		contact: { ...ENTITY_LABEL_DEFAULTS.contact, ...(raw?.contact ?? {}) },
		deal: { ...ENTITY_LABEL_DEFAULTS.deal, ...(raw?.deal ?? {}) },
		company: { ...ENTITY_LABEL_DEFAULTS.company, ...(raw?.company ?? {}) },
	};
}
