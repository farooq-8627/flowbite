"use client";

/**
 * core/shell/shell/views/dashboard/DashboardLayoutRenderer.tsx
 *
 * Stage 4 of /DASHBOARD-V2-PLAN.md (2026-05-29) — layout-aware
 * dashboard renderer. Mounts ONLY when `org.settings.dashboardLayout`
 * is present; the default `<DashboardHomeView>` flow keeps shipping
 * the legacy `dashboardMetrics`-driven path when this slot is unset.
 *
 * Why a separate file: the layout-driven path has a different
 * top-down shape (hero → metric strip → panel grid) AND a different
 * widget→component dispatch map. Co-locating with `DashboardHomeView`
 * doubled the file size + made both paths harder to reason about.
 *
 * Widget dispatch — the renderer maps every `WidgetKey` declared in
 * `convex/_shared/widgetRegistry.ts` to a render-callback. Unknown
 * widgets render a small "Unsupported widget" placeholder so a
 * misconfigured layout never produces a blank cell — visible failure
 * is better than silent failure here.
 *
 * The renderer pre-validates the layout via
 * `validateDashboardLayoutShape` and silently falls back to the
 * default path when validation fails. The shape is also validated at
 * write time (template seeder + schema validator) so this should
 * never trip in practice — defence-in-depth.
 *
 * 2026-05-30 — fixed-slot layout for the four high-traffic widgets
 * regardless of what the template's `panels` array declares:
 *   1. KPI strip — full set (deal KPIs no longer dropped; they sit
 *      alongside the revenue hero so the user sees four bold cards).
 *   2. Messages preview + Recent activity — always 50/50 side-by-side
 *      (mirrors the legacy fallback path's "as before" shape).
 *   3. Week ahead — its OWN row, outside `auto-rows-fr` so the cells
 *      collapse to their natural height instead of stretching to
 *      match a tall sibling.
 *   4. Tasks list — always the LAST row, full-width.
 *
 * Any of these widgets that ALSO appear in `layout.panels` are
 * filtered out of the regular 3-col panel grid so a workspace never
 * sees a duplicate Tasks / Activity / Messages / Week-ahead card.
 */

import type { ReactNode } from "react";
import type { Id } from "@/convex/_generated/dataModel";
import { validateDashboardLayoutShape, type WidgetKey } from "@/convex/_shared/widgetRegistry";
import { MessagesPreviewWidget } from "@/core/comms/messages/components/MessagesPreviewWidget";
import { MiniCalendarWidget } from "@/core/scheduling/calendar/widgets/MiniCalendarWidget";
import { WeekAheadWidget } from "@/core/scheduling/calendar/widgets/WeekAheadWidget";
import { cn } from "@/lib/utils";
import {
	AIQuickComposerCard,
	ARRCohortWidget,
	DailyBriefingCard,
	InvoiceAgingWidget,
	LiveTasksWidget,
	MetricStrip,
	PropertyFunnelWidget,
	RecentActivityWidget,
	RevenueEstimateHero,
	SalesPipelinePanel,
	WeeklyInsightCard,
} from "./cards";
import { resolveCanonicalKpiStrip } from "./cards/WidgetRegistry";
import type { DashboardStats } from "./types";

interface DashboardLayoutRendererProps {
	orgId: Id<"orgs">;
	orgSlug: string;
	stats: DashboardStats;
	layout: unknown;
	/** Fallback metric keys (used when the layout omits a `metrics` block). */
	fallbackMetricKeys: string[] | undefined;
}

/**
 * Widgets that always render in dedicated slots (messages+activity row,
 * week-ahead row, tasks row) regardless of what the template's
 * `layout.panels` array declares. They're filtered out of the normal
 * 3-col panel grid so a layout that lists them in panels doesn't
 * produce a duplicate card.
 */
const FIXED_SLOT_WIDGETS: ReadonlySet<WidgetKey> = new Set<WidgetKey>([
	"messages.recent",
	"activity.recent",
	"calendar.weekAhead",
	"tasks.list",
	"tasks.dueToday",
]);

