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
	PercentIcon,
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
		// Stage 1 of DASHBOARD-V2-PLAN.md (2026-05-28) — `WalletIcon` is
		// currency-agnostic; `DollarSignIcon` was inappropriate for
		// non-USD workspaces (the body already calls
		// `formatCurrency(value, stats.currency)` and renders ₹ / € / ج.م
		// / etc. correctly — only the icon was hardcoded).
		icon: <WalletIcon className="size-3.5" />,
		accent: "text-foreground",
	},
	// 2026-05-30 — Win rate KPI joins the canonical strip. Pure
	// client-side derivation: `dealsWon / (dealsWon + dealsLost) × 100`,
	// rounded to the nearest whole percent. Renders `0%` (not `—`)
	// when no deals have closed yet so the tile lands as a real
	// number. Doesn't link to `/deals?stage=won` because the metric
	// is the ratio across BOTH closed states — a deals-page filter
	// would mislead.
	"deals.winRate": {
		key: "deals.winRate",
		label: WIDGETS["deals.winRate"].label,
		get: (s) => {
			const closed = s.dealsWon + s.dealsLost;
			if (closed === 0) return "0%";
			return `${Math.round((s.dealsWon / closed) * 100)}%`;
		},
		icon: <PercentIcon className="size-3.5" />,
		accent: "text-emerald-600",
	},
	"tasks.dueToday": {
		key: "tasks.dueToday",
		label: "Due today",
		get: (s) => s.tasksDueToday,
		href: (slug) => `/${slug}/tasks`,
		icon: <CalendarClockIcon className="size-3.5" />,
		accent: "text-blue-600",
	},
	"tasks.overdue": {
		key: "tasks.overdue",
		label: WIDGETS["tasks.overdue"].label,
		get: (s) => s.tasksOverdue,
		href: (slug) => `/${slug}/tasks?overdue=1`,
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
	// Stage 1 of DASHBOARD-V2-PLAN.md (2026-05-28) — `ai.morningBriefing`
	// removed from the KPI registry. The full-width `<DailyBriefingCard>`
	// inside the AI Cockpit section IS the briefing surface; rendering
	// a "—" KPI tile alongside it produced a redundant 5th column in
	// the metric strip. The data-side `WIDGETS["ai.morningBriefing"]`
	// entry stays (size: "full") so the section render path in
	// `DashboardHomeView` via `isEnabled("ai.morningBriefing")` keeps
	// working — only the KPI tile is gone.
};

/**
 * Today's-focus actionable counts, folded into the KPI strip when a
 * template/layout lists the section key `today.focus`. The standalone
 * `TodaySummaryCard` was retired 2026-05-29 — these four counts now live
 * in the always-visible metric strip instead of a lonely bottom card.
 */
const TODAY_FOCUS_KPIS: WidgetKey[] = ["tasks.dueToday", "leads.open", "deals.open", "deals.won"];

/**
 * 2026-05-30 — The dashboard's canonical KPI quartet. Locked across
 * every industry (sales-only, real-estate, freelancer, b2b-saas, …)
 * because the user explicitly asked for a single global strip:
 *
 *   1. Pipeline value — open value across every pipeline.
 *   2. Win rate — closed-won ÷ total closed.
 *   3. Due today — pending tasks + reminders due today.
 *   4. Open leads — leads not yet converted / lost.
 *
 * The `<RevenueEstimateHero>` above the strip already represents
 * Open Deals / Deals Won / Deals Lost as one bold consolidated
 * number, so the strip stops doubling those tiles. The dashboard
 * renderers (`DashboardHomeView`, `DashboardLayoutRenderer`) read
 * THIS list directly — they no longer call `resolveWidgets` for the
 * strip — so adding a new industry never accidentally brings back
 * the old 6-tile shape.
 */
export const CANONICAL_KPI_STRIP_KEYS: ReadonlyArray<WidgetKey> = [
	"deals.pipelineValue",
	"deals.winRate",
	"tasks.dueToday",
	"leads.open",
];

