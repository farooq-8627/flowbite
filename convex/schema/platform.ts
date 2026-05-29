/**
 * Schema — Platform domain.
 *
 * Tables: platformTemplates, featureFlags, rateLimits, platformContext,
 * platformTiers, platformAuditLogs.
 *
 * These are cross-org or platform-wide tables (super_admin operations).
 */

import { defineTable } from "convex/server";
import { v } from "convex/values";
import { orgPlanValidator, timestamps } from "../_shared/validators";

/**
 * Industry templates stored in DB — not TypeScript config files.
 *
 * As of 2026-05-27 this table is the SINGLE SOURCE OF TRUTH for the 9
 * built-in industry templates (Real Estate Dubai/Saudi/Global, B2B SaaS,
 * Productivity, Freelancer, Agency, Recruiting, Generic) plus their
 * sub-niche aliases. The legacy TypeScript registry at
 * `convex/crm/fields/templates/registry.ts` was deleted in Stage 3 of
 * INDUSTRY-TEMPLATES-DB-MIGRATION.md. The 9 TS template fixtures were
 * relocated to `convex/_platform/industries/builtIns/` as one-time
 * bootstrap data — they're consumed only by the seed migration, never
 * at runtime.
 *
 * Storage shape (locked decision L5): typed top-level columns for
 * identity / grouping / visibility / ordering (queryable + indexable),
 * plus a single `definition: v.any()` JSON blob holding every nested
 * slot (pipelines, fields, modules, mockData, etc.). The runtime
 * validator in `convex/_platform/industries/validators.ts` enforces the
 * `IndustryTemplate` shape on writes.
 *
 * Editable from the owner panel (`/xowner/industries`). New orgs only —
 * editing a template never affects orgs that already onboarded onto it.
 */
export const platformTemplates = defineTable({
	// Identity + grouping
	templateKey: v.string(), // stable id; persisted in `org.industry`
	groupKey: v.string(), // FK → platformIndustryGroups.groupKey

	// Display
	label: v.string(),
	description: v.string(),
	icon: v.optional(v.string()),
	region: v.optional(
		v.union(
			v.literal("global"),
			v.literal("gcc"),
			v.literal("us"),
			v.literal("eu"),
			v.literal("apac"),
		),
	),

	// Visibility / state
	visible: v.boolean(), // shown in onboarding picker
	sortOrder: v.number(), // within group
	isBuiltIn: v.boolean(), // true for the 9 we seed; false for owner-created
	isArchived: v.boolean(), // soft-hide; never shown anywhere if true

	/**
	 * The full template definition. Validator mirrors `IndustryTemplate`
	 * exactly. Stored as one blob so adding a new slot in the future
	 * doesn't require a schema migration — only the validator changes.
	 */
	definition: v.object({
		defaults: v.optional(v.any()),
		entityLabels: v.optional(v.any()),
		entityVisibility: v.optional(v.any()),
		codePrefixes: v.optional(v.any()),
		pipeline: v.optional(v.any()), // legacy single-pipeline shape
		pipelines: v.optional(v.array(v.any())), // multi-pipeline shape
		fieldDefinitions: v.optional(v.any()),
		modules: v.optional(v.array(v.any())),
		noteCategories: v.optional(v.array(v.any())),
		tags: v.optional(v.array(v.any())),
		taskDefaults: v.optional(v.any()),
		briefingDefaults: v.optional(v.any()),
		fileUpload: v.optional(v.any()),
		aiPersona: v.optional(v.string()),
		dashboardMetrics: v.optional(v.array(v.string())),
		navHiddenSlots: v.optional(v.array(v.string())),
		customRoles: v.optional(v.array(v.any())),
		savedViews: v.optional(v.array(v.any())),
		mockData: v.optional(v.any()),
	}),

	// Audit
	createdBy: v.optional(v.id("users")),
	updatedBy: v.optional(v.id("users")),
	...timestamps,
})
	.index("by_templateKey", ["templateKey"])
	.index("by_group_visible_order", ["groupKey", "visible", "sortOrder"])
	.index("by_visible", ["visible"]);

/**
 * Industry groups — drives step 1 of the onboarding picker.
 *
 * 7 built-in groups seeded by `_migrations/2026_05_27_seedIndustryTemplatesIntoDB`:
 * `real-estate`, `b2b-saas`, `productivity`, `freelancer`, `agency`,
 * `recruiting`, `generic`.
 *
 * Spec: INDUSTRY-TEMPLATES-DB-MIGRATION.md §3.1.
 */