export function DashboardLayoutRenderer({
	orgId,
	orgSlug,
	stats,
	layout,
	fallbackMetricKeys,
}: DashboardLayoutRendererProps) {
	const validation = validateDashboardLayoutShape(layout);
	if (!validation.valid) {
		// Defensive — schema + template seeder both validate up-front, so
		// this shouldn't happen at runtime. Log + render nothing so the
		// caller can fall back to the default flow.
		if (typeof console !== "undefined" && process.env.NODE_ENV !== "production") {
			console.warn("[DashboardLayoutRenderer] invalid layout, falling back", {
				errors: validation.errors,
			});
		}
		return null;
	}

	const { layout: typedLayout } = validation;

	// 2026-05-30 — KPI strip is locked to the canonical 4-card quartet
	// (Pipeline value · Win rate · Due today · Open leads) for every
	// industry. Template-declared `metrics` arrays are no longer
	// honoured for the strip; section cards still respect template
	// gating. Today's-focus panels (retired as a card 2026-05-29)
	// fall through to a `null` render in `renderWidget` and produce no
	// cell in the regular panel grid.
	const widgets = resolveCanonicalKpiStrip();
	void fallbackMetricKeys;
	void typedLayout.metrics;

	const hero = typedLayout.hero
		? renderWidget(typedLayout.hero, { orgId, orgSlug, stats })
		: null;

	// Fixed-slot panels — extracted from the template's panels array so
	// the user sees them in the canonical positions (50/50 row,
	// own-row week-ahead, full-width tasks) instead of wherever the
	// template happened to place them.
	const regularPanels = typedLayout.panels.filter((p) => !FIXED_SLOT_WIDGETS.has(p.widget));

	return (
		<div className="grid grid-cols-1 gap-4 min-w-0">
			{/* Stage 7 (2026-05-29) — Revenue hero card always sits at
			    the top of the layout-aware path, above any
			    template-declared hero widget. */}
			<RevenueEstimateHero orgId={orgId} orgSlug={orgSlug} />

			{/* KPI strip — 4-tile shelf with bold numbers. */}
			{widgets.length > 0 ? (
				<MetricStrip stats={stats} widgets={widgets} orgSlug={orgSlug} />
			) : null}

			{/* Template hero (e.g. b2b-saas leads with Sales Pipeline Panel). */}
			{hero ? <div className="w-full min-w-0">{hero}</div> : null}

			{/* Regular panels grid — every template panel that isn't a
			    fixed-slot widget (Tasks / Messages / Activity / Week-ahead). */}
			{regularPanels.length > 0 ? (
				<div className="grid grid-cols-1 gap-4 lg:grid-cols-3 lg:auto-rows-fr">
					{regularPanels.map((p) => {
						const node = renderWidget(p.widget, { orgId, orgSlug, stats });
						if (!node) return null;
						// 2026-05-30 — `deals.arrCohort` (Won-deal cohorts)
						// is always rendered full-width because its 6-month
						// bar chart benefits from the wider canvas; existing
						// orgs whose `org.settings.dashboardLayout` was
						// seeded with `span: 2` are auto-promoted to `span: 3`
						// here without needing a backfill migration.
						const effectiveSpan: 1 | 2 | 3 =
							p.widget === "deals.arrCohort" ? 3 : p.span;
						return (
							<div
								key={p.id}
								className={cn(
									"min-w-0",
									effectiveSpan === 1 && "lg:col-span-1",
									effectiveSpan === 2 && "lg:col-span-2",
									effectiveSpan === 3 && "lg:col-span-3",
								)}
							>
								{node}
							</div>
						);
					})}
				</div>
			) : null}

			{/* Recent messages + Recent activity — always 50/50 side-by-side. */}
			<div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
				<MessagesPreviewWidget
					orgId={orgId}
					orgSlug={orgSlug}
					limit={10}
					className="h-full"
				/>
				<RecentActivityWidget
					activity={stats.recentActivity}
					orgSlug={orgSlug}
					limit={12}
					className="h-full"
				/>
			</div>

			{/* Week ahead — own row, OUTSIDE `auto-rows-fr` so its cells
			    collapse to their natural height instead of stretching. */}
			<WeekAheadWidget orgId={orgId} orgSlug={orgSlug} />

			{/* Tasks — always the LAST row, full-width. */}
			<LiveTasksWidget orgId={orgId} orgSlug={orgSlug} />
		</div>
	);
}

interface WidgetRenderArgs {
	orgId: Id<"orgs">;
	orgSlug: string;
	stats: DashboardStats;
}

/**
 * Map a widget key to its frontend node. Returns `null` for keys that
 * don't have a panel-shaped UI surface (KPI-only keys belong in the
 * metric strip via `resolveWidgets`).
 */
function renderWidget(key: WidgetKey, args: WidgetRenderArgs): ReactNode {
	switch (key) {
		case "tasks.list":
		case "tasks.dueToday":
			return <LiveTasksWidget orgId={args.orgId} orgSlug={args.orgSlug} />;
		case "messages.recent":
			return (
				<MessagesPreviewWidget
					orgId={args.orgId}
					orgSlug={args.orgSlug}
					limit={10}
					className="h-full"
				/>
			);
		case "activity.recent":
			return (
				<RecentActivityWidget
					activity={args.stats.recentActivity}
					orgSlug={args.orgSlug}
					limit={12}
					className="h-full"
				/>
			);
		case "calendar.weekAhead":
			return <WeekAheadWidget orgId={args.orgId} orgSlug={args.orgSlug} className="h-full" />;
		case "calendar.mini":
			return <MiniCalendarWidget orgSlug={args.orgSlug} className="h-full" />;
		case "pipeline.salesPanel":
			return (
				<SalesPipelinePanel orgId={args.orgId} orgSlug={args.orgSlug} className="h-full" />
			);
		case "invoices.aging":
			return (
				<InvoiceAgingWidget orgId={args.orgId} orgSlug={args.orgSlug} className="h-full" />
			);
		case "properties.funnel":
			return (
				<PropertyFunnelWidget
					orgId={args.orgId}
					orgSlug={args.orgSlug}
					className="h-full"
				/>
			);
		case "deals.arrCohort":
			return <ARRCohortWidget orgId={args.orgId} orgSlug={args.orgSlug} className="h-full" />;
		case "ai.morningBriefing":
			return (
				<div className="grid grid-cols-1 gap-4 lg:grid-cols-2 lg:auto-rows-fr">
					<DailyBriefingCard orgId={args.orgId} orgSlug={args.orgSlug} />
					<WeeklyInsightCard orgId={args.orgId} />
				</div>
			);
		case "ai.quickComposer":
			return <AIQuickComposerCard />;
		default:
			// KPI-only keys + placeholders fall through; they belong in
			// the strip, not the panel grid.
			return null;
	}
}
