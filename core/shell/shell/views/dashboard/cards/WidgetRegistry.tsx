"use client";

/**
 * WIDGET_REGISTRY — Phase 3A.
 *
 * Maps a metric key (e.g. `"leads.open"`, `"tasks.dueToday"`) to:
 *   - A label displayed on the tile.
 *   - A getter that pulls the stat off the dashboard payload.
 *   - An optional href to deep-link the tile.
 *   - An icon + color accent.
 *
 * Phase 4 Part 2 (T8) — the **data** half of this registry (keys, labels,
 * descriptions, categories) lives in `convex/_shared/widgetRegistry.ts`
 * so the AI agent can introspect + write the dashboard layout. This
 * file owns the **render** half (icons, formatters, link factories).
 *
 * Sprint Stage 1 (2026-05-26 — DASHBOARD-AUDIT.md §3) — the registry
 * is now `Partial<Record<WidgetKey, WidgetSpec>>`. Section-size widgets
 * (e.g. `messages.recent`, `today.focus`) have no tile spec because
 * they render as cards gated on `isEnabled(key)` in `DashboardHomeView`,
 * not as tiles in `MetricStrip`. `resolveWidgets` filters to entries
 * that exist here AND have `size === "kpi"` in the data registry.
 *
 * To add a new widget, update both files in lock-step.
 */

import {
	BriefcaseIcon,
	CalendarClockIcon,
	CheckCircle2Icon,
	ClockIcon,
	DollarSignIcon,
	Sparkles,
	TrendingDownIcon,
	TrendingUpIcon,
	UsersIcon,
	WalletIcon,
} from "lucide-react";
import type { ReactNode } from "react";
import { WIDGETS, type WidgetKey } from "@/convex/_shared/widgetRegistry";
import { formatCurrency } from "@/core/shell/shared/hooks/useOrgDefaultCurrency";
import type { DashboardStats } from "../types";

export interface WidgetSpec {
	/** Metric key — also the registry-table key. */
	key: WidgetKey;
	/** Short label rendered on the tile. */
	label: string;
	/** Pulls the value off the stats payload. Number → rendered as count; string → rendered as-is. */
	get: (stats: DashboardStats) => number | string;
	/** Optional href factory. When set, the tile links to it. */
	href?: (orgSlug: string) => string;
	/** Lucide icon. */
	icon: ReactNode;
	/** Tailwind text color for the icon (e.g. `"text-amber-600"`). */
	accent?: string;
	/** "Coming soon" placeholder — registry-listed but not implemented. */
	placeholder?: boolean;
}

/**
 * Render-side specs. The data (label, description, category, size,
 * placeholder flag) is sourced from `convex/_shared/widgetRegistry.ts`
 * via the `WIDGETS` table; this object adds icons + getters + hrefs.
 *
 * Only KPI-size keys appear here. Section-size keys (half / full)
 * are gated as cards in `DashboardHomeView` directly via
 * `isEnabled(key)` — they don't need a tile spec.
 */
