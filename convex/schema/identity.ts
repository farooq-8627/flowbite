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
			aiDefaultModel: v.optional(v.string()),        // "claude-sonnet-4-5"
			aiDefaultProvider: v.optional(v.string()),     // "anthropic"
			aiAutoContextLoad: v.optional(v.boolean()),    // default true
			aiBriefingEnabled: v.optional(v.boolean()),    // default true
			aiContextCardCollapsed: v.optional(v.boolean()), // UI state
			aiPanelOpenByDefault: v.optional(v.boolean()), // default false mobile, true desktop
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
	stripeCustomerId: v.optional(v.string()),
	stripeSubscriptionId: v.optional(v.string()),
	aiContext: v.optional(v.string()),
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
					followup: v.optional(v.string()),
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
			reminderDefaults: v.optional(
				v.object({
					followUpWindowHours: v.optional(v.number()),
					staleAlertDays: v.optional(v.number()),
					morningBriefingEnabled: v.optional(v.boolean()),
					morningBriefingTime: v.optional(v.string()),
					rentAlertDays: v.optional(v.number()),
					rentAlertEnabled: v.optional(v.boolean()),
				}),
			),
			/**
			 * Follow-up cadence defaults.
			 *
			 * Doctrine (CODE-ARCHITECTURE-TIMELINE-FOLLOWUPS.md): follow-ups
			 * are reminders with `source === "followup"`. These settings
			 * affect that subset only — generic reminders ignore them.
			 *
			 * Every field is OPTIONAL so the block is purely additive — old
			 * org docs validate without backfill, and the
			 * `createFollowup` mutation falls back to hard-coded defaults
			 * when a field is unset.
			 *
			 *   defaultDueOffsetDays — when the user clicks "Follow up"
			 *     without specifying a date, the form defaults to
			 *     `today + N days` (default: 3).
			 *   defaultPriority      — default priority chip on a new
			 *     follow-up (default: "normal").
			 *   autoCloseAfterDays   — Phase B: auto-mark a follow-up
			 *     completed if it sits past-due for N days. `null` /
			 *     unset disables auto-close.
			 */
			followupDefaults: v.optional(
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
					/** Notify the assignee when a follow-up is created/updated. Default: true. */
					notifyAssignee: v.optional(v.boolean()),
					/** Require every follow-up to be linked to a deal before saving. Default: false. */
					requireDealCode: v.optional(v.boolean()),
					/** Send a reminder notification N hours before the follow-up is due. 0 = off. */
					reminderBeforeHours: v.optional(v.number()),
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
	 * Replaces the legacy stripe* fields. Stripe fields are kept on the
	 * schema (above) for backwards-compat with any existing dev rows but
	 * new code never reads or writes them.
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
	...timestamps,
	...softDelete,
})
	.index("by_slug", ["slug"])
	.index("by_stripeCustomerId", ["stripeCustomerId"])
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
	.index("by_orgId_and_status", ["orgId", "status"]);
