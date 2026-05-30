/**
 * Schema — Identity domain.
 *
 * Tables: users, orgs, orgRoles, orgMembers, invitations.
 *
 * Shared validators (orgScoped, timestamps, softDelete) come from
 * `convex/_shared/validators.ts` per Rule R1.
 */

import { defineTable } from "convex/server";
import { v } from "convex/values";
import { notificationPreferencesValidator } from "../_shared/notificationKeys";
import { orgScoped, softDelete, timestamps } from "../_shared/validators";

export const users = defineTable({
	tokenIdentifier: v.string(),
	email: v.string(),
	name: v.optional(v.string()),
	avatarUrl: v.optional(v.string()),
	avatarStorageId: v.optional(v.id("_storage")),
	defaultOrgId: v.optional(v.id("orgs")),
	locale: v.optional(v.string()),
	timezone: v.optional(v.string()),
	onboardingCompleted: v.boolean(),
	lastActiveAt: v.optional(v.number()),
	dismissedCards: v.optional(v.array(v.string())),
	preferredLanguage: v.optional(v.string()),
	notificationPreferences: v.optional(notificationPreferencesValidator),
	platformRole: v.optional(v.literal("super_admin")),
	/**
	 * Platform-owner suspend slot. When set, `resolveUser` throws
	 * `USER_SUSPENDED` so the user is logged out on next request without
	 * destroying any data — distinct from soft-delete (`deletedAt`)
	 * which is permanent removal.
	 *
	 * Set/cleared from the platform-owner panel:
	 *   - `_platform/users/mutations.ts::suspendUser` writes `Date.now()`
	 *   - `_platform/users/mutations.ts::unsuspendUser` clears the slot
	 *
	 * Additive optional → no migration; pre-existing rows have
	 * `suspendedAt === undefined` and behave exactly as before.
	 */
	suspendedAt: v.optional(v.number()),
	suspensionReason: v.optional(v.string()),
	preferences: v.optional(
		v.object({
			entityDefaultView: v.optional(
				v.record(v.string(), v.union(v.literal("list"), v.literal("board"))),
			),
			savedViews: v.optional(
				v.record(
					v.string(),
					v.array(
						v.object({
							id: v.string(),
							name: v.string(),
							columns: v.array(v.string()),
							filters: v.optional(v.record(v.string(), v.any())),
						}),
					),
				),
			),
			// Phase 3B — AI preferences
			aiDefaultModel: v.optional(v.string()), // "claude-sonnet-4-5"
			aiDefaultProvider: v.optional(v.string()), // "anthropic"
			aiAutoContextLoad: v.optional(v.boolean()), // default true
			aiBriefingEnabled: v.optional(v.boolean()), // default true
			aiPanelOpenByDefault: v.optional(v.boolean()), // default false mobile, true desktop
			// Stage 5 — AIPulseRibbon dismiss state. Map of suggestion id ->
			// dismissedAt epoch ms. Bounded at 50 entries via the writer
			// (oldest entries dropped) so the row never balloons. Shape
			// chosen over an array because lookups + idempotent writes are
			// O(1). See core/shell/shell/views/dashboard/cards/AIPulseRibbon.tsx
			// + convex/users/mutations.ts:dismissAiPulseSuggestion.
			aiPulseDismissed: v.optional(v.record(v.string(), v.number())),
			/**
			 * Stage 8 — Autonomous layer (`/SPRINT-PLAN.md`). Per-user
			 * opt-ins for autonomous AI behaviour. EVERY KEY DEFAULTS TO
			 * FALSE — existing users see no surprise behaviour until they
			 * explicitly toggle a flag in Settings → AI → Automation.
			 *
			 * Capability mapping (capability-audit `§2.3 W-*`):
			 *   - autoTaskOnStageMove       → W-2: when a deal hits a stage
			 *     whose `pipelineStages.onEnter.autoFollowupTemplate` is
			 *     set, schedule `create_task` (type=followup) automatically.
			 *     (Renamed from `autoFollowupOnStageMove` per Stage 4B of
			 *     TASKS-RENAME-PLAN.md — the verb-family is "task", not
			 *     "followup". Migration:
			 *     `convex/_migrations/2026_05_27_renameAutoFollowupOnStageMove.ts`.)
			 *   - autoEnrichOnContactCreate → W-4: when a contact is
			 *     created with an email/domain, schedule `enrich_record`.
			 *   - autoTagOnNote             → W-3 (subset): when a new
			 *     note is added to an entity, run a classify-and-tag pass.
			 *   - weeklyDigestEmail         → W-5: receive the weekly
			 *     manager digest (deals at risk, top performers, stuck leads).
			 *
			 * The runner / trigger sites read these flags BEFORE
			 * scheduling any action; if the flag is off, the trigger is
			 * a no-op and no `aiToolEvents` row is written.
			 */
			aiAutonomy: v.optional(
				v.object({
					autoTaskOnStageMove: v.optional(v.boolean()),
					autoEnrichOnContactCreate: v.optional(v.boolean()),
					autoTagOnNote: v.optional(v.boolean()),
					weeklyDigestEmail: v.optional(v.boolean()),
				}),
			),
			/**
			 * Post-sprint addition (2026-05-26). Per-user "auto-approve"
			 * map for AI tool calls. Each key corresponds to one
			 * `approvalCategory` declared by tools in `convex/ai/toolRegistry.ts`
			 * (see `convex/_shared/aiApprovals.ts` for the canonical list +
			 * defaults).
			 *
			 * Semantics:
			 *   - `true`  → SKIP the propose/commit confirmation card; run
			 *               the tool atomically.
			 *   - `false` → ALWAYS show the confirmation card (overrides
			 *               the default).
			 *   - missing → use the default from `AUTO_APPROVE_DEFAULTS`.
			 *
			 * Defaults (chosen 2026-05-26 with the user):
			 *   ON  — update_record, convert_record, send_message,
			 *         manage_participants, schedule, files
			 *   OFF — create_record, delete_record (so single-record creates
			 *         + deletions still surface a preview card)
			 *
			 * Hard-locked categories (`bulk`, `settings`, `members`,
			 * `ask_user`) are NOT in this map — they ALWAYS require approval
			 * regardless of preferences. The settings UI surfaces them as
			 * read-only "Always asks — workspace policy" rows.
			 */
			aiApprovals: v.optional(
				v.object({
					create_record: v.optional(v.boolean()),
					update_record: v.optional(v.boolean()),
					delete_record: v.optional(v.boolean()),
					convert_record: v.optional(v.boolean()),
					send_message: v.optional(v.boolean()),
					manage_participants: v.optional(v.boolean()),
					schedule: v.optional(v.boolean()),
					files: v.optional(v.boolean()),
				}),
			),
			/**
			 * Stage 3-A.5 (`/SPRINT-PLAN.md`). Per-user collapse state for
			 * named dashboard sections. Default expanded — `true` collapses
			 * the section to its header. Adding a new section key here is
			 * purely additive (optional) and does NOT need a migration.
			 *
			 * Currently honoured by:
			 *   - `proactive` → wraps the AI cluster on the dashboard
			 *     (AISuggestionsPanel + AIPulseRibbon + AIQuickComposerCard +
			 *     DailyBriefingCard + WeeklyInsightCard) inside
			 *     `<AICockpitSection>` (Stage 1 of DASHBOARD-V2-PLAN.md
			 *     renamed `<ProactiveWorkspaceSection>`; the storage key
			 *     stayed `proactive` so existing per-user collapse state
			 *     carries over).
			 */
			dashboardSectionsCollapsed: v.optional(
				v.object({
					proactive: v.optional(v.boolean()),
				}),
			),
			/**
			 * Stage 5 (`/DASHBOARD-V2-PLAN.md` Stage 5, locked decision #13).
			 *
			 * Per-user dashboard layout override scoped to an active org.
			 * Resolution chain (top-down — first hit wins):
			 *
			 *   1. `user.preferences.dashboardLayoutOverride.layout`
			 *      (this slot, when `orgId` matches the active workspace)
			 *   2. `org.settings.dashboardLayout` (org default — Stage 4)
			 *   3. legacy fixed grid (`DashboardHomeView` default branch)
			 *
			 * Single-org-active model — only the user's currently-viewed
			 * org owns this slot at a time. When the user switches org,
			 * the slot may carry a stale `orgId`; the renderer compares
			 * `orgId` and falls back to the org default if mismatched.
			 * Multi-org per-user override is a future expansion to
			 * `v.array(...)` if needed.
			 *
			 * `layout` is the same shape as `org.settings.dashboardLayout`
			 * (validated by `widgetRegistry.validateDashboardLayoutShape`)
			 * — kept loose here as `v.any()` to avoid duplicating the full
			 * validator inside the schema (which the SSOT validator
			 * enforces at write time anyway). The mutation
			 * `users.mutations:setMyDashboardLayoutOverride` re-validates
			 * the shape via the SSOT validator before writing, so this
			 * slot can never carry an invalid layout.
			 *
			 * Writes:
			 *   - `users.mutations:setMyDashboardLayoutOverride` — replaces
			 *     the slot with the user's customised layout (drag-reorder,
			 *     "Pin to my dashboard", etc.).
			 *   - `users.mutations:clearMyDashboardLayoutOverride` —
			 *     "Reset to org default" button. Sets the slot to undefined.
			 *
			 * AI never writes this slot. Per the architectural rule in
			 * DASHBOARD-V2-PLAN.md Stage 5: "AI never writes the canonical
			 * dashboard layout." AI's `render_widget` writes to
			 * `ephemeralDashboardCells` (per-user 24h TTL); the user's
			 * deliberate "Pin to my dashboard" click is what mutates this
			 * slot.
			 */
			dashboardLayoutOverride: v.optional(
				v.object({
					orgId: v.id("orgs"),
					layout: v.any(),
					updatedAt: v.number(),
				}),
			),
			/**
			 * Stage 7 of `/DASHBOARD-V2-PLAN.md` (2026-05-29) → per-user
			 * setting (2026-05-30). How many rows the dashboard's
			 * Recent activity + Recent messages widgets render.
			 *
			 * Migrated out of the `DASHBOARD_RECENT_ACTIVITY_LIMIT` /
			 * `DASHBOARD_RECENT_MESSAGES_LIMIT` constants in
			 * `core/shell/shell/views/dashboard/DashboardHomeView.tsx` so
			 * each user can dial preview density up or down without a code
			 * change. The same number drives both widgets (they're tuned
			 * in lockstep so the dashboard's two recent-rows panels stay
			 * visually parallel).
			 *
			 * Range: 3..15 enforced by the writer
			 * (`users.mutations:updatePreferences`). Reads clamp the value
			 * with the same bounds + fall back to 6 (the historic constant)
			 * when the slot is undefined. Server-side
			 * `getDashboardStats({ recentActivityLimit })` clamps to [1, 50].
			 *
			 * Set via Settings → Appearance → Dashboard density.
			 */
			dashboardActivityRowLimit: v.optional(v.number()),
		}),
	),
	...timestamps,
	...softDelete,
})
	.index("by_tokenIdentifier", ["tokenIdentifier"])
	.index("by_email", ["email"]);