export const platformIndustryGroups = defineTable({
	groupKey: v.string(), // stable identifier — natural key
	label: v.string(), // shown on the onboarding card
	description: v.optional(v.string()), // shown under the group card
	icon: v.optional(v.string()), // emoji
	visible: v.boolean(), // hide whole group from onboarding
	sortOrder: v.number(), // ascending — controls picker order
	updatedBy: v.optional(v.id("users")),
	...timestamps,
})
	.index("by_groupKey", ["groupKey"])
	.index("by_visible_order", ["visible", "sortOrder"]);

/**
 * DB-backed reserved-slug SSOT (locked decision L9, 2026-05-27).
 *
 * Replaces the static `convex/_shared/reservedSlugs.ts` Set. Owner can
 * add / remove / edit any reserved slug from `/xowner/reserved-slugs`
 * — including `superadmin`, future template keys, custom subdomain
 * claims, etc. — without redeploys.
 *
 * Categories namespace the slug-space:
 *   - `org`: org slugs in URL space (`/{orgSlug}/...`).
 *   - `template`: `platformTemplates.templateKey` collisions.
 *   - `industryGroup`: `platformIndustryGroups.groupKey` collisions.
 *   - `entitySlug`: `org.settings.entityLabels.{entity}.slug` values.
 *   - `route`: free-form reserved app routes (catch-all).
 *
 * Built-in entries (`isBuiltIn: true`, seeded from the static file in
 * Stage 1) cannot be deleted from the admin UI — the system needs
 * them. Custom owner-added entries can be removed.
 */
export const platformReservedSlugs = defineTable({
	slug: v.string(), // always lower-cased before insert
	category: v.union(
		v.literal("org"),
		v.literal("template"),
		v.literal("industryGroup"),
		v.literal("entitySlug"),
		v.literal("route"),
	),
	reason: v.optional(v.string()),
	isBuiltIn: v.boolean(),
	createdBy: v.optional(v.id("users")),
	updatedBy: v.optional(v.id("users")),
	...timestamps,
})
	.index("by_category_slug", ["category", "slug"])
	.index("by_slug", ["slug"]);

/**
 * Kill-switch / rollout flags. Checked via useFeatureFlag() hook.
 * Reactive: queries subscribe via useQuery and pick up changes instantly.
 */
export const featureFlags = defineTable({
	key: v.string(),
	enabled: v.boolean(),
	rolloutPercent: v.optional(v.number()),
	orgOverrides: v.optional(v.record(v.string(), v.boolean())),
	description: v.optional(v.string()),
	...timestamps,
}).index("by_key", ["key"]);

/**
 * Generic token-bucket counters used by `convex/_shared/rateLimit.ts`.
 * One row per (scope, key) pair tracks the operation count inside the
 * current window. Expired rows (resetAt < now) are reused with a fresh window.
 */
export const rateLimits = defineTable({
	scope: v.string(),
	key: v.string(),
	count: v.number(),
	resetAt: v.number(),
	updatedAt: v.number(),
}).index("by_scope_key", ["scope", "key"]);

/**
 * Platform-wide AI context.
 *
 * Single row keyed "main". Injected into Layer 1 of every AI system prompt.
 * Only super_admin can write. Platform_owner edits from admin UI.
 */
export const platformContext = defineTable({
	key: v.string(), // "main" — only one record
	version: v.string(), // "v1.0.0" — track changes
	content: v.string(), // Markdown injected into every system prompt
	rules: v.optional(v.array(v.string())), // Explicit AI dos and don'ts
	updatedBy: v.id("users"),
	...timestamps,
}).index("by_key", ["key"]);

/**
 * Plan tier definitions — replaces the code-based PLAN_LIMITS constants
 * in `convex/_platform/limits.ts`. The owner panel writes to this table;
 * `getPlanLimits()` reads it (with the constants as a behavioural fallback
 * during the migration window — see `_platform/limits.ts`).
 *
 * One row per tier key — `key` is the unique business identifier.
 *
 * **2026-05-27 P0.1+P0.2 update:** added marketing-copy fields
 * (`description`, `features`, `highlight`) plus per-billing-period
 * LemonSqueezy variant ids so the owner panel becomes the SSOT for
 * EVERY tier-config knob — quota limits, marketing bullets, and
 * checkout variant ids — and that single source feeds both the in-app
 * `PricingCard` and the marketing site's `/pricing` page. Limits are
 * extended with `maxLeads` + `aiMessageCreditsPerMonth` so the audit's
 * pricing ladder ($199 = 50,000 credits) ships end-to-end. All new
 * fields are optional so the migration is non-breaking; the seed
 * migration `_migrations/2026_05_27_seedPlanLimitsExtensions.ts`
 * idempotently fills sensible defaults on any pre-existing rows.
 *
 * Spec: PLATFORM-OWNER-PANEL.md §4.1 + PENDING.md P0.1.2 + P0.2.E.
 */
