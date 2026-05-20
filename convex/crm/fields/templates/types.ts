/**
 * Industry-template type definitions.
 *
 * A template is a self-contained "industry-in-a-box" bundle that seeds
 * an entire workspace at signup — pipelines, fields, entity labels,
 * sticky-note categories, tag presets, reminder defaults, file-upload
 * policy, AI persona, dashboard widgets, custom roles, saved views, and
 * org-level settings (currency, timezone, code prefixes, locale).
 *
 * Adding a new template = creating one file in `definitions/` and registering
 * it in `registry.ts`. Onboarding + AI tools both read from the same registry.
 *
 * EVERY non-identity slot is `optional?:` so existing templates remain
 * backwards-compatible — adding a slot here never forces a content edit.
 *
 * Slots covered (locked 2026-05-21):
 *   1.  identity              — id, label, description, icon, region, locale
 *   2.  defaults              — currency, timezone, leadStaleAfterDays, locale
 *   3.  entityLabels          — singular/plural/slug per entity (incl. Arabic)
 *   4.  entityVisibility      — which 4+2 slots are visible on signup
 *   5.  codePrefixes          — person / deal / company / followup
 *   6.  pipelines             — N pipelines, each with stages + policy + flags
 *   7.  fieldDefinitions      — system + custom per entity, stage-aware
 *   8.  modules               — slot map (order, view, columns, board, meta)
 *   9.  noteCategories        — sticky-note kanban columns (overrides default 6)
 *   10. tags                  — preset tags ready for use at signup
 *   11. reminderDefaults      — follow-up window, stale, briefing, rent alert
 *   12. followupDefaults      — cadence + priority + auto-close + reminder
 *   13. fileUpload            — allowed MIME categories + max size
 *   14. aiPersona             — overlay added to AI system prompt
 *   15. dashboardMetrics      — widget keys to show on dashboard home
 *   16. navHiddenSlots        — sidebar slots hidden by default
 *   17. customRoles           — orgRoles seeded with curated permission sets
 *   18. savedViews            — preset filters per entity (sidebar shortcuts)
 */

// ─── Stage seed ──────────────────────────────────────────────────────────────

export type StageSeed = {
	/** Display name. */
	name: string;
	/** Owner-typed code, validated against `^[A-Z0-9_-]{2,16}$`. */
	code: string;
	color?: string;
	isFinal?: boolean;
	finalType?: "positive" | "negative" | "neutral";
	staleAfterDays?: number;
	warningAfterDays?: number;
	/** Marks the pipeline's "Default" column. Exactly one per pipeline. */
	isDefaultStage?: boolean;
};

// ─── Pipeline seed ───────────────────────────────────────────────────────────

export type PipelineSeed = {
	entityType: "deal" | "project" | "task";
	name: string;
	isDefault: boolean;
	stageTransitionPolicy?: "block" | "warn" | "off";
	allowSkipStages?: boolean;
	markDoneRequiresAllFields?: boolean;
	stages: StageSeed[];
};

// ─── Field-definition seed (matches `fieldDefinitions` table shape) ─────────

/**
 * Subset of `Doc<"fieldDefinitions">` used at seed time.
 * `orgId`, timestamps, `_id`, `_creationTime` are filled in by the seeder.
 * `order` is auto-assigned (append) unless explicitly set.
 *
 * `showInStages` references stage **codes** (not ids). The seeder resolves
 * codes to ids before insert so templates stay grep-readable.
 */
