/**
 * Fallback defaults for entity display configuration.
 *
 * These are used ONLY when the DB value (`orgs.settings.modules[slot].*`) is absent.
 * Admin changes in Settings override these via Convex reactivity.
 *
 * Future: dynamic via `orgs.settings.modules[slot].{cardFields,listColumns,boardGroupBy}`
 * — ALREADY DYNAMIC in this build; these are just the fallback layer.
 */

import type { EntitySlot, ViewKind } from "../types";

export const DEFAULT_VIEW: Record<EntitySlot, ViewKind> = {
	lead: "list",
	contact: "list",
	deal: "board",
	company: "list",
};

export const DEFAULT_CARD_FIELDS: Record<EntitySlot, string[]> = {
	lead: ["personCode", "displayName", "status", "source", "assignedTo", "tags"],
	contact: ["personCode", "displayName", "companyId", "email", "assignedTo", "tags"],
	deal: ["dealCode", "title", "personCode", "value", "staleIndicator", "assignedTo"],
	company: ["companyCode", "name", "industry", "contactCount", "openDealCount", "tags"],
};

export const DEFAULT_LIST_COLUMNS: Record<EntitySlot, string[]> = {
	lead: ["personCode", "displayName", "status", "source", "assignedTo", "tags", "createdAt"],
	contact: ["personCode", "displayName", "email", "companyId", "assignedTo", "tags", "createdAt"],
	deal: ["dealCode", "title", "personCode", "value", "currentStageId", "assignedTo", "createdAt"],
	company: ["companyCode", "name", "industry", "contactCount", "openDealCount", "assignedTo"],
};

export const DEFAULT_BOARD_GROUP_BY: Record<EntitySlot, string> = {
	lead: "status",
	contact: "assignedTo",
	deal: "currentStageId",
	company: "industry",
};

export const ALLOWED_BOARD_GROUP_BY: Record<EntitySlot, string[]> = {
	lead: ["status", "assignedTo", "source", "tag"],
	contact: ["assignedTo", "companyId", "tag"],
	deal: ["currentStageId", "assignedTo", "tag"],
	company: ["industry", "assignedTo", "tag"],
};

/**
 * Per-slot picklists for status / source / etc. FALLBACK only — these are
 * hardcoded values the UI uses when no org-level override is set. Once an
 * admin configures `orgs.settings.modules[slot].picklists.{status,source,...}`
 * in Settings → CRM → Pipelines / Picklists, those values override these.
 *
 * Future: dynamic via `orgs.settings.modules[slot].picklists` (plan §16).
 * Tracked: ENTITY_SCAFFOLDS_PLAN.md §16 row "picklists fallback".
 */
export const LEAD_STATUSES = ["new", "contacted", "qualified", "converted", "lost"] as const;

export const LEAD_SOURCES = [
	"manual",
	"referral",
	"website",
	"whatsapp",
	"csv",
	"event",
	"other",
] as const;

export type LeadStatus = (typeof LEAD_STATUSES)[number];
export type LeadSource = (typeof LEAD_SOURCES)[number];
