"use client";

/**
 * core/shell/shell/views/dashboard/cards/ARRCohortWidget.tsx
 *
 * Stage 4 of /DASHBOARD-V2-PLAN.md (2026-05-29) — B2B SaaS template
 * widget that buckets won deals into the trailing 6 calendar-month
 * cohorts and renders a vertical bar chart with totals + per-cohort
 * count + per-cohort summed deal value (proxy for ARR / ACV when the
 * template configures `value` to track those).
 *
 * Backed by `convex/crm/entities/deals/industryAnalytics:getArrCohort`.
 *
 * Design: pure-SVG bar chart (no recharts dependency — same posture
 * as the `<Sparkline>` primitive shipped in Stage 2). Each bar is a
 * coloured rectangle whose height scales relative to the largest
 * cohort; the month label sits below the X-axis and the total badge
 * sits at the top of each bar.
 */

import { useQuery } from "convex/react";
import { AreaChartIcon, ArrowRightIcon } from "lucide-react";
import Link from "next/link";
import { useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { sendChatPrefill } from "@/core/ai/lib/chatPrefill";
import { useEntityLabels } from "@/core/shell/shared/hooks/useEntityLabels";
import { formatCurrency } from "@/core/shell/shared/hooks/useOrgDefaultCurrency";
import { cn } from "@/lib/utils";

interface ARRCohortWidgetProps {
	orgId: Id<"orgs">;
	orgSlug: string;
	className?: string;
}

const CHART_HEIGHT = 120;
const CHART_PAD_TOP = 16;
const CHART_PAD_BOTTOM = 28;
const BAR_GAP = 6;

export function ARRCohortWidget({ orgId, orgSlug, className }: ARRCohortWidgetProps) {
	const data = useQuery(api.crm.entities.deals.industryAnalytics.getArrCohort, { orgId });
	const labels = useEntityLabels();

	const peakValue = useMemo(() => {
		if (!data) return 0;
		return data.buckets.reduce((m, b) => Math.max(m, b.value), 0);
	}, [data]);

	if (data === undefined) {
		return (
			<Card className={cn("flex h-full flex-col", className)}>
				<CardHeader className="pb-2">
					<CardTitle className="text-base">Won-deal cohorts</CardTitle>
				</CardHeader>
				<CardContent className="flex-1 pt-0">
					<Skeleton className="h-32 w-full" />
				</CardContent>
			</Card>
		);
	}

	const isEmpty = data.totals.count === 0;

	return (
		<Card className={cn("flex h-full flex-col", className)}>
			<CardHeader className="flex flex-row items-center justify-between gap-2 pb-2">
				<div className="flex items-center gap-2">
					<AreaChartIcon className="size-4 text-muted-foreground" aria-hidden />
					<div>
						<CardTitle className="text-base">Won-deal cohorts</CardTitle>
						<CardDescription className="text-xs">
							Last 6 months of wins, bucketed by close month.
						</CardDescription>
					</div>
				</div>
				{!isEmpty && (
					<Button
						asChild
						size="sm"
						variant="ghost"
						className="h-7 gap-1 px-2 text-xs text-muted-foreground hover:text-foreground"
					>
						<Link
							href={`/${orgSlug}/${labels.deal.slug}?stage=won`}
							aria-label={`Open all won ${labels.deal.plural.toLowerCase()}`}
						>
							Open won
							<ArrowRightIcon className="size-3" aria-hidden />
						</Link>
					</Button>
				)}
			</CardHeader>
			<CardContent className="flex-1 pt-0">
				{isEmpty ? (
					<div className="flex h-full flex-col items-center justify-center gap-2 rounded-[var(--radius)] border border-dashed bg-muted/30 px-4 py-6 text-center">
						<AreaChartIcon className="size-6 text-muted-foreground" aria-hidden />
						<p className="text-sm font-medium text-foreground">No won deals yet</p>
						<p className="text-xs text-muted-foreground">
							Once a {labels.deal.singular.toLowerCase()} closes Won, it'll show up in
							the cohort chart.
						</p>
						<Button
							size="sm"
							variant="outline"
							className="mt-1 h-7 text-xs"
							onClick={() =>
								sendChatPrefill(
									`Show me ${labels.deal.plural.toLowerCase()} most likely to close-won this quarter.`,
								)
							}
						>
							Ask AI to spot likely wins
						</Button>
					</div>
				) : (
					<div className="space-y-3">
						<div className="flex items-baseline justify-between gap-2">
							<div>
								<p className="text-xs text-muted-foreground">Last 6 months won</p>
								<p className="text-xl font-semibold tabular-nums">
									{formatCurrency(data.totals.value, data.currency)}
								</p>
							</div>
							<p className="text-xs text-muted-foreground tabular-nums">
								{data.totals.count} {data.totals.count === 1 ? "deal" : "deals"}
							</p>
						</div>
						<CohortChart
							buckets={data.buckets}
							currency={data.currency}
							peakValue={peakValue}
						/>
					</div>
				)}
			</CardContent>
		</Card>
	);
}

interface CohortChartProps {
	buckets: ReadonlyArray<{ month: string; t: number; count: number; value: number }>;
	currency: string;
	peakValue: number;
}

function CohortChart({ buckets, currency, peakValue }: CohortChartProps) {
	const innerHeight = CHART_HEIGHT - CHART_PAD_TOP - CHART_PAD_BOTTOM;
	return (
		<div className="w-full">
			<svg
				role="img"
				aria-label="Won deals — last 6 months"
				viewBox={`0 0 100 ${CHART_HEIGHT}`}
				preserveAspectRatio="none"
				className="block h-32 w-full"
			>
				{buckets.map((b, i) => {
					const slotW = 100 / buckets.length;
					const barW = slotW - BAR_GAP;
					const x = i * slotW + BAR_GAP / 2;
					const h = peakValue === 0 ? 0 : (b.value / peakValue) * innerHeight;
					const y = CHART_PAD_TOP + (innerHeight - h);
					const labelY = CHART_HEIGHT - 14;
					return (
						<g key={b.month}>
							{h > 0 ? (
								<rect
									x={x}
									y={y}
									width={barW}
									height={h}
									rx={1.5}
									className="fill-primary/80"
								/>
							) : null}
							{/* baseline tick */}
							<rect
								x={x}
								y={CHART_HEIGHT - CHART_PAD_BOTTOM}
								width={barW}
								height={1}
								className="fill-border"
							/>
							{/* month label */}
							<text
								x={x + barW / 2}
								y={labelY}
								textAnchor="middle"
								className="fill-muted-foreground text-[6px]"
							>
								{shortMonth(b.t)}
							</text>
							{/* total badge */}
							{b.value > 0 ? (
								<text
									x={x + barW / 2}
									y={Math.max(CHART_PAD_TOP, y - 2)}
									textAnchor="middle"
									className="fill-foreground text-[5px] font-medium"
								>
									{shortCurrency(b.value, currency)}
								</text>
							) : null}
						</g>
					);
				})}
			</svg>
			<ul className="mt-2 grid grid-cols-3 gap-1 text-[10px] tabular-nums text-muted-foreground sm:grid-cols-6">
				{buckets.map((b) => (
					<li key={b.month} className="rounded-[var(--radius)] bg-muted/30 px-1.5 py-1">
						<span className="block text-foreground">{shortMonth(b.t)}</span>
						<span className="block">
							{b.count} · {shortCurrency(b.value, currency)}
						</span>
					</li>
				))}
			</ul>
		</div>
	);
}

function shortMonth(t: number): string {
	const d = new Date(t);
	return d.toLocaleString("en-US", { month: "short", timeZone: "UTC" });
}

function shortCurrency(value: number, currency: string): string {
	if (value === 0) return formatCurrency(0, currency);
	if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
	if (value >= 1_000) return `${Math.round(value / 1_000)}k`;
	return formatCurrency(value, currency);
}
