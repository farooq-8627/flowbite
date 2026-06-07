"use client";

/**
 * core/shell/shell/views/dashboard/cards/ARRCohortWidget.tsx
 *
 * Stage 4 of /DASHBOARD-V2-PLAN.md (2026-05-29) — B2B SaaS template
 * widget that buckets won deals into the trailing 6 calendar-month
 * cohorts and visualises them two ways inside a single card:
 *
 *   - **Bars** (default) — vertical HTML/CSS bar chart, one bar per
 *     cohort month, height scaled to the largest cohort.
 *   - **Trend** — smooth area line of monthly-won value across the
 *     same 6 cohorts, powered by `<Sparkline>` (`components/ui/sparkline.tsx`).
 *
 * Backed by `convex/crm/entities/deals/industryAnalytics:getArrCohort`.
 *
 * Why HTML/CSS bars instead of pure SVG (2026-05-30 fix):
 *   The previous implementation rendered the bars + month labels +
 *   value badges inside an SVG with `viewBox="0 0 100 120"` and
 *   `preserveAspectRatio="none"`. The dashboard layout pins this
 *   widget to `lg:col-span-3` (full width), so the SVG was stretched
 *   ~15× horizontally on desktop — bars became 250 px slabs and text
 *   got smeared into illegible distortion (see
 *   /Users/.../won.png). HTML flex bars cap at `max-w-12`, text stays
 *   at native size, and the layout still adapts to mobile via
 *   `flex-1` cells. Lines stretch fine horizontally, so the Trend
 *   tab can keep using the SVG-based `<Sparkline>` primitive.
 *
 * Per-month detail grid stays beneath the tabs (Tailwind `grid` of
 * Dec / Jan / Feb / Mar / Apr / May tiles) — it's just as useful
 * regardless of which visualisation the user picks.
 */

import { useQuery } from "convex/react";
import { AreaChartIcon, ArrowRightIcon, BarChart3Icon, LineChartIcon } from "lucide-react";
import Link from "next/link";
import { useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Sparkline } from "@/components/ui/sparkline";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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

export function ARRCohortWidget({ orgId, orgSlug, className }: ARRCohortWidgetProps) {
	const data = useQuery(api.crm.entities.deals.industryAnalytics.getArrCohort, { orgId });
	const labels = useEntityLabels();

	const peakValue = useMemo(() => {
		if (!data) return 0;
		return data.buckets.reduce((m, b) => Math.max(m, b.value), 0);
	}, [data]);

	if (data === undefined) {
		return (
			<Card className={cn("flex h-full flex-col min-w-0 overflow-hidden", className)}>
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
		<Card className={cn("flex h-full flex-col min-w-0 overflow-hidden", className)}>
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
						<Tabs defaultValue="bars" className="gap-3">
							<TabsList>
								<TabsTrigger value="bars" className="gap-1.5">
									<BarChart3Icon className="size-3.5" aria-hidden />
									Bars
								</TabsTrigger>
								<TabsTrigger value="trend" className="gap-1.5">
									<LineChartIcon className="size-3.5" aria-hidden />
									Trend
								</TabsTrigger>
							</TabsList>
							<TabsContent value="bars">
								<CohortBars
									buckets={data.buckets}
									currency={data.currency}
									peakValue={peakValue}
								/>
							</TabsContent>
							<TabsContent value="trend">
								<CohortTrend
									buckets={data.buckets}
									currency={data.currency}
									peakValue={peakValue}
								/>
							</TabsContent>
						</Tabs>
						<ul className="grid grid-cols-3 gap-1 text-[10px] tabular-nums text-muted-foreground sm:grid-cols-6">
							{data.buckets.map((b) => (
								<li
									key={b.month}
									className="rounded-[var(--radius)] bg-muted/30 px-1.5 py-1"
								>
									<span className="block text-foreground">{shortMonth(b.t)}</span>
									<span className="block">
										{b.count} · {shortCurrency(b.value, data.currency)}
									</span>
								</li>
							))}
						</ul>
					</div>
				)}
			</CardContent>
		</Card>
	);
}

interface CohortViewProps {
	buckets: ReadonlyArray<{ month: string; t: number; count: number; value: number }>;
	currency: string;
	peakValue: number;
}

/**
 * HTML/CSS bar chart. Each cohort gets a flexbox cell (`flex-1`); the
 * bar inside is capped at `max-w-12` so it stays a sensible width on
 * wide containers (vs the prior SVG approach which scaled bar width
 * with container width and produced 250px-wide slabs on desktop).
 *
 * Heights are computed as a percentage of the tallest cohort, so the
 * peak bar always touches the top of the chart area. A single-pixel
 * baseline tick under each bar marks the X-axis even when the bar
 * height is zero.
 */
function CohortBars({ buckets, currency, peakValue }: CohortViewProps) {
	return (
		<div
			className="flex h-32 w-full items-end justify-between gap-2"
			role="img"
			aria-label="Won deals per month, last 6 months, bar chart"
		>
			{buckets.map((b) => {
				const heightPct = peakValue === 0 ? 0 : (b.value / peakValue) * 100;
				return (
					<div
						key={b.month}
						className="flex h-full flex-1 flex-col items-center justify-end gap-1 min-w-0"
					>
						{/* Value badge — only when the bar has a value to label. */}
						<span
							className={cn(
								"text-[10px] font-medium tabular-nums text-foreground transition-opacity",
								b.value > 0 ? "opacity-100" : "opacity-0",
							)}
							aria-hidden={b.value === 0}
						>
							{shortCurrency(b.value, currency)}
						</span>
						{/* Bar column — capped width so wide containers don't
						    explode the bar to 200px. The remaining flex space
						    is empty negative space, which reads as a clean
						    centred chart on desktop. */}
						<div className="flex w-full flex-1 items-end justify-center">
							<div
								className={cn(
									"w-full max-w-12 rounded-t-[var(--radius)] transition-[height]",
									b.value > 0 ? "bg-primary/80" : "bg-transparent",
								)}
								style={{ height: `${heightPct}%` }}
							/>
						</div>
						{/* Baseline tick — gives every column a visible axis
						    even at zero height. */}
						<div className="h-px w-full max-w-12 bg-border" aria-hidden />
						<span className="text-[11px] text-muted-foreground">{shortMonth(b.t)}</span>
					</div>
				);
			})}
		</div>
	);
}

/**
 * Trend view — smooth area line of monthly-won value across the same
 * 6 cohorts. Uses the existing `<Sparkline>` primitive (which scales
 * cleanly with `preserveAspectRatio="none"` because lines are 1-D and
 * don't visibly distort when stretched horizontally — only text and
 * 2-D shapes do, which is why the Bars tab uses HTML).
 *
 * Month labels render as a separate HTML row underneath so they keep
 * their natural width regardless of container size.
 */
function CohortTrend({ buckets, currency, peakValue }: CohortViewProps) {
	const values = buckets.map((b) => b.value);
	return (
		<div className="space-y-1">
			<div className="flex items-baseline justify-between gap-2 text-[10px] text-muted-foreground">
				<span>Monthly won: value</span>
				<span className="tabular-nums">Peak {shortCurrency(peakValue, currency)}</span>
			</div>
			<Sparkline
				values={values}
				height={96}
				strokeWidth={1.75}
				className="text-primary"
				aria-label="Monthly won-deal value over the trailing 6 months"
			/>
			<div className="flex w-full justify-between gap-2 px-0.5 text-[11px] text-muted-foreground">
				{buckets.map((b) => (
					<span key={b.month} className="flex-1 text-center">
						{shortMonth(b.t)}
					</span>
				))}
			</div>
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
