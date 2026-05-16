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
				v.object({ singular: v.string(), plural: v.string(), slug: v.string() }),
			),
			contact: v.optional(
				v.object({ singular: v.string(), plural: v.string(), slug: v.string() }),
			),
			deal: v.optional(
				v.object({ singular: v.string(), plural: v.string(), slug: v.string() }),
			),
			company: v.optional(
				v.object({ singular: v.string(), plural: v.string(), slug: v.string() }),
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
		}),
	),
	...timestamps,
	...softDelete,
})
	.index("by_slug", ["slug"])
	.index("by_stripeCustomerId", ["stripeCustomerId"]);

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
	role: v.union(v.literal("admin"), v.literal("member"), v.literal("viewer")),
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