export const WIDGET_REGISTRY: Partial<Record<WidgetKey, WidgetSpec>> = {
	"leads.open": {
		key: "leads.open",
		label: WIDGETS["leads.open"].label,
		get: (s) => s.leadCount,
		href: (slug) => `/${slug}/leads`,
		icon: <UsersIcon className="size-3.5" />,
		accent: "text-amber-600",
	},
	"contacts.active": {
		key: "contacts.active",
		label: WIDGETS["contacts.active"].label,
		get: (s) => s.contactCount,
		href: (slug) => `/${slug}/contacts`,
		icon: <UsersIcon className="size-3.5" />,
		accent: "text-blue-600",
	},
	"companies.active": {
		key: "companies.active",
		label: WIDGETS["companies.active"].label,
		get: (s) => s.companiesCount,
		href: (slug) => `/${slug}/companies`,
		icon: <BriefcaseIcon className="size-3.5" />,
		accent: "text-violet-600",
	},
	"deals.open": {
		key: "deals.open",
		label: WIDGETS["deals.open"].label,
		get: (s) => s.dealCount,
		href: (slug) => `/${slug}/deals`,
		icon: <BriefcaseIcon className="size-3.5" />,
		accent: "text-emerald-600",
	},
	"deals.won": {
		key: "deals.won",
		label: WIDGETS["deals.won"].label,
		get: (s) => s.dealsWon,
		href: (slug) => `/${slug}/deals?stage=won`,
		icon: <TrendingUpIcon className="size-3.5" />,
		accent: "text-emerald-600",
	},
	"deals.pipelineValue": {
		key: "deals.pipelineValue",
		label: WIDGETS["deals.pipelineValue"].label,
		get: (s) =>
			s.dealCount === 0 && s.pipelineValue === 0
				? "—"
				: formatCurrency(s.pipelineValue, s.currency),
		icon: <DollarSignIcon className="size-3.5" />,
		accent: "text-foreground",
	},
	"reminders.dueToday": {
		key: "reminders.dueToday",
		label: WIDGETS["reminders.dueToday"].label,
		get: (s) => s.remindersDueToday,
		href: (slug) => `/${slug}/reminders`,
		icon: <CalendarClockIcon className="size-3.5" />,
		accent: "text-blue-600",
	},
	"tasks.dueToday": {
		key: "tasks.dueToday",
		label: "Due today",
		get: (s) => s.tasksDueToday,
		href: (slug) => `/${slug}/reminders`,
		icon: <CalendarClockIcon className="size-3.5" />,
		accent: "text-blue-600",
	},
	"tasks.overdue": {
		key: "tasks.overdue",
		label: WIDGETS["tasks.overdue"].label,
		get: (s) => s.tasksOverdue,
		href: (slug) => `/${slug}/reminders?overdue=1`,
		icon: <ClockIcon className="size-3.5" />,
		accent: "text-rose-600",
	},
	"tasks.doneThisWeek": {
		key: "tasks.doneThisWeek",
		label: WIDGETS["tasks.doneThisWeek"].label,
		get: (s) => s.tasksDoneThisWeek,
		icon: <CheckCircle2Icon className="size-3.5" />,
		accent: "text-emerald-600",
	},
	"tasks.streak": {
		key: "tasks.streak",
		label: WIDGETS["tasks.streak"].label,
		get: () => "—",
		icon: <TrendingUpIcon className="size-3.5" />,
		accent: "text-orange-600",
		placeholder: true,
	},
	// Stage 1 (2026-05-26) — KPI placeholders for productivity-template
	// + freelancer / agency / b2b_saas variants. Render as "Soon" tiles
	// (MetricStrip honours `placeholder` and substitutes the value).
	"tasks.thisWeek": {
		key: "tasks.thisWeek",
		label: WIDGETS["tasks.thisWeek"].label,
		get: () => "—",
		icon: <CalendarClockIcon className="size-3.5" />,
		accent: "text-blue-600",
		placeholder: true,
	},
	"tasks.recentlyCompleted": {
		key: "tasks.recentlyCompleted",
		label: WIDGETS["tasks.recentlyCompleted"].label,
		get: () => "—",
		icon: <CheckCircle2Icon className="size-3.5" />,
		accent: "text-emerald-600",
		placeholder: true,
	},
	"deals.lost": {
		key: "deals.lost",
		label: WIDGETS["deals.lost"].label,
		get: (s) => s.dealsLost,
		href: (slug) => `/${slug}/deals?stage=lost`,
		icon: <TrendingDownIcon className="size-3.5" />,
		accent: "text-rose-600",
	},
	"deals.invoiced.unpaid": {
		key: "deals.invoiced.unpaid",
		label: WIDGETS["deals.invoiced.unpaid"].label,
		get: () => "—",
		icon: <WalletIcon className="size-3.5" />,
		accent: "text-amber-600",
		placeholder: true,
	},
	"ai.morningBriefing": {
		key: "ai.morningBriefing",
		label: "AI briefing",
		get: () => "—",
		icon: <Sparkles className="size-3.5" />,
		accent: "text-primary",
	},
};

/**
 * Resolve the metric keys a template wants into widget specs. Drops
 * keys without a tile spec — section-size widgets (`reminders.list`,
 * `messages.recent`, `today.focus`, …) are rendered as cards gated by
 * `isEnabled(key)` in `DashboardHomeView` and intentionally don't
 * appear in the KPI strip. Preserves the template's order.
 */
export function resolveWidgets(metricKeys: string[] | undefined): WidgetSpec[] {
	if (!metricKeys || metricKeys.length === 0) {
		// Sensible default for orgs without a dashboardMetrics array.
		return [
			WIDGET_REGISTRY["leads.open"]!,
			WIDGET_REGISTRY["contacts.active"]!,
			WIDGET_REGISTRY["deals.open"]!,
			WIDGET_REGISTRY["deals.pipelineValue"]!,
		];
	}
	const specs: WidgetSpec[] = [];
	for (const k of metricKeys) {
		const spec = WIDGET_REGISTRY[k as WidgetKey];
		if (spec) specs.push(spec);
	}
	return specs;
}
