"use client";

/**
 * core/shell/shell/views/dashboard/cards/RevenueEstimateHero.tsx
 *
 * Stage 7 of /DASHBOARD-V2-PLAN.md (2026-05-29) — single bold revenue
 * card that replaces the 4 deal-related KPI tiles (Open Deals,
 * Pipeline Value, Deals Won, Deals Lost) with one focal headline
 * number. Sits ABOVE the metric strip on every dashboard so the first
 * thing the user reads is "what's my pipeline worth?", not four small
 * tiles each carrying part of the answer.
 *
 * Why this exists (user feedback 2026-05-29): the legacy 4-tile shape
 * forced the user to integrate four numbers in their head to answer
 * the only question they actually wanted to ask. The new hero card
 * leads with the weighted forecast (Σ value × stage probability),
 * footnotes the breakdown beneath, and links to deals for the full
 * drill-down. Drops the "Pipeline Value" / "Deals Won" / "Deals Lost"
 * KPI tiles from the metric strip so they don't double-render.
 *
 * Data — reuses the SalesPipelinePanel's existing
 * `getPipelineForecast` query (no new endpoint). Aggregates across
 * every deal pipeline in the org so a multi-pipeline workspace sees
 * one combined headline; the SalesPipelinePanel below still lets the
 * user switch pipelines for the per-pipeline drill-down.
 *
 * Empty state — when the org has zero deal pipelines OR zero deals,
 * the card switches to a `<DashboardEmptyState>` with the AI shortcut
 * "Ask AI for sample deals" so an empty workspace still demonstrates
 * the product instead of showing a lonely zero. Renders unconditionally
 * — the empty state IS the card when there's no data to forecast.
 *
 * RTL-safe: every directional class uses logical properties (ms/me/
 * start/end) and `rounded-[var(--radius)]` per AGENTS.md.
 */

import { useQuery } from "convex/react";
import { ArrowRightIcon, TargetIcon, TrendingUpIcon } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { formatCurrency } from "@/core/shell/shared/hooks/useOrgDefaultCurrency";
import { cn } from "@/lib/utils";
import { DashboardEmptyState } from "./DashboardEmptyState";

interface RevenueEstimateHeroProps {
	orgId: Id<"orgs">;
	orgSlug: string;
	className?: string;
}

/**
 * Aggregated metrics across every deal pipeline in the org. The
 * SalesPipelinePanel renders per-pipeline; this hero rolls up so the
 * single headline number reflects the whole workspace.
 */
type AggregatedForecast = {
	weightedValue: number;
	openValue: number;
	openCount: number;
	wonCount: number;
	wonValue: number;
	lostCount: number;
	currency: string;
};

function aggregate(
	pipelines: ReadonlyArray<{
		weightedValue: number;
		openValue: number;
		openCount: number;
		wonCount: number;
		wonValue: number;
		lostCount: number;
		currency: string;
	}>,
): AggregatedForecast {
	const out: AggregatedForecast = {
		weightedValue: 0,
		openValue: 0,
		openCount: 0,
		wonCount: 0,
		wonValue: 0,
		lostCount: 0,
		// Currency falls back to the first pipeline's currency (every
		// pipeline reads the same `org.settings.defaultCurrency`, so
		// they should never disagree — picking the first is just a
		// safe default for the empty-array case).
		currency: pipelines[0]?.currency ?? "USD",
	};
	for (const p of pipelines) {
		out.weightedValue += p.weightedValue;
		out.openValue += p.openValue;
		out.openCount += p.openCount;
		out.wonCount += p.wonCount;
		out.wonValue += p.wonValue;
		out.lostCount += p.lostCount;
	}
	return out;
}