/**
 * Resolve `CANONICAL_KPI_STRIP_KEYS` to render specs. Drops any key
 * whose `WidgetSpec` is missing (defensive — every key in the
 * canonical list ships a spec in this file). Returned in the
 * declared order.
 */
export function resolveCanonicalKpiStrip(): WidgetSpec[] {
	const specs: WidgetSpec[] = [];
	for (const k of CANONICAL_KPI_STRIP_KEYS) {
		const spec = WIDGET_REGISTRY[k];
		if (spec) specs.push(spec);
	}
	return specs;
}

/**
 * Stage 7 of /DASHBOARD-V2-PLAN.md (2026-05-29) — KPI tile keys that
 * the `<RevenueEstimateHero>` card already represents at the top of
 * the dashboard. When the hero is mounted, these four tiles are
 * dropped from the metric strip so the same number doesn't render
 * twice (once as a small tile, once inside the hero's footnote
 * breakdown). The filter runs in `resolveWidgets` so it applies to
 * BOTH render paths (legacy + layout-aware).
 */
const REVENUE_HERO_FOLDED_KPIS: ReadonlyArray<WidgetKey> = [
	"deals.open",
	"deals.pipelineValue",
	"deals.won",
	"deals.lost",
];

export interface ResolveWidgetsOptions {
	/**
	 * When true, drop the four deal-related KPI tiles
	 * (`deals.open`, `deals.pipelineValue`, `deals.won`, `deals.lost`)
	 * from the strip — the dashboard hero card is rendering them as
	 * one bold consolidated number above. When omitted/false the
	 * strip behaves as it always did (every KPI key in the array
	 * renders).
	 */
	dropRevenueHeroKpis?: boolean;
}

/**
 * Resolve the metric keys a template wants into widget specs. Drops
 * keys without a tile spec — section-size widgets (`reminders.list`,
 * `messages.recent`, …) are rendered as cards gated by `isEnabled(key)`
 * in `DashboardHomeView`. The one exception is `today.focus`: it has no
 * tile but its counts are FOLDED into the strip via `TODAY_FOCUS_KPIS`.
 * Results are de-duplicated by key (preserving first-seen order) so a
 * folded KPI never doubles one the template already lists.
 *
 * Stage 7 hero-fold (2026-05-29) — when `dropRevenueHeroKpis` is set,
 * the four deal tiles already represented in `<RevenueEstimateHero>`
 * are filtered out. The filter applies AFTER `today.focus` expansion so
 * a template that lists `today.focus` still gets `tasks.dueToday` +
 * `leads.open` while the deal pieces fold into the hero.
 */
export function resolveWidgets(
	metricKeys: string[] | undefined,
	options?: ResolveWidgetsOptions,
): WidgetSpec[] {
	const dropHero = options?.dropRevenueHeroKpis === true;
	const heroFolded = new Set<string>(dropHero ? REVENUE_HERO_FOLDED_KPIS : []);
	if (!metricKeys || metricKeys.length === 0) {
		// Sensible default for orgs without a dashboardMetrics array.
		const defaults: Array<WidgetSpec | undefined> = [
			WIDGET_REGISTRY["leads.open"],
			WIDGET_REGISTRY["contacts.active"],
			heroFolded.has("deals.open") ? undefined : WIDGET_REGISTRY["deals.open"],
			heroFolded.has("deals.pipelineValue")
				? undefined
				: WIDGET_REGISTRY["deals.pipelineValue"],
		];
		return defaults.filter((s): s is WidgetSpec => Boolean(s));
	}
	const specs: WidgetSpec[] = [];
	const seen = new Set<string>();
	const push = (k: WidgetKey) => {
		if (seen.has(k)) return;
		if (heroFolded.has(k)) return;
		const spec = WIDGET_REGISTRY[k];
		if (spec) {
			specs.push(spec);
			seen.add(k);
		}
	};
	for (const k of metricKeys) {
		if (k === "today.focus") {
			for (const fk of TODAY_FOCUS_KPIS) push(fk);
			continue;
		}
		push(k as WidgetKey);
	}
	return specs;
}
