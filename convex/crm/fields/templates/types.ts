/**
 * Industry-template type definitions.
 *
 * A template is a self-contained "industry-in-a-box" bundle that seeds:
 *   1. A default pipeline (with stages already carrying codes).
 *   2. Field definitions for one or more entity types (deal/contact/lead/company).
 *   3. Optional entity-label overrides ("Inquiry" instead of "Lead", etc.).
 *
 * Adding a new template = creating one file in `definitions/` and registering
 * it in `registry.ts`. Onboarding + AI tools both read from the same registry.
 */

// ─── Stage seed (used during initial pipeline insert) ──────────────────────

export type StageSeed = {
	/** Display name. */
	name: string;
	/** Owner-typed code (already validated to `^[A-Z0-9_-]{2,16}$`). */
	code: string;
	color?: string;
	isFinal?: boolean;
	finalType?: "positive" | "negative" | "neutral";
	staleAfterDays?: number;
};

// ─── Field-definition seed (matches `fieldDefinitions` table shape) ────────

/**
 * Subset of `Doc<"fieldDefinitions">` used at seed time.
 * `orgId`, timestamps, `_id`, `_creationTime` are filled in by the seeder.
 * `order` is auto-assigned (append) unless explicitly set.
 */
export type FieldDefSeed = {
	entityType: "lead" | "contact" | "deal" | "company";
	name: string;
	label: string;
	labelAr?: string;
	type: string;
	kind?: string;
	storage?: string;
	columnKey?: string;
	system?: boolean;
	protected?: boolean;
	options?: string[];
	required?: boolean;
	groupName?: string;
	sensitive?: boolean;
	defaultValue?: unknown;
	showInStages?: string[];
	order?: number;
};

// ─── Entity label override ──────────────────────────────────────────────────

export type EntityLabelOverride = {
	singular: string;
	plural: string;
	slug: string;
};

// ─── Template ───────────────────────────────────────────────────────────────

export interface IndustryTemplate {
	/** Stable key — used as the URL slug + persisted in `org.industry`. */
	id: string;
	/** Display name shown during onboarding. */
	label: string;
	/** Short marketing line under the label. */
	description: string;
	/** Optional emoji shown on the onboarding card. */
	icon?: string;

	pipeline: {
		name: string;
		stages: StageSeed[];
	};

	/** Field definitions to seed for each entity type. */
	fieldDefinitions?: {
		lead?: FieldDefSeed[];
		contact?: FieldDefSeed[];
		deal?: FieldDefSeed[];
		company?: FieldDefSeed[];
	};

	/** Optional entity-label renames bundled with this industry. */
	entityLabels?: {
		lead?: EntityLabelOverride;
		contact?: EntityLabelOverride;
		deal?: EntityLabelOverride;
		company?: EntityLabelOverride;
	};
}
