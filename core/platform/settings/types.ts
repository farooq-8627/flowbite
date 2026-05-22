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
		/**
		 * Phase 3A — dashboard widget rank list (template-driven). Each
		 * entry is a widget key; order = display priority.
		 */
		dashboardMetrics?: string[];
		/**
		 * Phase 3A — per-org soft-delete retention (days). Range 7–365.
		 * Default 30. Surfaced in platform-owner dashboard.
		 */
		softDeleteRetentionDays?: number;
		/**
		 * Phase 3A — set when the template seeder created sample records.
		 * Drives the dashboard banner and gates the "Delete sample data"
		 * button in Settings → Workspace.
		 */
		mockDataSeededAt?: number;
		/**
		 * Phase 3A — user dismissed the dashboard mock-data banner. The
		 * data may still be there; only the banner is gone. Settings UI
		 * still surfaces the button while `mockDataSeededAt` is set.
		 */
		mockDataDismissedAt?: number;
		/**
		 * Phase 3A GDPR — countdown timer for cascade-delete of the org.
		 */
		deletionScheduledAt?: number;
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
