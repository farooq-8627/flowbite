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
 */

import { useQuery } from "convex/react";
import { useMemo } from "react";
import { FirstTimeTour, type TourStep } from "@/components/ui/first-time-tour";
import { api } from "@/convex/_generated/api";
import { MessagesPreviewWidget } from "@/core/comms/messages/components/MessagesPreviewWidget";
import { TimelineActivityWidget } from "@/core/comms/timeline/widgets/TimelineActivityWidget";
import { MiniCalendarWidget } from "@/core/scheduling/calendar/widgets/MiniCalendarWidget";
import { WeekAheadWidget } from "@/core/scheduling/calendar/widgets/WeekAheadWidget";
import { useCurrentOrg, useMe } from "@/core/shell/shared/hooks/useCurrentOrg";
import { MetricStrip, MockDataBanner, PipelineCard, RemindersCard, TodaySummaryCard } from "./cards";
import { resolveWidgets } from "./cards/WidgetRegistry";

const DASHBOARD_TOUR_STEPS: TourStep[] = [
	{
		target: "quick-add",
		title: "Create from anywhere",
		body: "Press the + button in the top nav (or Cmd/Ctrl + K) to create leads, contacts, deals, and companies without leaving the page.",
		side: "bottom",
	},
];

interface DashboardHomeViewProps {
	orgSlug: string;
}

export function DashboardHomeView({ orgSlug }: DashboardHomeViewProps) {
	const user = useMe();
	const { fullOrgEntry: currentOrg } = useCurrentOrg();
	const stats = useQuery(
		api.orgs.queries.getDashboardStats,
		currentOrg ? { orgId: currentOrg.org._id } : "skip",
	);

	const settings = currentOrg?.org.settings;
	const dashboardMetrics = settings?.dashboardMetrics as string[] | undefined;

	const widgets = useMemo(() => resolveWidgets(dashboardMetrics), [dashboardMetrics]);

	// Each widget key drives whether its companion card renders. The
	// strip itself uses the widget specs; the larger cards opt-in via
	// `isEnabled(key)`.
	const enabledMetrics = useMemo<Set<string> | null>(() => {
		if (!dashboardMetrics || dashboardMetrics.length === 0) return null;
		return new Set(dashboardMetrics);
	}, [dashboardMetrics]);
	const isEnabled = (key: string) => enabledMetrics === null || enabledMetrics.has(key);

	const pipelineStats = useMemo(
		() =>
			stats
				? {
						dealCount: stats.dealCount,
						pipelineValue: stats.pipelineValue,
						dealsWon: stats.dealsWon,
						dealsLost: stats.dealsLost,
						currency: stats.currency,
					}
				: null,
		[stats],
	);

	if (!currentOrg || !stats || user === undefined) {
		return null;
	}

	const orgId = currentOrg.org._id;

	return (
		<div className="h-full overflow-y-auto p-4 md:p-6">
			<div className="grid gap-4">
				{/* Mock-data banner — only renders when seeded + not dismissed. */}
				<MockDataBanner
					orgId={orgId}
					mockDataSeededAt={settings?.mockDataSeededAt}
					mockDataDismissedAt={settings?.mockDataDismissedAt}
				/>

				{/* Row 1 — Registry-driven metric strip */}
				<MetricStrip stats={stats} widgets={widgets} orgSlug={orgSlug} />

				{/* Row 2 — Reminders + Pipeline */}
				<div className="grid gap-4 lg:grid-cols-12">
					{(isEnabled("reminders.dueToday") || isEnabled("tasks.dueToday")) && (
						<div className="lg:col-span-7">
							<RemindersCard orgId={orgId} orgSlug={orgSlug} />
						</div>
					)}
					{isEnabled("deals.pipelineValue") && pipelineStats && (
						<div className="lg:col-span-5">
							<PipelineCard stats={pipelineStats} orgSlug={orgSlug} />
						</div>
					)}
				</div>

				{/* Row 3 — Recent messages + Recent activity */}
				<div className="grid gap-4 lg:grid-cols-12">
					{isEnabled("messages.recent") && (
						<div className="lg:col-span-6">
							<MessagesPreviewWidget
								orgId={orgId}
								orgSlug={orgSlug}
								limit={8}
								className="h-full"
							/>
						</div>
					)}
					{isEnabled("activity.recent") && (
						<div className="lg:col-span-6">
							<TimelineActivityWidget orgSlug={orgSlug} limit={6} />
						</div>
					)}
				</div>

				{/* Row 4 — Week ahead (full-width compact strip) */}
				{isEnabled("calendar.weekAhead") && (
					<WeekAheadWidget orgId={orgId} orgSlug={orgSlug} />
				)}

				{/* Row 5 — Mini calendar + Today's focus */}
				<div className="grid gap-4 lg:grid-cols-12">
					{isEnabled("calendar.mini") && (
						<div className="lg:col-span-7">
							<MiniCalendarWidget orgSlug={orgSlug} className="h-full" />
						</div>
					)}
					{isEnabled("today.focus") && (
						<div className="lg:col-span-5">
							<TodaySummaryCard
								stats={{
									remindersDueToday: stats.remindersDueToday,
									dealsWon: stats.dealsWon,
									leadCount: stats.leadCount,
									dealCount: stats.dealCount,
								}}
								orgSlug={orgSlug}
							/>
						</div>
					)}
				</div>
			</div>
			<FirstTimeTour id="dashboard-v1" steps={DASHBOARD_TOUR_STEPS} />
		</div>
	);
}
