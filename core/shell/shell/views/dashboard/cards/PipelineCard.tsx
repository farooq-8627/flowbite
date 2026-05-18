"use client";

/**
 * PipelineCard — dashboard card showing open pipeline value and win rate.
 *
 * STATUS: IMPLEMENTED.
 *
 * Two metric tiles + a win/loss bar:
 *   - Open value: formatted using the org's default currency. When there
 *     are 0 deals AND 0 value, we render `—` instead of the empty
 *     currency string. This dodges the locale-specific "US$0" rendering
 *     which looks wrong/confusing when there's literally nothing in the
 *     pipeline. (The currency code itself comes from
 *     `org.settings.defaultCurrency`, falling back to USD.)
 *   - Win rate: `won / (won + lost)` × 100. Shown as `0%` when no closed
 *     deals exist (with `0 won · 0 lost` underneath for clarity).
 *
 * The bar at the bottom is rendered only when at least one deal has been
 * closed — otherwise it's an empty grey bar that confuses users. This
 * matches the calculator-tile pattern used elsewhere in the app.
 *
 * Pure presentational — no Convex calls. Stats prop comes from the
 * parent's `getDashboardStats` query.
 */

import { TrendingUpIcon } from "lucide-react";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatCurrency } from "@/core/shell/shared/hooks/useOrgDefaultCurrency";

interface PipelineStats {
	dealCount: number;
	pipelineValue: number;
	dealsWon: number;
	dealsLost: number;
	currency: string;
}

interface PipelineCardProps {
	stats: PipelineStats;
	orgSlug: string;
}

export function PipelineCard({ stats, orgSlug }: PipelineCardProps) {
	const won = stats.dealsWon;
	const lost = stats.dealsLost;
	const closed = won + lost;
	const winRate = closed === 0 ? 0 : Math.round((won / closed) * 100);

	const pipelineDisplay =
		stats.dealCount === 0 && stats.pipelineValue === 0
			? "—"
			: formatCurrency(stats.pipelineValue, stats.currency);

	return (
		<Card className="flex h-full flex-col">
			<CardHeader className="flex flex-row items-center justify-between gap-2 pb-2">
				<div className="flex items-center gap-2">
					<TrendingUpIcon className="size-4 text-muted-foreground" aria-hidden />
					<CardTitle className="text-base">Pipeline</CardTitle>
				</div>
				<Link
					href={`/${orgSlug}/deals`}
					className="text-xs text-muted-foreground hover:text-foreground"
				>
					Open deals →
				</Link>
			</CardHeader>
			<CardContent className="flex flex-1 flex-col gap-3 pt-0">
				<div className="grid grid-cols-2 gap-2">
					<div className="flex flex-col gap-0.5 rounded-[var(--radius)] border bg-card/50 px-3 py-2">
						<span className="text-[10px] uppercase tracking-wide text-muted-foreground">
							Open value
						</span>
						<span className="text-lg font-bold tabular-nums">{pipelineDisplay}</span>
						<span className="text-[10px] text-muted-foreground">
							{stats.dealCount} active
						</span>
					</div>
					<div className="flex flex-col gap-0.5 rounded-[var(--radius)] border bg-card/50 px-3 py-2">
						<span className="text-[10px] uppercase tracking-wide text-muted-foreground">
							Win rate
						</span>
						<span className="text-lg font-bold tabular-nums">{winRate}%</span>
						<span className="text-[10px] text-muted-foreground">
							{won} won · {lost} lost
						</span>
					</div>
				</div>
				{closed > 0 && (
					<div
						className="flex h-1.5 overflow-hidden rounded-full bg-muted"
						role="img"
						aria-label={`Win/loss: ${won} won, ${lost} lost`}
					>
						<div
							className="bg-emerald-500"
							style={{ width: `${(won / closed) * 100}%` }}
						/>
						<div
							className="bg-rose-500"
							style={{ width: `${(lost / closed) * 100}%` }}
						/>
					</div>
				)}
			</CardContent>
		</Card>
	);
}