export type FieldDefSeed = {
	entityType: "lead" | "contact" | "deal" | "company";
	name: string;
	label: string;
	labelAr?: string;
	type: string;
	kind?: string;
	storage?: "column" | "fieldValues" | "join";
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

// ─── Entity label override ───────────────────────────────────────────────────

export type EntityLabelOverride = {
	singular: string;
	plural: string;
	slug: string;
	singularAr?: string;
	pluralAr?: string;
};

// ─── Modules slot map (orgs.settings.modules[]) ──────────────────────────────

export type ModuleSeed = {
	slot: "lead" | "contact" | "deal" | "company" | "entity5" | "entity6";
	order: number;
	hidden?: boolean;
	defaultView?: "list" | "board";
	cardFields?: string[];
	listColumns?: string[];
	boardGroupBy?: string;
	defaultFilters?: string[];
	label?: string;
	meta?: Record<string, unknown>;
};

// ─── Note categories (sticky-note kanban) ────────────────────────────────────

export type NoteCategorySeed = {
	name: string;
	bgColor: string;
	textColor?: string;
	isDefault?: boolean;
	position?: number;
};

// ─── Tags ────────────────────────────────────────────────────────────────────

export type TagSeed = {
	name: string;
	color?: string;
};

// ─── Saved views (preset filters per entity) ─────────────────────────────────

export type SavedViewSeed = {
	entityType: "lead" | "contact" | "deal" | "company";
	name: string;
	scope: "user" | "org";
	/** Serialized filter state — match the shape `savedViews.filters` expects (string). */
	filters: string;
	sortBy?: string;
	sortOrder?: "asc" | "desc";
	columns?: string[];
	isPinned?: boolean;
};

// ─── Custom roles (additional orgRoles beyond Owner/Admin/Member/Viewer) ─────

export type CustomRoleSeed = {
	name: string;
	description?: string;
	color?: string;
	/** Permission keys from `_shared/permissions/catalog.ts`. */
	permissions: string[];
};

// ─── Reminder defaults ───────────────────────────────────────────────────────

export type ReminderDefaultsSeed = {
	followUpWindowHours?: number;
	staleAlertDays?: number;
	morningBriefingEnabled?: boolean;
	/** "HH:MM" 24-hour. Matches the schema validator. */
	morningBriefingTime?: string;
	rentAlertDays?: number;
	rentAlertEnabled?: boolean;
};

// ─── Follow-up cadence defaults ─────────────────────────────────────────────

export type FollowupDefaultsSeed = {
	defaultDueOffsetDays?: number;
	defaultPriority?: "low" | "normal" | "high" | "urgent";
	autoCloseAfterDays?: number;
	notifyAssignee?: boolean;
	requireDealCode?: boolean;
	reminderBeforeHours?: number;
};

// ─── File-upload policy ──────────────────────────────────────────────────────

export type FileUploadSeed = {
	allowedMimeCategories?: Array<
		"image" | "pdf" | "document" | "spreadsheet" | "video" | "audio" | "archive" | "other"
	>;
	maxSizeMb?: number;
};

// ─── Code prefixes ───────────────────────────────────────────────────────────

export type CodePrefixesSeed = {
	person?: string;
	deal?: string;
	company?: string;
	followup?: string;
};

// ─── Workspace defaults (org-level settings) ─────────────────────────────────

export type WorkspaceDefaultsSeed = {
	currency?: string;
	timezone?: string;
	leadStaleAfterDays?: number;
	locale?: "en" | "ar";
};

// ─── Template ────────────────────────────────────────────────────────────────

export interface IndustryTemplate {
	// 1. Identity
	/** Stable key — used as the URL slug + persisted in `org.industry`. */
	id: string;
	/** Display name shown during onboarding. */
	label: string;
	/** Short marketing line under the label. */
	description: string;
	/** Optional emoji shown on the onboarding card. */
	icon?: string;
	/** Targeted region — drives default currency / timezone if those are unset. */
	region?: "global" | "gcc" | "us" | "eu" | "apac";

	// 2. Workspace defaults
	defaults?: WorkspaceDefaultsSeed;

	// 3. Entity-label renames
	entityLabels?: {
		lead?: EntityLabelOverride;
		contact?: EntityLabelOverride;
		deal?: EntityLabelOverride;
		company?: EntityLabelOverride;
	};

	// 4. Entity visibility (which slots are visible / hidden at signup)
	entityVisibility?: {
		lead?: boolean;
		contact?: boolean;
		deal?: boolean;
		company?: boolean;
		entity5?: boolean;
		entity6?: boolean;
	};

	// 5. Code prefixes
	codePrefixes?: CodePrefixesSeed;

	/**
	 * 6. Pipelines.
	 *
	 * Either a single `pipeline` (legacy) or an array of `pipelines` (new).
	 * The seeder accepts both. Internally they collapse to the same loop.
	 */
	pipeline?: { name: string; stages: StageSeed[] };
	pipelines?: PipelineSeed[];

	// 7. Field definitions to seed for each entity type
	fieldDefinitions?: {
		lead?: FieldDefSeed[];
		contact?: FieldDefSeed[];
		deal?: FieldDefSeed[];
		company?: FieldDefSeed[];
	};

	// 8. Modules slot map
	modules?: ModuleSeed[];

	// 9. Sticky-note categories
	noteCategories?: NoteCategorySeed[];

	// 10. Tag presets
	tags?: TagSeed[];

	// 11. Reminder defaults
	reminderDefaults?: ReminderDefaultsSeed;

	// 12. Follow-up cadence defaults
	followupDefaults?: FollowupDefaultsSeed;

	// 13. File-upload policy
	fileUpload?: FileUploadSeed;

	// 14. AI persona overlay
	aiPersona?: string;

	// 15. Dashboard metrics (widget keys)
	dashboardMetrics?: string[];

	// 16. Sidebar slots hidden by default
	navHiddenSlots?: string[];

	// 17. Custom orgRoles to seed
	customRoles?: CustomRoleSeed[];

	// 18. Saved views
	savedViews?: SavedViewSeed[];
}
