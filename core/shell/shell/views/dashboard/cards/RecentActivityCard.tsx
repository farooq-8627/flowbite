"use client";

/**
 * RecentActivityCard — dashboard card showing the last 10 org-wide
 * activity events.
 *
 * STATUS: IMPLEMENTED.
 *
 * Reads its data from the parent's `getDashboardStats.recentActivity`
 * field — never calls `useQuery` itself. Each row shows the action's
 * description (or its raw action key as a fallback) plus a tabular
 * timestamp. The list intentionally uses `<ul><li>` with a thin
 * `divide-y` separator so the row height stays compact even when the
 * description wraps.
 *
 * Empty state surfaces a Zap icon + "No activity yet." — this is the
 * same pattern used on the timeline page so users feel oriented.
 */

import { format } from "date-fns";
import { Clock, Zap } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { ActivityItem } from "../types";

interface RecentActivityCardProps {
	activity: ActivityItem[];
}

export function RecentActivityCard({ activity }: RecentActivityCardProps) {
	return (
		<Card className="flex h-full flex-col">
			<CardHeader className="flex flex-row items-center justify-between gap-2 pb-2">
				<CardTitle className="text-base">Recent activity</CardTitle>
			</CardHeader>
			<CardContent className="flex-1 pt-0">
				{activity.length === 0 ? (
					<div className="flex flex-col items-center gap-2 py-6 text-center text-muted-foreground">
						<Zap className="size-6 opacity-30" />
						<p className="text-xs">No activity yet.</p>
					</div>
				) : (
					<ul className="divide-y">
						{activity.map((item) => (
							<li
								key={item._id}
								className="flex items-center justify-between gap-3 py-1.5"
							>
								<div className="flex items-center gap-2 min-w-0">
									<Clock className="size-3 shrink-0 text-muted-foreground" />
									<span className="truncate text-xs">
										{item.description ?? item.action}
									</span>
								</div>
								<span className="shrink-0 text-[10px] tabular-nums text-muted-foreground">
									{format(item.createdAt, "MMM d, h:mm a")}
								</span>
							</li>
						))}
					</ul>
				)}
			</CardContent>
		</Card>
	);
}