export const platformTiers = defineTable({
	/** Stable business identifier — also used as the org `plan` value. */
	key: orgPlanValidator,
	/** Display name shown in marketing + dashboard. */
	displayName: v.string(),
	/**
	 * One-line marketing tagline — shown on the PricingCard subtitle and
	 * the marketing /pricing page.
	 */
	description: v.optional(v.string()),
	/**
	 * Ordered list of user-facing feature bullets shown on the PricingCard.
	 * Owner-controlled — change copy without redeploying.
	 */
	features: v.optional(v.array(v.string())),
	/**
	 * "Most popular" / accent tile flag. Exactly one tier per workspace
	 * SHOULD be highlighted (UI doesn't enforce — owner discretion).
	 */
	highlight: v.optional(v.boolean()),
	/** Monthly price in USD (0 for free tier). */
	monthlyPriceUSD: v.number(),
	/** Yearly price in USD (0 for free tier). */
	yearlyPriceUSD: v.number(),
	/** Trial length in days for new orgs on this tier (0 = no trial). */
	trialDays: v.number(),
	/**
	 * LemonSqueezy variant id for monthly billing. When set, the in-app
	 * upgrade button + marketing PricingCard route the user to a hosted
	 * LemonSqueezy checkout against this variant. The webhook
	 * (`convex/billing/internal.ts::variantToPlan`) reads this back to
	 * map a webhook variant_id → plan tier. The legacy
	 * `LEMONSQUEEZY_VARIANT_*` env vars remain a fallback for backwards
	 * compat with deployments that haven't yet migrated their tier rows.
	 */
	lemonSqueezyVariantIdMonthly: v.optional(v.string()),
	/** LemonSqueezy variant id for yearly billing. */
	lemonSqueezyVariantIdYearly: v.optional(v.string()),
	/**
	 * Quota limits enforced by `_platform/limits.ts::getPlanLimits`.
	 * `-1` means unlimited; `0` means "feature disabled" (e.g. AI on free).
	 *
	 * `maxLeads` + `aiMessageCreditsPerMonth` are optional only because
	 * existing rows pre-date them; the read path
	 * (`getPlanLimitsFromDb`) backfills from the in-code defaults when
	 * absent, and the seed migration writes the defaults idempotently.
	 */
	limits: v.object({
		maxPipelinesPerEntityType: v.number(),
		maxDeals: v.number(),
		maxLeads: v.optional(v.number()),
		maxMembers: v.number(),
		maxCustomFieldsPerEntityType: v.number(),
		maxStorageBytes: v.number(),
		aiTokensPerMonth: v.number(),
		aiMessageCreditsPerMonth: v.optional(v.number()),
	}),
	/** Whether this tier is currently selectable in onboarding / billing UI. */
	active: v.boolean(),
	/** Last owner who patched the row. */
	updatedBy: v.id("users"),
	...timestamps,
}).index("by_key", ["key"]);

/**
 * Owner-panel email-OTP step rows.
 *
 * One row per OTP issued. Single use — once `consumed=true`, the same
 * code can never be re-used (replay defence). Layered on top of the
 * existing platformRole + email allow-list checks (§2.3 layer 4).
 *
 * Storage shape: never the plaintext code. We store `salt` (per-row
 * random 16 bytes hex) and `codeHash = sha256(salt + ":" + code)` so a
 * DB read alone never leaks an active OTP. The hash uses the Web Crypto
 * API so it works in the Convex V8 mutation runtime.
 *
 * GC: a daily cron deletes rows where `expiresAt + 24h < now` (see
 * `convex/crons.ts::owner-otp-gc`). The 24h window is plenty long
 * enough for the audit trail layer to capture session starts via
 * `platformAuditLogs` before the underlying OTP row is purged.
 *
 * Spec: PLATFORM-OWNER-PANEL.md §4.2.
 */
