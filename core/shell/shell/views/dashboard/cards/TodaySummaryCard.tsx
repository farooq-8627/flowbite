"use client";

/**
 * TodaySummaryCard — "what to do next" card on the dashboard.
 *
 * STATUS: IMPLEMENTED.
 *
 * A compact list of the four most actionable counts:
 *   - Reminders due today (links → /tasks; underlying entity is the `tasks`
 *     table — the user-facing label "Reminders" is kept per the Stage 4D
 *     terminology carve-out)
 *   - Open leads to qualify (links → /leads)
 *   - Deals to advance (links → /deals)
 *   - Deals won all-time (links → /deals)
 *
 * Each row is a Link wrapping a tinted icon, the label, and the count.
 * Pure presentational — pulls from the parent's `getDashboardStats`
 * payload. No Convex calls.
 */

import { BriefcaseIcon, CheckCircle2Icon, FlameIcon, HourglassIcon } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface TodaySummaryStats {
	remindersDueToday: number;
	dealsWon: number;
	leadCount: number;
	dealCount: number;
}

interface TodaySummaryCardProps {
	stats: TodaySummaryStats;
	orgSlug: string;
}

interface SummaryRow {
	icon: ReactNode;
	label: string;
	value: number | string;
	href: string;
	accent: string;
}

export function TodaySummaryCard({ stats, orgSlug }: TodaySummaryCardProps) {
	const items: SummaryRow[] = [
		{
			icon: <HourglassIcon className="size-3.5" />,
			label: "Reminders due today",
			value: stats.remindersDueToday,
			href: `/${orgSlug}/tasks`,
			accent: "text-amber-600",
		},
		{
			icon: <FlameIcon className="size-3.5" />,
			label: "Open leads to qualify",
			value: stats.leadCount,
			href: `/${orgSlug}/leads`,
			accent: "text-rose-600",
		},
		{
			icon: <BriefcaseIcon className="size-3.5" />,
			label: "Deals to advance",
			value: stats.dealCount,
			href: `/${orgSlug}/deals`,
			accent: "text-emerald-600",
		},
		{
			icon: <CheckCircle2Icon className="size-3.5" />,
			label: "Deals won (all-time)",
			value: stats.dealsWon,
			href: `/${orgSlug}/deals`,
			accent: "text-emerald-600",
		},
	];
	return (
		<Card className="flex h-full flex-col">
			<CardHeader className="pb-2">
				<CardTitle className="text-base">Today's focus</CardTitle>
			</CardHeader>
			<CardContent className="flex-1 pt-0">
				<ul className="grid gap-1">
					{items.map((item) => (
						<li key={item.label}>
							<Link
								href={item.href}
								className="flex items-center justify-between gap-2 rounded-[var(--radius)] px-2 py-1.5 transition-colors hover:bg-accent/40"
							>
								<span className="flex items-center gap-2">
									<span
										className={`flex size-6 items-center justify-center rounded-[var(--radius)] bg-muted ${item.accent}`}
									>
										{item.icon}
									</span>
									<span className="text-sm">{item.label}</span>
								</span>
								<span className="font-mono text-sm font-semibold tabular-nums">
									{item.value}
								</span>
							</Link>
						</li>
					))}
				</ul>
			</CardContent>
		</Card>
	);
}
