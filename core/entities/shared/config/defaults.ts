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
	lead: ["avatar", "displayName", "email", "personCode", "assignedTo", "tags", "aiSummary"],
	contact: ["avatar", "displayName", "email", "personCode", "assignedTo", "tags", "aiSummary"],
	deal: ["dealCode", "title", "personCode", "value", "assignedTo", "tags", "aiSummary"],
	company: ["companyCode", "name", "industry", "assignedTo", "tags", "aiSummary"],
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

// ── Status colours ───────────────────────────────────────────────────────────
//
// Single source of truth for the little coloured dot that precedes every
// kanban column title. Keyed by slot + status/stage slug. Any slug not in the
// map falls back to a tasteful neutral slate.
//
// Future: admin-configurable per pipeline stage (stages already carry `color`
// in the pipelines table — we prefer that over the map when present).

/** Tailwind-like hex palette used across the app (matches @/lib/colors). */
const PALETTE = {
	slate: "#94a3b8",
	blue: "#3b82f6",
	violet: "#8b5cf6",
	amber: "#f59e0b",
	emerald: "#10b981",
	rose: "#ef4444",
	teal: "#14b8a6",
	indigo: "#6366f1",
	pink: "#ec4899",
	cyan: "#06b6d4",
	lime: "#84cc16",
} as const;

const STATUS_COLOR_MAP: Record<EntitySlot, Record<string, string>> = {
	lead: {
		new: PALETTE.blue,
		contacted: PALETTE.violet,
		qualified: PALETTE.amber,
		converted: PALETTE.emerald,
		lost: PALETTE.rose,
	},
	contact: {
		assigned: PALETTE.emerald,
		unassigned: PALETTE.slate,
	},
	deal: {
		// pipeline stages carry their own colour — this is just the fallback
		// for deals without a stage colour configured
		open: PALETTE.blue,
		negotiation: PALETTE.amber,
		won: PALETTE.emerald,
		lost: PALETTE.rose,
	},
	company: {
		uncategorized: PALETTE.slate,
	},
};

/**
 * Colour for a board column in HEX form. Pipeline stages pass their own colour
 * via `KanbanColumnConfig.color` — this helper is the fallback for entities
 * that don't carry a per-row colour.
 */
export function getStatusColor(slot: EntitySlot, status: string): string {
	const map = STATUS_COLOR_MAP[slot];
	const hit = map[status.toLowerCase()];
	if (hit) return hit;
	// Deterministic fallback — pick a colour from the palette based on the
	// string, so arbitrary new statuses get a stable, non-gray tint.
	const keys = Object.values(PALETTE);
	let hash = 0;
	for (let i = 0; i < status.length; i++) hash = (hash * 31 + status.charCodeAt(i)) | 0;
	return keys[Math.abs(hash) % keys.length] ?? PALETTE.slate;
}
