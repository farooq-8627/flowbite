/**
 * Schema — Platform domain.
 *
 * Tables: platformTemplates, featureFlags, rateLimits.
 *
 * These are cross-org or platform-wide tables (super_admin operations).
 */

import { defineTable } from "convex/server";
import { v } from "convex/values";
import { timestamps } from "../_shared/validators";

/**
 * Industry templates stored in DB — not TypeScript config files.
 * Platform_admin creates/edits from admin UI. AI can generate templates.
 * Org owners can customize after seeding.
 */
export const platformTemplates = defineTable({
	key: v.string(),
	name: v.string(),
	description: v.string(),
	isBuiltIn: v.boolean(),
	entityLabels: v.optional(v.any()),
	entityVisibility: v.optional(v.any()),
	codePrefixDefaults: v.optional(v.any()),
	defaultPipelineName: v.string(),
	defaultStages: v.array(v.any()),
	defaultFieldDefinitions: v.optional(v.array(v.any())),
	defaultReminderSettings: v.optional(
		v.object({
			followUpWindowHours: v.optional(v.number()),
			staleAlertDays: v.optional(v.number()),
			morningBriefingEnabled: v.optional(v.boolean()),
			rentAlertEnabled: v.optional(v.boolean()),
			rentAlertDays: v.optional(v.number()),
		}),
	),
	dashboardMetrics: v.optional(v.array(v.string())),
	aiPersona: v.optional(v.string()),
	navHiddenSlots: v.optional(v.array(v.string())),
	createdBy: v.optional(v.id("users")),
	...timestamps,
})
	.index("by_key", ["key"])
	.index("by_builtin", ["isBuiltIn"]);

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
