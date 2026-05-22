"use client";

/**
 * MetricStrip — top row of registry-driven KPI tiles on the dashboard.
 *
 * STATUS: IMPLEMENTED — Phase 3A.
 *
 * Replaces StatStrip. Reads `org.settings.dashboardMetrics` (set by the
 * template seeder) and renders one tile per metric key in the order the
 * template specified. Each tile pulls its value from the parent's
 * `stats` payload via the registry's getter — no per-tile useQuery.
 *
 * Layout: 2 cols on mobile, up to 4 cols on lg+ (tiles wrap when more
 * than 4 widgets are configured).
 */

import { StatTile } from "./StatTile";
import type { WidgetSpec } from "./WidgetRegistry";
import type { DashboardStats } from "../types";

interface MetricStripProps {
	stats: DashboardStats;
	widgets: WidgetSpec[];
	orgSlug: string;
}

export function MetricStrip({ stats, widgets, orgSlug }: MetricStripProps) {
	if (widgets.length === 0) return null;
	return (
		<div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
			{widgets.map((w) => {
				const value = w.placeholder ? "Soon" : w.get(stats);
				return (
					<StatTile
						key={w.key}
						label={w.label}
						value={value}
						icon={w.icon}
						accent={w.accent ?? "text-foreground"}
						href={w.href ? w.href(orgSlug) : undefined}
					/>
				);
			})}
		</div>
	);
}
