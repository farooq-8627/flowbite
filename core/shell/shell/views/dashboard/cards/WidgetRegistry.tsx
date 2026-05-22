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
 * Templates declare an ORDERED list of keys via
 * `template.dashboardMetrics` and the dashboard renders them in that
 * order. A template that omits a key simply hides that tile. A new
 * template + new key = add one row here.
 *
 * Why this lives outside `cards/`: the registry is a pure data table,
 * not a card component. Cards (RemindersCard, PipelineCard, etc.)
 * remain free-form. Tiles (the small rectangle metrics) are
 * registry-driven.
 */

import type { ReactNode } from "react";
import {
	BriefcaseIcon,
	CalendarClockIcon,
	CheckCircle2Icon,
	ClockIcon,
	DollarSignIcon,
	TrendingUpIcon,
	UsersIcon,
} from "lucide-react";
import { formatCurrency } from "@/core/shell/shared/hooks/useOrgDefaultCurrency";
import type { DashboardStats } from "../types";

export interface WidgetSpec {
	/** Metric key — also the registry-table key. */
	key: string;
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
 * Order in this object is irrelevant — the dashboard renders in the
 * order specified by `template.dashboardMetrics`. The dictionary
 * structure is purely for O(1) lookup.
 */
export const WIDGET_REGISTRY: Record<string, WidgetSpec> = {
	// CRM-shape widgets.
	"leads.open": {
		key: "leads.open",
		label: "Open leads",
		get: (s) => s.leadCount,
		href: (slug) => `/${slug}/leads`,
		icon: <UsersIcon className="size-3.5" />,
		accent: "text-amber-600",
	},
	"contacts.active": {
		key: "contacts.active",
		label: "Contacts",
		get: (s) => s.contactCount,
		href: (slug) => `/${slug}/contacts`,
		icon: <UsersIcon className="size-3.5" />,
		accent: "text-blue-600",
	},
	"companies.active": {
		key: "companies.active",
		label: "Companies",
		get: (s) => s.companiesCount,
		href: (slug) => `/${slug}/companies`,
		icon: <BriefcaseIcon className="size-3.5" />,
		accent: "text-violet-600",
	},
	"deals.open": {
		key: "deals.open",
		label: "Open deals",
		get: (s) => s.dealCount,
		href: (slug) => `/${slug}/deals`,
		icon: <BriefcaseIcon className="size-3.5" />,
		accent: "text-emerald-600",
	},
	"deals.won": {
		key: "deals.won",
		label: "Deals won",
		get: (s) => s.dealsWon,
		href: (slug) => `/${slug}/deals?stage=won`,
		icon: <TrendingUpIcon className="size-3.5" />,
		accent: "text-emerald-600",
	},
	"deals.pipelineValue": {
		key: "deals.pipelineValue",
		label: "Pipeline value",
		get: (s) =>
			s.dealCount === 0 && s.pipelineValue === 0
				? "—"
				: formatCurrency(s.pipelineValue, s.currency),
		icon: <DollarSignIcon className="size-3.5" />,
		accent: "text-foreground",
	},

	// Reminder / scheduling widgets — the productivity template uses
	// these as task widgets via the same metric keys (a reminder IS a
	// task in productivity-mode).
	"reminders.dueToday": {
		key: "reminders.dueToday",
		label: "Due today",
		get: (s) => s.remindersDueToday,
		href: (slug) => `/${slug}/reminders`,
		icon: <CalendarClockIcon className="size-3.5" />,
		accent: "text-blue-600",
	},

	// Productivity widgets — template id "productivity".
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
		label: "Overdue",
		get: (s) => s.tasksOverdue,
		href: (slug) => `/${slug}/reminders?overdue=1`,
		icon: <ClockIcon className="size-3.5" />,
		accent: "text-rose-600",
	},
	"tasks.doneThisWeek": {
		key: "tasks.doneThisWeek",
		label: "Done this week",
		get: (s) => s.tasksDoneThisWeek,
		icon: <CheckCircle2Icon className="size-3.5" />,
		accent: "text-emerald-600",
	},
	// Phase 4 — daily-activity streak. Stub renders a placeholder tile.
	"tasks.streak": {
		key: "tasks.streak",
		label: "Streak",
		get: () => "—",
		icon: <TrendingUpIcon className="size-3.5" />,
		accent: "text-orange-600",
		placeholder: true,
	},
};

/**
 * Resolve the metric keys a template wants into widget specs, dropping
 * anything not in the registry. Preserves the template's order.
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
	return metricKeys
		.map((k) => WIDGET_REGISTRY[k])
		.filter((w): w is WidgetSpec => w !== undefined);
}
