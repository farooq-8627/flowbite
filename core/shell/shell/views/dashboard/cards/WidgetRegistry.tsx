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
 * To add a new widget, update both files in lock-step.
 */

import {
	BriefcaseIcon,
	CalendarClockIcon,
	CheckCircle2Icon,
	ClockIcon,
	DollarSignIcon,
	Sparkles,
	TrendingUpIcon,
	UsersIcon,
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
 */
export const WIDGET_REGISTRY: Record<WidgetKey, WidgetSpec> = {
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
	"ai.morningBriefing": {
		key: "ai.morningBriefing",
		label: "AI briefing",
		get: () => "—",
		icon: <Sparkles className="size-3.5" />,
		accent: "text-primary",
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
			WIDGET_REGISTRY["leads.open"],
			WIDGET_REGISTRY["contacts.active"],
			WIDGET_REGISTRY["deals.open"],
			WIDGET_REGISTRY["deals.pipelineValue"],
		];
	}
	return metricKeys
		.map((k) => (k in WIDGET_REGISTRY ? WIDGET_REGISTRY[k as WidgetKey] : undefined))
		.filter((w): w is WidgetSpec => w !== undefined);
}
