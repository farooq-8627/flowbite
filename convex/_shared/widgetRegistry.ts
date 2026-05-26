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
 * Sprint Stage 1 (2026-05-26 — DASHBOARD-AUDIT.md §3 Step 1) — extended
 * the catalogue from 12 KPI-only keys to 25 keys covering every
 * dashboard surface (KPI tiles + section cards + placeholders) the
 * industry templates legitimately reference. Closes the "reminders
 * widget not showing" bug whose root cause was the `generic` template
 * writing the unregistered `reminders.list` section key. After this
 * change `validateDashboardLayout` accepts every template's keys, the
 * `update_dashboard_layout` AI tool can write them, and unknown keys
 * are still rejected loudly. The companion migration
 * `convex/_migrations/2026_05_26_normalizeDashboardMetrics.ts` rewrites
 * the legacy `calendar.miniWidget` alias to canonical `calendar.mini`
 * across every existing org row.
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
 *   2. (For KPI-size widgets) add the matching `WidgetSpec` (icon,
 *      get, href) in the frontend `WidgetRegistry.tsx` so the dashboard
 *      can render it as a tile. Section / full-size widgets render as
 *      cards gated on `isEnabled(key)` in `DashboardHomeView.tsx` and
 *      do not need a frontend tile spec.
 *   3. (Optional) update industry templates' `dashboardMetrics`
 *      arrays to opt the new widget into the default layout.
 */

/**
 * Every widget key the platform recognises. Order is irrelevant —
 * dashboards render in the order declared by
 * `org.settings.dashboardMetrics`.
 */
export const WIDGET_KEYS = [
	// ── KPI tiles (rendered by MetricStrip) ─────────────────────────────
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
	// KPI placeholders (templates use them; UI ships in Phase 4+).
	"tasks.thisWeek",
	"tasks.recentlyCompleted",
	"deals.lost",
	"deals.invoiced.unpaid",
	// ── Section cards (rendered conditionally below the KPI strip) ──────
	"reminders.list", // RemindersCard gate
	"messages.recent", // MessagesPreviewWidget gate
	"activity.recent", // TimelineActivityWidget gate
	"calendar.weekAhead", // WeekAheadWidget gate (full width)
	"calendar.mini", // MiniCalendarWidget gate
	"today.focus", // TodaySummaryCard gate
	// Section placeholders (templates use them; widgets to be built later).
	"deals.pipeline",
	"deals.staleByStage",
	"deals.renewingIn30Days",
	// Stage 7 (SPRINT-PLAN.md) — Pipeline-velocity card.
	"pipeline.velocity",
	// ── Full-width AI surfaces ──────────────────────────────────────────
	"ai.morningBriefing",
	"ai.quickComposer",
	"ai.pulseRibbon",
] as const;

export type WidgetKey = (typeof WIDGET_KEYS)[number];

export type WidgetCategory = "crm" | "scheduling" | "productivity" | "ai";

/**
 * Layout-size discriminator.
 *   - `kpi`  — small numeric tile rendered by `MetricStrip`.
 *   - `half` — half-width card rendered conditionally below the strip.
 *   - `full` — full-width card rendered conditionally below the strip.
 *
 * Frontend `resolveWidgets` filters to size === "kpi" only — section
 * widgets are not iterated as tiles, they gate dedicated cards via
 * `isEnabled(key)` in `DashboardHomeView`.
 */
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
	 * Marker for incomplete widgets that render a placeholder tile or
	 * have no UI surface yet. Excluded from default layouts; AI may
	 * reference them via `list_widgets` but should not propose adding
	 * them until the matching widget is built.
	 */
	placeholder?: boolean;
};

/**
 * Canonical metadata for every supported widget. Frontend imports
 * from here and adds icons / formatters / hrefs on top.
 */
