"use client";

/**
 * DashboardHomeView — first paint after sign-in / org switch.
 *
 * STATUS: IMPLEMENTED.
 *
 * This view is intentionally THIN. It owns:
 *   - One Convex subscription (`getDashboardStats`)
 *   - The 12-column page layout grid
 *   - The first-time tour mount
 *
 * Every visual block lives in its own file under `./cards/`. Adding a
 * new card = adding a new file in `./cards/` + a new grid cell here.
 * Editing a card never touches this file.
 *
 * Layout (lg+ breakpoint, 12 cols)
 * ────────────────────────────────
 *   Row 1 — Stats strip (4 KPI cards)                    ┃ each = 3 cols
 *   Row 2 — Reminders (today + overdue) | Pipeline       ┃ 7 / 5
 *   Row 3 — Recent messages              | Recent activity ┃ 7 / 5
 *   Row 4 — Week ahead (7-day strip, full width)
 *   Row 5 — Mini calendar                | Today's focus   ┃ 7 / 5
 *
 * Below `lg` everything stacks. The "max 2 cards per row" rule is locked
 * in `core/shell/shell/MODULE.md` decision D1 — opening the AI panel
 * (~360px) only changes density inside cards, never their count.
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
import { PipelineCard, RemindersCard, StatStrip, TodaySummaryCard } from "./cards";

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

	// Industry-template-driven widget gating.
	//
	// Templates seed `org.settings.dashboardMetrics` with the keys that
	// matter for that vertical (e.g. "leads.open", "deals.pipelineValue",
	// "reminders.dueToday"). When the array exists, we render ONLY widgets
	// whose key is in the set; when it's absent or empty, we render all
	// widgets (back-compat path for orgs that pre-date the template
	// seeder). Each widget below uses `isEnabled(key)` to opt in.
	//
	// Schema note: `dashboardMetrics` is on the `platformTemplates`
	// validator today; the Phase 3A template-seeder extension will
	// propagate it onto `orgs.settings`. Until then, the cast below is a
	// no-op for orgs that haven't been seeded with the new shape.
	const enabledMetrics = useMemo<Set<string> | null>(() => {
		const settings = currentOrg?.org.settings as { dashboardMetrics?: string[] } | undefined;
		const list = settings?.dashboardMetrics;
		if (!list || list.length === 0) return null;
		return new Set(list);
	}, [currentOrg?.org.settings]);
	const isEnabled = (key: string) => enabledMetrics === null || enabledMetrics.has(key);

	if (!currentOrg || !stats || user === undefined) {
		return null;
	}

	const orgId = currentOrg.org._id;

	return (
		<div className="h-full overflow-y-auto p-4 md:p-6">
			<div className="grid gap-4">
				{/* Row 1 — KPI strip */}
				<StatStrip stats={stats} orgSlug={orgSlug} />

				{/* Row 2 — Reminders + Pipeline */}
				<div className="grid gap-4 lg:grid-cols-12">
					{isEnabled("reminders.dueToday") && (
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

				{/* Row 3 — Recent messages + Recent activity (equal-width, decoupled
				    from Row 2's wider/narrower split). Each card sizes itself
				    by its own content; their inner lists use the SAME `limit`
				    so the visual density matches across the row. */}
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
