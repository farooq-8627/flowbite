"use client";

/**
 * DashboardHomeView — first paint after sign-in / org switch.
 *
 * STATUS: IMPLEMENTED — Phase 3A registry-driven.
 *
 * Industry awareness comes from `org.settings.dashboardMetrics`, an
 * ORDERED list of metric keys set by the template seeder. This view:
 *
 *   - Resolves the metric keys into widget specs via `resolveWidgets`.
 *   - Renders the `<MetricStrip>` with those specs (replaces the old
 *     hard-coded 4-tile StatStrip).
 *   - Falls back to a sensible default (leads/contacts/deals/value)
 *     when an org has no `dashboardMetrics` set.
 *
 * The `<MockDataBanner>` shows when the org still has the seeded
 * sample records and hasn't dismissed the prompt.
 *
 * Below the strip, the layout-grid for cards (Reminders, Pipeline,
 * Messages, Activity, Calendar, Today's focus) is unchanged but each
 * cell is gated on `isEnabled(metricKey)` so industries can opt out of
 * sections (productivity hides Pipeline; sales-only hides Calendar).
 *
 * Stage 5 of /DASHBOARD-V2-PLAN.md (2026-05-29) — three-tier dashboard
 * layout resolution and AI dashboard surfaces:
 *   1. `user.preferences.dashboardLayoutOverride.layout` (per-user, scoped
 *      to active org) wins when set.
 *   2. `org.settings.dashboardLayout` (org default) is the fallback.
 *   3. Legacy fixed grid below.
 *
 * Plus: <AIPinnedRow> renders ephemeral AI-pinned cells above the
 * regular layout. <DashboardAnnotationChips> in AI Cockpit surfaces
 * unanchored anomaly chips. Reset to Org Default button shows when
 * the user has a per-user override.
 */

import { useMutation, useQuery } from "convex/react";
import { RotateCcw } from "lucide-react";
import { useMemo } from "react";
import { Button } from "@/components/ui/button";
import { FirstTimeTour, type TourStep } from "@/components/ui/first-time-tour";
import { api } from "@/convex/_generated/api";
import { resolveActivityRowLimit } from "@/convex/_shared/dashboardDensity";
import type { WidgetKey } from "@/convex/_shared/widgetRegistry";
import { AISuggestionsPanel } from "@/core/ai/components/AISuggestionsPanel";
import { sendChatPrefill } from "@/core/ai/lib/chatPrefill";
import { MessagesPreviewWidget } from "@/core/comms/messages/components/MessagesPreviewWidget";
import { MiniCalendarWidget } from "@/core/scheduling/calendar/widgets/MiniCalendarWidget";
import { WeekAheadWidget } from "@/core/scheduling/calendar/widgets/WeekAheadWidget";
import { useCurrentOrg, useMe } from "@/core/shell/shared/hooks/useCurrentOrg";
import {
	AICockpitSection,
	AIPinnedRow,
	AIPulseRibbon,
	AIQuickComposerCard,
	DailyBriefingCard,
	DashboardAnnotationChips,
	LiveTasksWidget,
	MetricStrip,
	MockDataBanner,
	RecentActivityWidget,
	RevenueEstimateHero,
	SalesPipelinePanel,
	WeeklyInsightCard,
} from "./cards";
import { resolveCanonicalKpiStrip } from "./cards/WidgetRegistry";
import { DashboardLayoutRenderer } from "./DashboardLayoutRenderer";

const DASHBOARD_TOUR_STEPS: TourStep[] = [
	{
		target: "quick-add",
		title: "Create from anywhere",
		body: "Press the + button in the top nav (or Cmd/Ctrl + K) to create leads, contacts, deals, and companies without leaving the page.",
		side: "bottom",
	},
];

