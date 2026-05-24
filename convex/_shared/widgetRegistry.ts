/**
 * convex/_shared/widgetRegistry.ts
 *
 * Single source of truth for the dashboard widget catalogue.
 *
 * Phase 4 Part 2 (T8) — moved from `core/shell/shell/views/dashboard/cards/WidgetRegistry.tsx`
 * so the AI agent can introspect + write the layout without the React
 * dependency. The frontend file still owns the icons, the
 * `get(stats)` formatters, and the link factories — those live next
 * to the React render path.
 *
 * Why pure data here: Convex modules can't import React. The frontend
 * registry imports `WIDGETS` from this file and decorates each entry
 * with the rendering metadata it needs. The widget keys themselves —
 * the contract between `org.settings.dashboardMetrics` and the
 * registry — live here so backend tools (`list_widgets`,
 * `update_dashboard_layout`) and frontend renderer never drift.
 *
 * To add a new widget:
 *   1. Add the key + meta below.
 *   2. Add the matching `WidgetSpec` (icon, get, href) in the
 *      frontend WidgetRegistry.tsx so the dashboard can render it.
 *   3. (Optional) update industry templates' `dashboardMetrics`
 *      arrays to opt the new widget into the default layout.
 */

/**
 * Every widget key the platform recognises. Order is irrelevant —
 * dashboards render in the order declared by
 * `org.settings.dashboardMetrics`.
 */
export const WIDGET_KEYS = [
	"leads.open",
	"contacts.active",
	"companies.active",
	"deals.open",
	"deals.won",
	"deals.pipelineValue",
	"reminders.dueToday",
	"tasks.dueToday",
	"tasks.overdue",
	"tasks.doneThisWeek",
	"tasks.streak",
	"ai.morningBriefing",
] as const;

export type WidgetKey = (typeof WIDGET_KEYS)[number];

export type WidgetCategory = "crm" | "scheduling" | "productivity" | "ai";

export type WidgetSize = "kpi" | "half" | "full";

export type WidgetMeta = {
	/** Human-readable label rendered on the tile. */
	label: string;
	/** One-line description for tooltips + AI introspection. */
	description: string;
	/** Grouping for settings UI + AI suggestions. */
	category: WidgetCategory;
	/** Size hint — KPI tiles vs half-width vs full-width cards. */
	size: WidgetSize;
	/**
	 * Marker for incomplete widgets that render a placeholder tile.
	 * Excluded from default layouts; AI should not propose adding them.
	 */
	placeholder?: boolean;
};

/**
 * Canonical metadata for every supported widget. Frontend imports
 * from here and adds icons / formatters / hrefs on top.
 */
export const WIDGETS: Record<WidgetKey, WidgetMeta> = {
	"leads.open": {
		label: "Open leads",
		description: "Count of leads that haven't been won, lost, or converted.",
		category: "crm",
		size: "kpi",
	},
	"contacts.active": {
		label: "Contacts",
		description: "Total contacts in the workspace.",
		category: "crm",
		size: "kpi",
	},
	"companies.active": {
		label: "Companies",
		description: "Total companies in the workspace.",
		category: "crm",
		size: "kpi",
	},
	"deals.open": {
		label: "Open deals",
		description: "Deals that haven't reached a final stage (won / lost).",
		category: "crm",
		size: "kpi",
	},
	"deals.won": {
		label: "Deals won",
		description: "Deals closed-won across the workspace history.",
		category: "crm",
		size: "kpi",
	},
	"deals.pipelineValue": {
		label: "Pipeline value",
		description: "Sum of expected revenue across every open deal in the workspace's currency.",
		category: "crm",
		size: "kpi",
	},
	"reminders.dueToday": {
		label: "Due today",
		description: "Reminders scheduled for today that are still pending.",
		category: "scheduling",
		size: "kpi",
	},
	"tasks.dueToday": {
		label: "Tasks due today",
		description: "Productivity-template variant of reminders.dueToday with task framing.",
		category: "productivity",
		size: "kpi",
	},
	"tasks.overdue": {
		label: "Overdue",
		description: "Tasks past their due date.",
		category: "productivity",
		size: "kpi",
	},
	"tasks.doneThisWeek": {
		label: "Done this week",
		description: "Reminders / tasks completed in the trailing 7 days.",
		category: "productivity",
		size: "kpi",
	},
	"tasks.streak": {
		label: "Streak",
		description: "Daily-activity streak counter (placeholder until Phase 4B).",
		category: "productivity",
		size: "kpi",
		placeholder: true,
	},
	"ai.morningBriefing": {
		label: "AI morning briefing",
		description:
			"Full-width AI summary of overnight activity, top priorities, and stale records.",
		category: "ai",
		size: "full",
	},
};

/**
 * Sensible default layout — used when an org has no
 * `org.settings.dashboardMetrics` set. Mirrors the order in
 * `resolveWidgets` on the frontend.
 */
export const DEFAULT_DASHBOARD_LAYOUT: WidgetKey[] = [
	"leads.open",
	"contacts.active",
	"deals.open",
	"deals.pipelineValue",
];

/** True if `key` is a recognised widget key. */
export function isWidgetKey(key: string): key is WidgetKey {
	return (WIDGET_KEYS as readonly string[]).includes(key);
}

/**
 * Validate a candidate dashboardMetrics array. Returns the cleaned
 * list (unknown keys dropped, duplicates removed, placeholders kept
 * because templates may legitimately reference them) plus a list of
 * keys that were rejected so the caller can surface them.
 */
export function validateDashboardLayout(input: string[]): {
	keys: WidgetKey[];
	rejected: string[];
} {
	const seen = new Set<string>();
	const keys: WidgetKey[] = [];
	const rejected: string[] = [];
	for (const k of input) {
		if (seen.has(k)) continue;
		seen.add(k);
		if (isWidgetKey(k)) keys.push(k);
		else rejected.push(k);
	}
	return { keys, rejected };
}
