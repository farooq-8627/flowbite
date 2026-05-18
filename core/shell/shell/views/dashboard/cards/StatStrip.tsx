"use client";

/**
 * StatStrip — top row of 4 KPI tiles on the dashboard.
 *
 * STATUS: IMPLEMENTED.
 *
 * Pure layout component. Reads the already-fetched `stats` payload from
 * the parent (`DashboardHomeView`) — never calls `useQuery` itself. This
 * keeps the dashboard's data flow flat: ONE `getDashboardStats`
 * subscription at the top of the view, props down to every card.
 */

import { BriefcaseIcon, DollarSignIcon, UsersIcon } from "lucide-react";
import { formatCurrency } from "@/core/shell/shared/hooks/useOrgDefaultCurrency";
import type { DashboardStats } from "../types";
import { StatTile } from "./StatTile";

interface StatStripProps {
	stats: DashboardStats;
	orgSlug: string;
}

export function StatStrip({ stats, orgSlug }: StatStripProps) {
	const pipelineDisplay =
		stats.dealCount === 0 && stats.pipelineValue === 0
			? "—"
			: formatCurrency(stats.pipelineValue, stats.currency);

	return (
		<div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
			<StatTile
				label="Open leads"
				value={stats.leadCount}
				icon={<UsersIcon className="size-3.5" />}
				accent="text-amber-600"
				href={`/${orgSlug}/leads`}
			/>
			<StatTile
				label="Contacts"
				value={stats.contactCount}
				icon={<UsersIcon className="size-3.5" />}
				accent="text-blue-600"
				href={`/${orgSlug}/contacts`}
			/>
			<StatTile
				label="Open deals"
				value={stats.dealCount}
				icon={<BriefcaseIcon className="size-3.5" />}
				accent="text-emerald-600"
				href={`/${orgSlug}/deals`}
			/>
			<StatTile
				label="Pipeline value"
				value={pipelineDisplay}
				icon={<DollarSignIcon className="size-3.5" />}
				accent="text-foreground"
			/>
		</div>
	);
}