export const WIDGETS: Record<WidgetKey, WidgetMeta> = {
	// ── KPI tiles ───────────────────────────────────────────────────────
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
	"tasks.thisWeek": {
		label: "Due this week",
		description: "Tasks due in the trailing 7 days (placeholder — UI in Phase 4B).",
		category: "productivity",
		size: "kpi",
		placeholder: true,
	},
	"tasks.recentlyCompleted": {
		label: "Recently completed",
		description: "Most recently completed tasks (placeholder — UI in Phase 4B).",
		category: "productivity",
		size: "kpi",
		placeholder: true,
	},
	"deals.lost": {
		label: "Deals lost",
		description: "Deals closed-lost across the workspace history (placeholder).",
		category: "crm",
		size: "kpi",
		placeholder: true,
	},
	"deals.invoiced.unpaid": {
		label: "Awaiting payment",
		description:
			"Invoiced deals not yet paid — used by freelancer / agency templates (placeholder).",
		category: "crm",
		size: "kpi",
		placeholder: true,
	},

	// ── Section cards (gated below the KPI strip) ───────────────────────
	"reminders.list": {
		label: "Reminders & follow-ups",
		description:
			"Card surfacing today's + overdue reminders with inline create. Gates the dashboard's RemindersCard.",
		category: "scheduling",
		size: "half",
	},
	"messages.recent": {
		label: "Recent messages",
		description: "Card listing the most recent conversation messages across the workspace.",
		category: "crm",
		size: "half",
	},
	"activity.recent": {
		label: "Recent activity",
		description: "Card surfacing the org-wide timeline feed of CRM activity.",
		category: "crm",
		size: "half",
	},
	"calendar.weekAhead": {
		label: "Week ahead",
		description: "Full-width 7-day strip of upcoming reminders + calendar events.",
		category: "scheduling",
		size: "full",
	},
	"calendar.mini": {
		label: "Calendar (mini)",
		description: "Small month-grid date picker that deep-links into the full calendar.",
		category: "scheduling",
		size: "half",
	},
	"today.focus": {
		label: "Today's focus",
		description:
			"Card summarising today's commitments — reminders due, leads to qualify, deals to advance.",
		category: "productivity",
		size: "half",
	},
	"deals.pipeline": {
		label: "Pipeline visualisation",
		description:
			"Stage-by-stage pipeline overview (placeholder — gated until the dedicated card ships).",
		category: "crm",
		size: "half",
		placeholder: true,
	},
	"deals.staleByStage": {
		label: "Stale deals by stage",
		description: "Stage-by-stage breakdown of deals past their stale threshold (placeholder).",
		category: "crm",
		size: "half",
		placeholder: true,
	},
	"deals.renewingIn30Days": {
		label: "Renewing in 30 days",
		description:
			"Won deals whose lease / subscription expires within 30 days — used by real-estate / Saudi templates (placeholder).",
		category: "crm",
		size: "half",
		placeholder: true,
	},
	// Stage 7 (SPRINT-PLAN.md) — Pipeline-velocity card. Computes avg
	// days-in-stage + dropoff per stage from `deals.stageEnteredAt` +
	// `activityLogs` `stage_changed` action rows. Pure deterministic;
	// no LLM cost. Drives the on-demand "where do leads die?" answer.
	"pipeline.velocity": {
		label: "Pipeline velocity",
		description:
			"Average days deals spend in each stage + dropoff per stage. Updates whenever a deal moves stage; no LLM call.",
		category: "crm",
		size: "full",
	},

	// ── Full-width AI surfaces ──────────────────────────────────────────
	"ai.morningBriefing": {
		label: "AI morning briefing",
		description:
			"Full-width AI summary of overnight activity, top priorities, and stale records.",
		category: "ai",
		size: "full",
	},
	// Stage 5 — AI dashboard surface (SPRINT-PLAN.md Stage 5).
	"ai.quickComposer": {
		label: "AI quick composer",
		description:
			"Pinned mini chat composer on the dashboard. Drops the typed prompt into the AI chat panel with a single click — no need to open the side sheet first.",
		category: "ai",
		size: "full",
	},
	"ai.pulseRibbon": {
		label: "AI pulse",
		description:
			"Top 3 highest-value AI suggestions, dismissible per-user. Renders above the metric strip when there is at least one suggestion.",
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

/**
 * Legacy → canonical key rename map. Read by both the schema-time
 * migration `2026_05_26_normalizeDashboardMetrics.ts` AND the AI tool
 * `update_dashboard_layout` so models that still emit the old name
 * silently coerce instead of erroring. New legacy aliases must be
 * added here AND covered by a migration that rewrites existing rows.
 *
 * Aliases are NOT registered as widget keys. `validateDashboardLayout`
 * still rejects them — callers must rewrite via this map first.
 */
export const LEGACY_KEY_RENAMES: Record<string, WidgetKey> = {
	// `calendar.miniWidget` was used by productivity + freelancer templates
	// before Stage 1 of the dashboard fix wave. Collapsed to canonical
	// `calendar.mini`. The migration rewrites all existing org settings.
	"calendar.miniWidget": "calendar.mini",
};

/**
 * Apply legacy renames + de-duplication to a candidate dashboardMetrics
 * array. Used by the migration and any future bulk-import path.
 * Idempotent — running twice is a no-op.
 */
export function normalizeDashboardLayout(input: readonly string[]): {
	keys: WidgetKey[];
	rejected: string[];
	renamed: Array<{ from: string; to: WidgetKey }>;
} {
	const seen = new Set<string>();
	const keys: WidgetKey[] = [];
	const rejected: string[] = [];
	const renamed: Array<{ from: string; to: WidgetKey }> = [];
	for (const raw of input) {
		const aliasTarget = LEGACY_KEY_RENAMES[raw];
		const candidate = aliasTarget ?? raw;
		if (seen.has(candidate)) continue;
		seen.add(candidate);
		if (isWidgetKey(candidate)) {
			keys.push(candidate);
			if (aliasTarget) renamed.push({ from: raw, to: aliasTarget });
		} else {
			rejected.push(raw);
		}
	}
	return { keys, rejected, renamed };
}