/**
 * Stage 7 of /DASHBOARD-V2-PLAN.md (2026-05-29) — single source of
 * truth for the dashboard's "how many rows" caps. The user explicitly
 * asked for these to be configurable (2026-05-29: "Why they are not
 * updated to take specific no. of items instead of 10"). The values
 * still flow through:
 *
 *   - `getDashboardStats({ recentActivityLimit })` (clamped to [1, 50])
 *   - `<RecentActivityWidget limit>` (defensive slice)
 *   - `<MessagesPreviewWidget limit>` (passed to `useRecentMessages`)
 *
 * 2026-05-30 — promoted from a hardcoded constant to a per-user
 * appearance setting (`users.preferences.dashboardActivityRowLimit`).
 * `useMe()` is already loaded one line below for the layout-override
 * resolution — we reuse the same subscription so adding the setting
 * costs 0 extra Convex calls. Falls back to `6` (the historic default)
 * for users who haven't touched the slider in
 * Settings → Appearance → Dashboard density.
 *
 * Bounds + clamp live in `convex/_shared/dashboardDensity.ts` (SSOT
 * consumed by the server clamp + this read).
 */

interface DashboardHomeViewProps {
	orgSlug: string;
}

export function DashboardHomeView({ orgSlug }: DashboardHomeViewProps) {
	const user = useMe();
	const { fullOrgEntry: currentOrg } = useCurrentOrg();
	// 2026-05-30 — per-user dashboard density. Falls back to 6 (the
	// historic constant) when the slot is undefined. Resolved BEFORE
	// the `getDashboardStats` query so the server fetch already honours
	// the user's preferred row count (no over-fetch then re-slice).
	const activityRowLimit = resolveActivityRowLimit(user?.preferences?.dashboardActivityRowLimit);
	const stats = useQuery(
		api.orgs.queries.getDashboardStats,
		currentOrg
			? {
					orgId: currentOrg.org._id,
					recentActivityLimit: activityRowLimit,
				}
			: "skip",
	);

	const settings = currentOrg?.org.settings;
	const dashboardMetrics = settings?.dashboardMetrics as string[] | undefined;
	const orgDashboardLayout = settings?.dashboardLayout as unknown;
	// Stage 5 — per-user dashboard layout override resolution. The override
	// only applies when its `orgId` matches the active org so a stale
	// pointer from a previous workspace doesn't leak across switches.
	const myOverrideRaw = user?.preferences?.dashboardLayoutOverride;
	const myOverride =
		myOverrideRaw && currentOrg && myOverrideRaw.orgId === currentOrg.org._id
			? myOverrideRaw
			: undefined;
	// 3-tier resolution: per-user override → org default → legacy fixed grid.
	const dashboardLayout = myOverride?.layout ?? orgDashboardLayout;
	const clearOverride = useMutation(api.users.mutations.clearMyDashboardLayoutOverride);

	const widgets = useMemo(
		// 2026-05-30 — KPI strip locked to the canonical 4-card quartet
		// (Pipeline value · Win rate · Due today · Open leads) per the
		// dashboard refinement spec. Industries no longer drive the
		// strip — every workspace renders the same headline KPIs under
		// the revenue hero. `dashboardMetrics` is still honoured by
		// section-card gating elsewhere in this file (`isEnabled(key)`)
		// so templates can still opt out of cards like Week-ahead /
		// Calendar / Tasks; the strip itself is a fixed shelf now.
		() => resolveCanonicalKpiStrip(),
		[],
	);

	// Each widget key drives whether its companion card renders. The
	// strip itself uses the widget specs; the larger cards opt-in via
	// `isEnabled(key)`.
	const enabledMetrics = useMemo<Set<string> | null>(() => {
		if (!dashboardMetrics || dashboardMetrics.length === 0) return null;
		return new Set(dashboardMetrics);
	}, [dashboardMetrics]);
	const isEnabled = (key: string) => enabledMetrics === null || enabledMetrics.has(key);

	if (!currentOrg || !stats || user === undefined) {
		return null;
	}

	const orgId = currentOrg.org._id;

	// Stage 5 — pinned-cell render callback. Defined here so the same
	// renderWidget switch the canonical layout uses can dispatch
	// AI-pinned widgets identically (avoids divergence).
	const renderPinnedWidget = (key: WidgetKey): React.ReactNode => {
		switch (key) {
			case "tasks.list":
			case "tasks.dueToday":
				return <LiveTasksWidget orgId={orgId} orgSlug={orgSlug} />;
			case "messages.recent":
				return (
					<MessagesPreviewWidget
						orgId={orgId}
						orgSlug={orgSlug}
						limit={activityRowLimit}
						className="h-full"
					/>
				);
			case "activity.recent":
				return (
					<RecentActivityWidget
						activity={stats.recentActivity}
						orgSlug={orgSlug}
						limit={activityRowLimit}
						className="h-full"
					/>
				);
			case "calendar.weekAhead":
				return <WeekAheadWidget orgId={orgId} orgSlug={orgSlug} className="h-full" />;
			case "calendar.mini":
				return <MiniCalendarWidget orgSlug={orgSlug} className="h-full" />;
			case "pipeline.salesPanel":
				return <SalesPipelinePanel orgId={orgId} orgSlug={orgSlug} className="h-full" />;
			default:
				return null;
		}
	};

	return (
		<div className="h-full overflow-y-auto overflow-x-hidden py-4 md:p-6">
			{/*
			 * 2026-05-30 (mobile overflow fix) — `grid-cols-1` is load-bearing.
			 * Without an explicit column count, `display: grid` defaults to a
			 * single `auto` column that sizes to content's max-content width.
			 * On mobile, any descendant card with long content (pipeline
			 * switcher buttons, recent-activity descriptions, big currency
			 * numbers) inflates that `auto` column past the viewport, dragging
			 * every sibling card with it. `grid-cols-1` resolves to
			 * `repeat(1, minmax(0, 1fr))`, forcing the column to fill parent
			 * width AND shrink to 0 when content is too wide — which is what
			 * lets `truncate` and `overflow-hidden` inside the cards actually
			 * take effect.
			 */}
			<div className="grid grid-cols-1 gap-4 min-w-0">
				{/* Mock-data banner — renders on every refresh until the
				    user clears the sample data. The "X" close button is
				    wired to the same clearMockData mutation as the primary
				    CTA (locked 2026-05-30): closing the banner IS clearing
				    the data. There is no separate dismiss-without-clearing
				    flow any more. */}
				<MockDataBanner orgId={orgId} mockDataSeededAt={settings?.mockDataSeededAt} />

				{/* P1.14 — Proactive AI suggestions. Pure heuristic, no model call.
				    Hidden when there are zero suggestions (no panel = no noise).

				    Stage 3-A.5 — wrapped in AICockpitSection (renamed from
				    ProactiveWorkspaceSection in Stage 1 of DASHBOARD-V2-PLAN.md,
				    2026-05-28) so the AI cluster reads as one logical surface
				    ("AI Cockpit — your workspace, on autopilot") with a
				    per-user collapse toggle persisted in
				    `users.preferences.dashboardSectionsCollapsed.proactive`. */}
				<AICockpitSection>
					<AISuggestionsPanel orgId={orgId} scope="org" onTakeAction={sendChatPrefill} />

					{/* Stage 5 of DASHBOARD-V2-PLAN.md — unanchored anomaly chips +
					    AI-tool annotations surface here above the AI Pulse ribbon. */}
					<DashboardAnnotationChips orgId={orgId} widgetKey="" limit={5} />

					{/* Stage 5 — AI Pulse Ribbon. Top-3 highest-value suggestions,
					    dismissible per-user, rendered ABOVE the metric strip when
					    there is at least one undismissed suggestion. Stage 6 wired
					    the ribbon to read from the materialised aiNextActions
					    ranker (rebuilt reactively on every lead/deal/task change) with `convex.ai.suggestions.list`
					    as the warm-start fallback. Stage 3-A.4 added the
					    lazy-warm + 3-row skeleton for first-paint freshness. */}
					{isEnabled("ai.pulseRibbon") && (
						<AIPulseRibbon orgId={orgId} orgSlug={orgSlug} />
					)}

					{/* Stage 5 — AI Quick Composer. Pinned mini chat textarea so the
					    user can ask the AI without opening the side sheet first. */}
					{isEnabled("ai.quickComposer") && <AIQuickComposerCard />}

					{/* AI Morning Briefing — Sprint 5 daily + weekly cards.
					    Daily on the left (per-user), Weekly on the right (org-wide).
					    Both visible only when the template opted in via `ai.morningBriefing`.
					    Stage 1 of DASHBOARD-V2-PLAN.md (2026-05-28): `auto-rows-fr`
					    matches sibling card heights so the trimmed daily empty
					    state stays visually parallel with the weekly card next
					    to it. */}
					{isEnabled("ai.morningBriefing") && (
						<div className="grid grid-cols-1 gap-4 lg:grid-cols-2 lg:auto-rows-fr">
							<DailyBriefingCard orgId={orgId} orgSlug={orgSlug} />
							<WeeklyInsightCard orgId={orgId} />
						</div>
					)}
				</AICockpitSection>

				{/* Stage 5 of /DASHBOARD-V2-PLAN.md (2026-05-29) — AI-Pinned row
				    sits above the regular dashboard layout. Renders any
				    `ephemeralDashboardCells` rows the AI tool `render_widget`
				    has pinned for THIS user (24h TTL, per-user only). Silent
				    when there are no cells. */}
				<AIPinnedRow orgId={orgId} orgSlug={orgSlug} renderWidget={renderPinnedWidget} />

				{/* Stage 5 — "Reset to org default" control. Visible only when
				    the user has an active per-user layout override. Clears
				    the slot so the dashboard falls back to the org default. */}
				{myOverride && (
					<div className="flex items-center justify-end">
						<Button
							type="button"
							variant="ghost"
							size="sm"
							className="text-xs text-muted-foreground"
							onClick={() => {
								void clearOverride({ orgId });
							}}
						>
							<RotateCcw className="h-3.5 w-3.5 me-1.5" aria-hidden="true" />
							Reset to org default
						</Button>
					</div>
				)}

				{/* Stage 4 of /DASHBOARD-V2-PLAN.md (2026-05-29) — when the
				    template seeded an `org.settings.dashboardLayout` blob OR
				    the user has set a per-user override, the layout-aware
				    renderer takes over below the AI Cockpit:
				    hero (full-width) → KPI strip (from `layout.metrics` ?? `dashboardMetrics`) →
				    panel grid with per-widget `span: 1 | 2 | 3`. The legacy
				    fixed-grid path (Row 1 → Row 5) below STILL ships for
				    every workspace whose template hasn't opted into a
				    layout, preserving full backwards-compat. */}
				{dashboardLayout ? (
					<DashboardLayoutRenderer
						orgId={orgId}
						orgSlug={orgSlug}
						stats={stats}
						layout={dashboardLayout}
						fallbackMetricKeys={dashboardMetrics}
					/>
				) : (
					<>
						{/* Stage 7 of /DASHBOARD-V2-PLAN.md (2026-05-29) —
				    Single bold revenue estimate hero ABOVE the metric
				    strip. The hero shows the headline forecast number;
				    2026-05-30 the four deal-related KPI tiles
				    (Open Deals / Pipeline Value / Deals Won / Deals
				    Lost) were RESTORED in the strip below to give the
				    user the per-status breakdown at a glance — the
				    user explicitly asked for "at least 4 cards with
				    the numbers big". The hero handles its own empty
				    state (CTA to add a deal / set up a pipeline) so it
				    renders unconditionally. */}
						<RevenueEstimateHero orgId={orgId} orgSlug={orgSlug} />

						{/* Row 1 — Registry-driven 4-tile KPI strip. */}
						{widgets.length > 0 && (
							<MetricStrip stats={stats} widgets={widgets} orgSlug={orgSlug} />
						)}

						{/* Stage 7 (2026-05-29) — Sales Pipeline Panel
				    promoted to render BEFORE tasks for every org with
				    deal pipelines, regardless of whether the
				    template's `dashboardMetrics` array still carries
				    the legacy `pipeline.velocity` key (some workspaces
				    were seeded before the rename migration ran). The
				    panel handles its own empty state — it shows a
				    motivating "Set up your sales pipeline" CTA when
				    the org has zero deal pipelines, so rendering it
				    unconditionally never produces a blank card.

				    The previous gate
				    `isEnabled("pipeline.salesPanel")` was dropped:
				    "industry has pipelines → show the panel" is the
				    user's explicit ask (2026-05-29) and the panel's
				    self-empty-state subsumes the old binary visibility
				    decision. */}
						<SalesPipelinePanel orgId={orgId} orgSlug={orgSlug} />

						{/* Row 2 — Recent messages + Recent activity (50/50).

				    Stage 3 of /DASHBOARD-V2-PLAN.md (2026-05-29) —
				    <TimelineActivityWidget> swapped for
				    <RecentActivityWidget>, the Orbitly recent-sales-shape
				    card. Reads from the already-loaded
				    `stats.recentActivity` payload (no extra subscription)
				    and renders avatar + actor name + description +
				    timestamp per row. Members without
				    `activityLogs.viewOrg` still see this widget — the
				    payload comes through `getDashboardStats` which is open
				    to every member. */}
						<div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
							{isEnabled("messages.recent") && (
								<MessagesPreviewWidget
									orgId={orgId}
									orgSlug={orgSlug}
									limit={activityRowLimit}
									className="h-full"
								/>
							)}
							{isEnabled("activity.recent") && (
								<RecentActivityWidget
									activity={stats.recentActivity}
									orgSlug={orgSlug}
									limit={activityRowLimit}
									className="h-full"
								/>
							)}
						</div>

						{/* Row 3 — Week ahead (full-width compact strip).
				    2026-05-30 — `min-h` on each cell removed so the row
				    collapses to its natural height instead of stretching
				    to match an `auto-rows-fr` sibling. */}
						{isEnabled("calendar.weekAhead") && (
							<WeekAheadWidget orgId={orgId} orgSlug={orgSlug} />
						)}

						{/* Row 4 — Mini calendar (full-width). Today's focus was
				    folded into the metric strip (resolveWidgets expands
				    `today.focus` → KPI tiles), so the standalone card +
				    its dead 5-col gutter are gone. */}
						{isEnabled("calendar.mini") && (
							<MiniCalendarWidget orgSlug={orgSlug} className="h-full" />
						)}

						{/* Row 5 — Tasks (full-width, LAST row).
				    2026-05-30 — Tasks moved to the bottom per the user's
				    ask: "since we are showing tasks we need to make it to
				    take full width in seprate row… at last please".

				    `tasks.list` is the canonical section-card key (Stage 4D
				    of TASKS-RENAME-PLAN.md). The KPI-shaped `tasks.dueToday`
				    variant also gates the card so productivity templates
				    that lead with the KPI strip still render the panel
				    underneath.

				    Stage 3 of /DASHBOARD-V2-PLAN.md (2026-05-29) — the
				    legacy <TasksCard> 8-row capped list was replaced with
				    <LiveTasksWidget>, which embeds the same
				    <TasksDataTable> the /tasks page uses (compact mode,
				    capped at 10 rows, with an Open all → link). */}
						{(isEnabled("tasks.list") || isEnabled("tasks.dueToday")) && (
							<LiveTasksWidget orgId={orgId} orgSlug={orgSlug} />
						)}
					</>
				)}
			</div>
			<FirstTimeTour id="dashboard-v1" steps={DASHBOARD_TOUR_STEPS} />
		</div>
	);
}