export const orgs = defineTable({
	name: v.string(),
	slug: v.string(),
	logoStorageId: v.optional(v.id("_storage")),
	platformOrgId: v.optional(v.string()),
	plan: v.union(
		v.literal("free"),
		v.literal("starter"),
		v.literal("pro"),
		v.literal("enterprise"),
	),
	industry: v.optional(v.string()),
	teamSize: v.optional(v.string()),
	onboardingStep: v.optional(v.number()),
	entityLabels: v.optional(
		v.object({
			lead: v.optional(
				v.object({
					singular: v.string(),
					plural: v.string(),
					slug: v.string(),
					singularAr: v.optional(v.string()),
					pluralAr: v.optional(v.string()),
				}),
			),
			contact: v.optional(
				v.object({
					singular: v.string(),
					plural: v.string(),
					slug: v.string(),
					singularAr: v.optional(v.string()),
					pluralAr: v.optional(v.string()),
				}),
			),
			deal: v.optional(
				v.object({
					singular: v.string(),
					plural: v.string(),
					slug: v.string(),
					singularAr: v.optional(v.string()),
					pluralAr: v.optional(v.string()),
				}),
			),
			company: v.optional(
				v.object({
					singular: v.string(),
					plural: v.string(),
					slug: v.string(),
					singularAr: v.optional(v.string()),
					pluralAr: v.optional(v.string()),
				}),
			),
		}),
	),
	settings: v.optional(
		v.object({
			defaultCurrency: v.optional(v.string()),
			timezone: v.optional(v.string()),
			leadStaleAfterDays: v.optional(v.number()),
			badgeCountsVisible: v.optional(v.boolean()),
			codePrefixes: v.optional(
				v.object({
					person: v.optional(v.string()),
					deal: v.optional(v.string()),
					company: v.optional(v.string()),
					task: v.optional(v.string()),
				}),
			),
			modules: v.optional(
				v.array(
					v.object({
						slot: v.string(),
						label: v.optional(v.string()),
						hidden: v.optional(v.boolean()),
						order: v.optional(v.number()),
						defaultView: v.optional(v.union(v.literal("list"), v.literal("board"))),
						cardFields: v.optional(v.array(v.string())),
						listColumns: v.optional(v.array(v.string())),
						boardGroupBy: v.optional(v.string()),
						defaultFilters: v.optional(v.array(v.string())),
						meta: v.optional(v.any()),
					}),
				),
			),
			/**
			 * Task cadence defaults.
			 *
			 * Replaces the legacy `followupDefaults` + `reminderDefaults`
			 * blocks (dropped in Stage 4D of TASKS-RENAME-PLAN.md). Affects
			 * `type === "followup"` tasks only — generic to-dos / calls /
			 * emails / meetings ignore these defaults.
			 */
			taskDefaults: v.optional(
				v.object({
					defaultDueOffsetDays: v.optional(v.number()),
					defaultPriority: v.optional(
						v.union(
							v.literal("low"),
							v.literal("normal"),
							v.literal("high"),
							v.literal("urgent"),
						),
					),
					autoCloseAfterDays: v.optional(v.number()),
					notifyAssignee: v.optional(v.boolean()),
					requireDealCode: v.optional(v.boolean()),
					reminderBeforeHours: v.optional(v.number()),
				}),
			),
			/**
			 * Morning-briefing defaults. Workspace-level toggle + hour for
			 * the AI daily briefing. Stage 4D split this out of the
			 * dropped `reminderDefaults` block so it has a clean home that
			 * matches its actual semantics.
			 */
			briefingDefaults: v.optional(
				v.object({
					morningBriefingEnabled: v.optional(v.boolean()),
					/** "HH:MM" 24-hour. */
					morningBriefingTime: v.optional(v.string()),
				}),
			),
			fileUpload: v.optional(
				v.object({
					allowedMimeCategories: v.optional(v.array(v.string())),
					maxSizeMb: v.optional(v.number()),
				}),
			),
			// Per-tenant rate-limit overrides. Each entry overrides the matching
			// preset in `_shared/rateLimit.ts::RATE_LIMITS`. Unset = inherit.
			// Use sparingly — tightening for abusive orgs, loosening for trusted.
			rateLimits: v.optional(
				v.array(
					v.object({
						scope: v.string(), // e.g. "messages.send"
						max: v.number(),
						periodMs: v.number(),
					}),
				),
			),
			/**
			 * Phase 3A — dashboard widget rank list.
			 *
			 * Ordered list of widget keys (top-to-bottom). The order IS the
			 * dashboard layout order — the first 4 keys render as KPI tiles
			 * in the top strip, subsequent half-size widgets render in pairs,
			 * and full-width widgets stack at the bottom.
			 *
			 * Seeded by the industry-template seeder from `template.dashboardMetrics`.
			 * Owners can drag-reorder via Settings → Workspace.
			 *
			 * Widget keys are validated against the WIDGET_REGISTRY at render
			 * time — unknown keys are silently dropped. Adding a new widget =
			 * adding a registry entry; templates can opt in by listing the key.
			 */
			dashboardMetrics: v.optional(v.array(v.string())),
			/**
			 * Stage 4 of /DASHBOARD-V2-PLAN.md (2026-05-29) — additive
			 * optional layout descriptor that supersedes the flat
			 * `dashboardMetrics` rendering path when set.
			 *
			 * Renderer fallback: when this slot is undefined the dashboard
			 * keeps the existing `dashboardMetrics`-driven path (KPI strip
			 * + fixed grid). When set, `<DashboardHomeView>` switches to
			 * the layout-aware renderer that paints:
			 *   - optional `hero` widget (full-width above the strip)
			 *   - KPI strip (defaults to `dashboardMetrics` when
			 *     `metrics` is omitted, otherwise honours `metrics`)
			 *   - panel grid, where each panel declares an `lg+`-breakpoint
			 *     `span: 1 | 2 | 3` against a 3-column grid track.
			 *
			 * Cross-validated at write time by
			 * `validateDashboardLayoutShape` (in `_shared/widgetRegistry.ts`)
			 * AND at template-seed time by
			 * `_platform/industries/validators.ts::validateDefinition`,
			 * so unknown widget keys never reach the runtime path. No
			 * migration needed — additive optional.
			 */
			dashboardLayout: v.optional(
				v.object({
					hero: v.optional(v.string()),
					metrics: v.optional(v.array(v.string())),
					panels: v.array(
						v.object({
							id: v.string(),
							span: v.union(v.literal(1), v.literal(2), v.literal(3)),
							widget: v.string(),
						}),
					),
					forecast: v.optional(
						v.object({
							coverageBands: v.optional(
								v.object({
									healthy: v.number(),
									warning: v.number(),
								}),
							),
						}),
					),
				}),
			),
			/**
			 * Phase 3A — soft-delete retention.
			 *
			 * Number of days a soft-deleted record sits in trash before the
			 * daily purge cron hard-deletes it. Default 30 (applied at read
			 * time, not stored). Range enforced server-side: 7–365.
			 *
			 * Resolution order at purge time:
			 *   org.settings.softDeleteRetentionDays
			 *   → platformDefaults.softDeleteRetentionDays
			 *   → 30 (hardcoded fallback)
			 */
			softDeleteRetentionDays: v.optional(v.number()),
			/**
			 * Phase 3A — mock-data lifecycle.
			 *
			 * mockDataSeededAt: timestamp of when the template seeder inserted
			 * sample records. Used by:
			 *   - the dashboard banner (rendered while seeded && !dismissed)
			 *   - the "Delete sample data" button (skip if undefined)
			 *   - the seedMockEntities() idempotency guard (skip if set)
			 * Cleared back to undefined on "Delete sample data".
			 *
			 * mockDataDismissedAt: timestamp of when the user dismissed the
			 * banner WITHOUT deleting. Lets the banner stop nagging while
			 * the data stays in place.
			 */
			mockDataSeededAt: v.optional(v.number()),
			mockDataDismissedAt: v.optional(v.number()),
			/**
			 * Phase 3A — GDPR cascade-deletion grace timer.
			 *
			 * Set when an owner requests workspace deletion. The
			 * `performOrgDeletion` action checks this against
			 * `Date.now()` — if cleared (undefined) the deletion was
			 * cancelled and the action no-ops.
			 */
			deletionScheduledAt: v.optional(v.number()),
		}),
	),
	/**
	 * Phase 3A — LemonSqueezy billing.
	 *
	 * Subscription status mirrors LemonSqueezy's documented values:
	 *   on_trial | active | paused | past_due | unpaid | cancelled | expired
	 */
	lemonSqueezyCustomerId: v.optional(v.string()),
	lemonSqueezySubscriptionId: v.optional(v.string()),
	lemonSqueezyVariantId: v.optional(v.string()),
	lemonSqueezySubscriptionStatus: v.optional(
		v.union(
			v.literal("on_trial"),
			v.literal("active"),
			v.literal("paused"),
			v.literal("past_due"),
			v.literal("unpaid"),
			v.literal("cancelled"),
			v.literal("expired"),
		),
	),
	lemonSqueezyCurrentPeriodEnd: v.optional(v.number()),
	/**
	 * Platform-owner suspend slot. When set, every `requireOrgMember`
	 * call throws `ORG_SUSPENDED` so members are kicked out of the
	 * workspace without destroying any data — distinct from
	 * soft-delete (`deletedAt`) which permanently removes the workspace.
	 *
	 * Set/cleared from the platform-owner panel:
	 *   - `_platform/orgs/mutations.ts::suspendOrg` writes `Date.now()`
	 *   - `_platform/orgs/mutations.ts::unsuspendOrg` clears the slot
	 *
	 * Additive optional → no migration; pre-existing rows have
	 * `suspendedAt === undefined` and behave exactly as before.
	 */
	suspendedAt: v.optional(v.number()),
	suspensionReason: v.optional(v.string()),
	...timestamps,
	...softDelete,
})
	.index("by_slug", ["slug"])
	.index("by_lemonSqueezyCustomerId", ["lemonSqueezyCustomerId"])
	.index("by_lemonSqueezySubscriptionId", ["lemonSqueezySubscriptionId"]);

