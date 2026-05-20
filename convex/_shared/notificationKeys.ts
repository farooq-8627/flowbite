/**
 * Notification preference keys — SINGLE SOURCE OF TRUTH.
 *
 * Add a key here and it propagates to:
 *   - The `users.notificationPreferences` schema validator (`schema/identity.ts`)
 *   - The `users.mutations.updateNotificationPreferences` mutation arg validator
 *   - The Settings → Notifications UI form
 *   - The `sendNotification` callsites that gate on a preference
 *
 * Key naming convention: `<group>_<event>` (lowercase, snake_case).
 * Group prefixes are arbitrary; pick one of the existing ones or add a new
 * group label below.
 */

import { v } from "convex/values";

// ─── Catalog ─────────────────────────────────────────────────────────────────

export type NotificationPreferenceCategory = "crm" | "reminders" | "ai" | "team" | "system";

export const NOTIFICATION_PREFERENCE_CATEGORIES: Record<NotificationPreferenceCategory, string> = {
	crm: "CRM",
	reminders: "Reminders",
	ai: "AI",
	team: "Team",
	system: "System",
};

export type NotificationPreferenceEntry = {
	readonly key: string;
	readonly category: NotificationPreferenceCategory;
	readonly label: string;
	readonly description?: string;
	readonly defaultValue: boolean;
};

export const NOTIFICATION_PREFERENCE_CATALOG: readonly NotificationPreferenceEntry[] = [
	// CRM
	{ key: "lead_assigned", category: "crm", label: "Lead assigned to me", defaultValue: true },
	{ key: "lead_converted", category: "crm", label: "Lead converted", defaultValue: true },
	{
		key: "contact_assigned",
		category: "crm",
		label: "Contact assigned to me",
		defaultValue: true,
	},
	{ key: "deal_assigned", category: "crm", label: "Deal assigned to me", defaultValue: true },
	{ key: "deal_stage_changed", category: "crm", label: "Deal stage changed", defaultValue: true },
	{
		key: "deal_pipeline_changed",
		category: "crm",
		label: "Deal moved to a different pipeline",
		description: "Fires when a deal you own is moved across pipelines.",
		defaultValue: true,
	},
	{ key: "deal_won", category: "crm", label: "Deal won", defaultValue: true },
	{ key: "deal_stale", category: "crm", label: "Deal becoming stale", defaultValue: true },
	{
		key: "company_assigned",
		category: "crm",
		label: "Company assigned to me",
		defaultValue: true,
	},
	{ key: "message_received", category: "crm", label: "New message received", defaultValue: true },
	{
		key: "message_mention",
		category: "crm",
		label: "Mentioned in a message",
		description: "Someone @-mentioned you.",
		defaultValue: true,
	},
	{
		key: "conversation_invite",
		category: "crm",
		label: "Added to a conversation",
		description: "Someone added you to a chat thread.",
		defaultValue: true,
	},

	// Reminders
	{ key: "reminder_due", category: "reminders", label: "Reminder due", defaultValue: true },
	{
		key: "reminder_overdue",
		category: "reminders",
		label: "Reminder overdue",
		defaultValue: true,
	},

	// AI
	{
		key: "ai_action_completed",
		category: "ai",
		label: "AI action completed",
		defaultValue: true,
	},
	{
		key: "ai_workspace_setup",
		category: "ai",
		label: "AI workspace setup ready",
		defaultValue: true,
	},

	// Team
	{ key: "member_invited", category: "team", label: "Invitation accepted", defaultValue: true },
	{ key: "member_joined", category: "team", label: "Team member joined", defaultValue: true },
	{ key: "role_changed", category: "team", label: "Your role changed", defaultValue: true },

	// System
	{
		key: "billing_trial_ending",
		category: "system",
		label: "Billing trial ending",
		defaultValue: true,
	},
	{
		key: "billing_suspended",
		category: "system",
		label: "Billing suspended",
		defaultValue: true,
	},
	{
		key: "csv_import_complete",
		category: "system",
		label: "CSV import complete",
		defaultValue: true,
	},
	{
		key: "csv_import_failed",
		category: "system",
		label: "CSV import failed",
		defaultValue: true,
	},
] as const;

export type NotificationPreferenceKey = (typeof NOTIFICATION_PREFERENCE_CATALOG)[number]["key"];

export const NOTIFICATION_PREFERENCE_KEYS: readonly string[] = NOTIFICATION_PREFERENCE_CATALOG.map(
	(p) => p.key,
);

// ─── Validators (derived from the catalog) ───────────────────────────────────

/**
 * Object validator for `users.notificationPreferences`. Every key is optional —
 * unset means "use the default". Generated from the catalog so adding a new
 * key here is the only edit required.
 */
export const notificationPreferencesValidator = v.object(
	Object.fromEntries(
		NOTIFICATION_PREFERENCE_CATALOG.map((p) => [p.key, v.optional(v.boolean())]),
	) as Record<string, ReturnType<typeof v.optional<ReturnType<typeof v.boolean>>>>,
);

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** O(1) lookup: key → catalog entry. Built once. */
const CATALOG_BY_KEY: ReadonlyMap<string, NotificationPreferenceEntry> = new Map(
	NOTIFICATION_PREFERENCE_CATALOG.map((p) => [p.key, p] as const),
);

export function getNotificationPreferenceEntry(
	key: string,
): NotificationPreferenceEntry | undefined {
	return CATALOG_BY_KEY.get(key);
}

/** Check whether a user has the given notification preference enabled. Defaults
 *  to the catalog's `defaultValue` when the user hasn't explicitly set it. */
export function isNotificationPreferenceEnabled(
	prefs: Record<string, boolean | undefined> | undefined,
	key: NotificationPreferenceKey,
): boolean {
	const entry = CATALOG_BY_KEY.get(key);
	const def = entry?.defaultValue ?? true;
	if (!prefs) return def;
	const v = prefs[key];
	return v === undefined ? def : v;
}