export const platformOwnerOtps = defineTable({
	/** The user this code was issued to. Always a super_admin + email-allowed user. */
	userId: v.id("users"),
	/** sha256(salt + ":" + plaintextCode). Hex-encoded. */
	codeHash: v.string(),
	/** Per-row random hex salt (16 bytes / 32 hex chars). */
	salt: v.string(),
	/** True once the OTP has been redeemed by `verifyOtp`. Single-use. */
	consumed: v.boolean(),
	/** Timestamp of redemption — lets `OwnerSettingsView` show "active sessions". */
	consumedAt: v.optional(v.number()),
	/** Issued-at + 15 minutes by default. After this the row is rejected. */
	expiresAt: v.number(),
	/** Captured request metadata from the OTP-request mutation when available. */
	ip: v.optional(v.string()),
	userAgent: v.optional(v.string()),
	createdAt: v.number(),
})
	// Used to find the latest unconsumed code for a user (fast path of `verifyOtp`).
	.index("by_user_active", ["userId", "consumed"])
	// Used by the daily GC cron to delete expired rows.
	.index("by_expires", ["expiresAt"]);

/**
 * Append-only audit trail of every owner-panel mutation. Independent of
 * the per-org `activityLogs` table — owner actions never co-mingle with
 * customer data.
 *
 * NEVER updated or deleted by application code. New rows only.
 *
 * Spec: PLATFORM-OWNER-PANEL.md §4.3.
 */
export const platformAuditLogs = defineTable({
	/** The platform owner who performed the action. */
	actorUserId: v.id("users"),
	/** Denormalised email so removed users still surface a readable trail. */
	actorEmail: v.string(),
	/** Verb in `domain.subject.action` form, e.g. `"owner.tier.update"`. */
	action: v.string(),
	/** Optional category of the target object — e.g. `"tier"`, `"flag"`. */
	targetType: v.optional(v.string()),
	/** Optional id of the target — string-typed because targets are heterogeneous. */
	targetId: v.optional(v.string()),
	/** JSON snapshot of the row BEFORE the change (when applicable). */
	before: v.optional(v.any()),
	/** JSON snapshot of the row AFTER the change. */
	after: v.optional(v.any()),
	/** Optional human-supplied justification. */
	reason: v.optional(v.string()),
	/** Captured request metadata when available. */
	ip: v.optional(v.string()),
	userAgent: v.optional(v.string()),
	createdAt: v.number(),
})
	.index("by_actor", ["actorUserId"])
	.index("by_action", ["action"])
	.index("by_created", ["createdAt"]);

/**
 * Platform-wide AI provider keys — managed exclusively by the Owner panel.
 *
 * One row per (provider, isActive=true). Read by every internal "platform-cost"
 * LLM caller (briefings, title generation, suggestion generator, etc.) AFTER
 * the BYOK fallback chain (`orgAiKeys`) but BEFORE the legacy env-var path.
 * Operators can rotate keys without redeploying — env vars remain a valid
 * fallback for backwards compat.
 *
 * Storage matches `orgAiKeys`: AES-GCM encrypted `encryptedKey` (base64), with
 * `keyHint` (last 4 chars) safe to surface in the UI. Decryption happens only
 * inside `briefingsActions` / `titleGeneration` / similar Node actions — never
 * in queries (which run in V8) and never on the client.
 *
 * Why a separate table vs a row in `orgAiKeys` with `scope: "platform"`:
 *   - Owner-panel-only write surface — the existing `orgAiKeys` mutations
 *     gate on org membership, which the platform owner doesn't have for
 *     every tenant.
 *   - Independent audit trail — every write is logged via
 *     `platformAuditLogs`, separate from per-org activity logs.
 *   - Provider uniqueness — at most one active key per provider, enforced
 *     at the index + mutation level.
 *
 * Spec: PLATFORM-OWNER-PANEL.md §5 (added 2026-05-27 — owner-managed AI keys).
 */
export const platformAiKeys = defineTable({
	provider: v.union(
		v.literal("anthropic"),
		v.literal("openai"),
		v.literal("google"),
		v.literal("xai"),
		v.literal("groq"),
		v.literal("mistral"),
		v.literal("openrouter"),
		v.literal("nvidia"),
		v.literal("moonshot"),
		v.literal("custom"),
	),
	encryptedKey: v.string(), // AES-GCM encrypted, base64. NEVER returned to client.
	keyHint: v.string(), // last 4 chars for UI display: "sk-...4f8a"
	baseUrl: v.optional(v.string()), // for "custom", "nvidia", OpenRouter endpoint override
	isActive: v.boolean(),
	lastUsedAt: v.optional(v.number()),
	name: v.optional(v.string()), // owner-supplied nickname
	/** The platform owner who created the row. */
	createdBy: v.id("users"),
	...timestamps,
}).index("by_provider", ["provider"]);