export const orgRoles = defineTable({
	...orgScoped,
	name: v.string(),
	description: v.optional(v.string()),
	permissions: v.array(v.string()),
	isSystem: v.boolean(),
	isDefault: v.boolean(),
	color: v.optional(v.string()),
	...timestamps,
})
	.index("by_orgId", ["orgId"])
	.index("by_orgId_and_name", ["orgId", "name"])
	.index("by_orgId_and_isDefault", ["orgId", "isDefault"]);

export const orgMembers = defineTable({
	...orgScoped,
	userId: v.id("users"),
	roleId: v.id("orgRoles"),
	permissions: v.optional(v.array(v.string())),
	invitedBy: v.optional(v.id("users")),
	joinedAt: v.number(),
	updatedAt: v.optional(v.number()),
	...softDelete,
})
	.index("by_orgId_and_userId", ["orgId", "userId"])
	.index("by_userId", ["userId"]);

export const invitations = defineTable({
	...orgScoped,
	email: v.string(),
	// Reference to the org's `orgRoles` doc. Replaces the legacy
	// `role: "admin"|"member"|"viewer"` string union — see migration
	// `convex/_migrations/2026_05_21_invitationRoleToRoleId.ts` for the
	// backfill (idempotent, runs once). Migration ran successfully on
	// dev on 2026-05-21 (6 rows updated), so the bridge fields are gone.
	roleId: v.id("orgRoles"),
	status: v.union(
		v.literal("pending"),
		v.literal("accepted"),
		v.literal("declined"),
		v.literal("expired"),
	),
	invitedBy: v.id("users"),
	token: v.string(),
	expiresAt: v.number(),
	...timestamps,
})
	.index("by_orgId_and_email", ["orgId", "email"])
	.index("by_token", ["token"])
	.index("by_orgId_and_status", ["orgId", "status"])
	// Lets `invitations.queries.listPendingForMe` resolve every pending
	// invitation addressed to the signed-in user's email across ALL orgs
	// in O(log n) — used by the WorkspaceSwitcher to surface "you've been
	// invited to <org>" entries directly in the org-switcher dropdown.
	// Adding a secondary index over an existing field is a non-breaking
	// schema change (no row data shape changes), so no migration is
	// required — Convex builds the index lazily on first push.
	.index("by_email_and_status", ["email", "status"]);
