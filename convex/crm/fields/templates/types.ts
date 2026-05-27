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
 *   5.  codePrefixes          — person / deal / company / task
 *   6.  pipelines             — N pipelines, each with stages + policy + flags
 *   7.  fieldDefinitions      — system + custom per entity, stage-aware
 *   8.  modules               — slot map (order, view, columns, board, meta)
 *   9.  noteCategories        — sticky-note kanban columns (overrides default 6)
 *   10. tags                  — preset tags ready for use at signup
 *   11. taskDefaults          — followup-task cadence + priority + auto-close
 *   12. briefingDefaults      — morning-briefing toggle + time
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

// ─── Task cadence defaults ───────────────────────────────────────────────────

/**
 * Replaces the legacy `ReminderDefaultsSeed` + `FollowupDefaultsSeed`
 * blocks (TASKS-RENAME-PLAN.md Stage 4D). Affects tasks with
 * `type === "followup"` only.
 */
export type TaskDefaultsSeed = {
	defaultDueOffsetDays?: number;
	defaultPriority?: "low" | "normal" | "high" | "urgent";
	autoCloseAfterDays?: number;
	notifyAssignee?: boolean;
	requireDealCode?: boolean;
	reminderBeforeHours?: number;
};

// ─── Briefing defaults (workspace-wide) ─────────────────────────────────────

export type BriefingDefaultsSeed = {
	morningBriefingEnabled?: boolean;
	/** "HH:MM" 24-hour. Matches the schema validator. */
	morningBriefingTime?: string;
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
	task?: string;
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

	// 11. Task cadence defaults (followup-typed tasks)
	taskDefaults?: TaskDefaultsSeed;

	// 12. AI morning-briefing defaults
	briefingDefaults?: BriefingDefaultsSeed;

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

	// 19. Mock data — sample records seeded after structural setup (Phase 3A).
	mockData?: MockDataSeed;
}

// ─── Mock data seeds (Phase 3A) ───────────────────────────────────────────────
//
// Templates may declare a small bundle of sample records to give brand-new
// workspaces a "feels alive in 30 seconds" experience. Every record inserted
// is tagged `source: "template_seed"` and `excludeFromAI: true` so the user
// can clear them in one click and the Phase 3B AI runtime never trains on
// fake names. Seeder lives in `mockSeeder.ts` (Phase 3A Phase C).

export type MockLeadSeed = {
	displayName: string;
	email?: string;
	phone?: string;
	/** Optional initial status. Defaults to "new". */
	status?: string;
	/** Lead-level field values keyed by fieldDefinition.name. */
	fieldValues?: Record<string, unknown>;
	/** Tag NAMES to attach (must match a tag seed name in the same template). */
	tags?: string[];
};

export type MockContactSeed = {
	displayName: string;
	email?: string;
	phone?: string;
	/** Reference one of the mock-company keys to link the contact to a company. */
	companyKey?: string;
	fieldValues?: Record<string, unknown>;
	tags?: string[];
};

export type MockCompanySeed = {
	/** Unique key within the template — referenced by mockContacts.companyKey + mockDeals.companyKey. */
	key: string;
	name: string;
	industry?: string;
	website?: string;
	fieldValues?: Record<string, unknown>;
};

export type MockDealSeed = {
	title: string;
	/** Stage CODE (e.g. "DISC", "OFR"). Must match a stage in the template's pipeline. */
	stageCode: string;
	value?: number;
	/** Reference one of the mock-contact entries by displayName. */
	contactDisplayName?: string;
	/** Reference one of the mock-company keys. */
	companyKey?: string;
	fieldValues?: Record<string, unknown>;
	tags?: string[];
};

export type MockNoteSeed = {
	/** Note content (markdown supported). */
	content: string;
	/** Note category NAME (must match a noteCategory entry in the template). */
	categoryName?: string;
	/**
	 * Optional anchor — links the note to a person/deal/company.
	 * The seeder resolves the entity by lookup at seed-time.
	 */
	anchorTo?:
		| { kind: "lead"; displayName: string }
		| { kind: "contact"; displayName: string }
		| { kind: "deal"; title: string }
		| { kind: "company"; companyKey: string };
};

export type MockTaskSeed = {
	title: string;
	/** Days from now (negative = past, 0 = today, positive = future). */
	dueOffsetDays: number;
	priority?: "low" | "normal" | "high" | "urgent";
	/** Closed task type — "followup" carries cadence semantics; everything else lands as a generic todo. */
	source?: "manual" | "followup";
	/** Same anchor shape as MockNoteSeed. */
	anchorTo?:
		| { kind: "lead"; displayName: string }
		| { kind: "contact"; displayName: string }
		| { kind: "deal"; title: string };
};

export type MockDataSeed = {
	leads?: MockLeadSeed[];
	contacts?: MockContactSeed[];
	companies?: MockCompanySeed[];
	deals?: MockDealSeed[];
	notes?: MockNoteSeed[];
	tasks?: MockTaskSeed[];
};