export function RevenueEstimateHero({ orgId, orgSlug, className }: RevenueEstimateHeroProps) {
	const forecast = useQuery(api.crm.entities.deals.pipelineForecast.getPipelineForecast, {
		orgId,
	});

	// Loading shell — match the populated card height so first paint
	// doesn't shift the rest of the dashboard.
	if (forecast === undefined) {
		return (
			<Card className={cn("overflow-hidden", className)}>
				<CardContent className="flex flex-col gap-3 p-5 sm:p-6">
					<Skeleton className="h-3 w-32 rounded-[var(--radius)]" />
					<Skeleton className="h-12 w-48 rounded-[var(--radius)]" />
					<Skeleton className="h-3 w-64 rounded-[var(--radius)]" />
				</CardContent>
			</Card>
		);
	}

	const hasPipelines = forecast.pipelines.length > 0;
	const totals = hasPipelines ? aggregate(forecast.pipelines) : null;
	const hasAnyDealActivity =
		totals !== null && totals.openCount + totals.wonCount + totals.lostCount > 0;

	// Empty state — no pipelines OR no deals at all. Delegates to the
	// shared <DashboardEmptyState> so every dashboard zero-data card
	// reads the same way.
	if (!totals || !hasAnyDealActivity) {
		return (
			<Card className={cn("overflow-hidden", className)}>
				<CardContent className="p-4 sm:p-5">
					<DashboardEmptyState
						icon={TargetIcon}
						title="Estimate revenue from your deals"
						body={
							hasPipelines
								? "Add your first deal to see a weighted revenue forecast — sum of every open deal's value × its stage probability."
								: "Set up a sales pipeline and add a few deals to see a weighted revenue forecast right here."
						}
						primary={{
							label: hasPipelines ? "Add a deal" : "Set up pipeline",
							href: hasPipelines
								? `/${orgSlug}/deals`
								: `/${orgSlug}/settings?group=pipelines`,
						}}
						aiIntent={
							hasPipelines
								? "Create 5 sample deals so I can explore the pipeline"
								: "Set up a sales pipeline with sensible stages for my business"
						}
						aiLabel="Ask AI to set it up"
					/>
				</CardContent>
			</Card>
		);
	}

	const headline = formatCurrency(totals.weightedValue, totals.currency);

	return (
		<Card className={cn("overflow-hidden", className)}>
			<CardContent className="flex flex-col gap-2 min-w-0">
				<div className="flex items-center justify-between gap-3 min-w-0">
					<div className="flex items-center gap-2 min-w-0">
						<span
							aria-hidden
							className="flex size-7 shrink-0 items-center justify-center rounded-[var(--radius)] bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400"
						>
							<TrendingUpIcon className="size-4" />
						</span>
						<div className="flex flex-col min-w-0">
							<span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground truncate">
								Estimated revenue
							</span>
							<span className="text-[10px] text-muted-foreground/80 truncate">
								Σ deal value × stage probability · all open pipelines
							</span>
						</div>
					</div>
					<Button
						asChild
						size="sm"
						variant="ghost"
						className="h-7 gap-1 px-2 text-xs text-muted-foreground hover:text-foreground shrink-0"
					>
						<Link href={`/${orgSlug}/deals`} aria-label="Open deals">
							View deals
							<ArrowRightIcon className="size-3" aria-hidden />
						</Link>
					</Button>
				</div>

				{/* Headline — bold, large, tabular-nums so the number doesn't
				    jiggle as it ticks up. Uses currentColor + the foreground
				    token so dark mode flips automatically. The wrapping
				    `role="img"` lets the implicit `aria-label` describe the
				    full forecast figure to screen readers without violating
				    a11y rules about ARIA on plain text elements.

				    2026-05-30 (mobile overflow fix) — start the responsive
				    ramp at `text-3xl` instead of `text-4xl` so a wide
				    currency string like `$263,500` fits inside a 320px
				    viewport without forcing horizontal overflow on the
				    whole dashboard. Adds `truncate` + `min-w-0` so an
				    even longer figure clips with an ellipsis instead. */}
				<p
					role="img"
					aria-label={`Weighted revenue forecast: ${headline}`}
					className="font-bold leading-none tabular-nums text-foreground tracking-tight text-3xl sm:text-4xl md:text-5xl lg:text-6xl py-2 truncate min-w-0"
				>
					{headline}
				</p>

				{/* Footnote breakdown — the four numbers the legacy KPI
				    tiles displayed, now compacted into one read-once line.
				    Pipe-separated, muted, links to the deals page on a
				    direct click anywhere on the row's keyword. */}
				<div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
					<HeroStat
						label="open"
						value={`${totals.openCount}`}
						href={`/${orgSlug}/deals`}
					/>
					<span aria-hidden className="text-muted-foreground/40">
						·
					</span>
					<HeroStat
						label="in pipeline"
						value={formatCurrency(totals.openValue, totals.currency)}
						href={`/${orgSlug}/deals`}
					/>
					<span aria-hidden className="text-muted-foreground/40">
						·
					</span>
					<HeroStat
						label="won"
						value={`${totals.wonCount}`}
						href={`/${orgSlug}/deals?stage=won`}
						accent="text-emerald-700 dark:text-emerald-400"
					/>
					<span aria-hidden className="text-muted-foreground/40">
						·
					</span>
					<HeroStat
						label="lost"
						value={`${totals.lostCount}`}
						href={`/${orgSlug}/deals?stage=lost`}
						accent="text-rose-700 dark:text-rose-400"
					/>
				</div>
			</CardContent>
		</Card>
	);
}

// ─── Reusable shells ────────────────────────────────────────────────────────

function HeroStat({
	label,
	value,
	href,
	accent,
}: {
	label: string;
	value: string;
	href?: string;
	accent?: string;
}) {
	const inner = (
		<span className="inline-flex items-baseline gap-1">
			<span className={cn("font-semibold tabular-nums text-foreground", accent)}>
				{value}
			</span>
			<span className="text-muted-foreground">{label}</span>
		</span>
	);
	if (href) {
		return (
			<Link
				href={href}
				className="rounded-[var(--radius)] outline-none ring-ring/50 transition-colors hover:text-foreground hover:ring-1"
			>
				{inner}
			</Link>
		);
	}
	return inner;
}
