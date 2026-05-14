/**
 * Shared types for entity scaffolds.
 *
 * `EntitySlot` — the canonical 4 entity types. Always use this in generic code.
 * `PersonRef` — what every person-picker returns. See ENTITY_SCAFFOLDS_PLAN.md §D7.
 */

import type { Id } from "@/convex/_generated/dataModel";

export type EntitySlot = "lead" | "contact" | "deal" | "company";

/**
 * PersonRef — the full shape returned by `<PersonSelect>` and consumed by
 * `<PersonDisplay>`. Never pass just an id around — always the full ref.
 *
 * `personCode` is undefined for `type:"user"` (org members have no personCode).
 */
export type PersonRef = {
	id: string;
	type: "lead" | "contact" | "user";
	personCode?: string;
	displayName: string;
	email?: string;
	phone?: string;
	avatarUrl?: string;
	status?: string;
};

/** Convenience narrow types for callers that need specific shapes. */
export type LeadPersonRef = PersonRef & { type: "lead"; id: Id<"leads">; personCode: string };
export type ContactPersonRef = PersonRef & {
	type: "contact";
	id: Id<"contacts">;
	personCode: string;
};
export type UserPersonRef = PersonRef & { type: "user"; id: Id<"users"> };

export type ViewKind = "list" | "board";

/**
 * Defined by `core/entities/shared/config/field-catalog.ts`. Re-exported here
 * so consumers can import everything entity-related from one place.
 */
export type FieldRenderKind =
	| "text"
	| "email"
	| "phone"
	| "badge"
	| "tags"
	| "personCode"
	| "entityCode"
	| "personDisplay"
	| "companyLink"
	| "currency"
	| "stageBadge"
	| "stale"
	| "relativeTime"
	| "link"
	| "count"
	| "file"
	| "files"
	| "date"
	| "number"
	| "checkbox";

export type FieldSpec = {
	/** Human label — can be a function for label-reactive spots */
	label: string;
	render: FieldRenderKind;
	/** Only for `personDisplay` kind */
	scope?: "user" | "lead" | "contact";
	/** If set, render only when user holds this permission */
	permission?: string;
	/** If true, value is computed server-side (e.g. counts) — UI treats as read-only */
	computed?: boolean;
};
