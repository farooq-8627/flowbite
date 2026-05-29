"use client";

/**
 * core/shell/shell/views/dashboard/cards/SalesPipelinePanel.tsx
 *
 * Stage 2 of /DASHBOARD-V2-PLAN.md (2026-05-29) — single source of
 * truth for pipeline visibility on the dashboard. Replaces both:
 *
 *   - `PipelineCard` (open value + win rate KPI tile) and
 *   - `PipelineVelocityCard` (per-stage funnel)
 *
 * with a tabbed full-width panel patterned on the
 * Coefficient/HubSpot weighted-pipeline reference
 * (https://coefficient.io/dashboard-examples/weighted-pipeline-hubspot).
 *
 * Tabs
 * ────
 *   1. **Summary** — Open value · Weighted forecast · Win-rate dial.
 *      Plain "where am I right now?" view; no time-window jargon.
 *   2. **Velocity** — Per-stage funnel: deals-in-stage, avg days,
 *      dropoff %. Reuses the existing
 *      `convex/ai/queries/pipelineVelocity:getOrgPipelineVelocity`
 *      query verbatim — same data the old `PipelineVelocityCard`
 *      rendered.
 *   3. **Forecast** — HubSpot-style Commit / Best Case / Pipeline
 *      tiles + Won-this-window / Lost-this-window / Forecast tiles +
 *      coverage-ratio dial (open ÷ won, last 90d) + 12-week
 *      cumulative-won sparkline. Fed by the new
 *      `convex/crm/entities/deals/pipelineForecast:getPipelineForecast`
 *      query.
 *
 * Multi-pipeline support (2026-05-30 — dashboard refinement spec)
 * ──────────────────────────────────────────────────────────────
 *   - When the org has ZERO deal pipelines → empty state CTA.
 *   - When the org has EXACTLY ONE deal pipeline → no switcher
 *     rendered at all (a tab strip with one option is noise). All
 *     three tabs read directly from that single pipeline's payload.
 *   - When the org has TWO OR MORE pipelines → the switcher leads
 *     with an **"All pipelines"** option that AGGREGATES every
 *     pipeline's forecast into one combined view. Per-pipeline
 *     options follow (default first, alphabetical thereafter — same
 *     order the backend returns). The "All" option is the default
 *     selected state on first paint so the org-wide forecast lands
 *     before the user has to think.
 *
 * The aggregation is pure arithmetic — sum every numeric forecast
 * field, weighted-average the coverage ratio, sum the 12-week
 * sparkline buckets element-wise. Velocity's per-stage funnel can't
 * be combined across pipelines whose stage IDs differ, so the "All"
 * Velocity view falls back to a per-pipeline overview table
 * (one row per pipeline with its open / won / lost totals).
 */

import { useQuery } from "convex/react";
import { Minus, Target, TrendingDown, TrendingUp } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Sparkline } from "@/components/ui/sparkline";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { formatCurrency } from "@/core/shell/shared/hooks/useOrgDefaultCurrency";
import { cn } from "@/lib/utils";
import { DashboardEmptyState } from "./DashboardEmptyState";

interface SalesPipelinePanelProps {
	orgId: Id<"orgs">;
	orgSlug: string;
	className?: string;
}

/** Sentinel id for the aggregated "All pipelines" view. */
const ALL_PIPELINES_ID = "_all" as const;

type PipelineForecastRow =
	import("@/convex/crm/entities/deals/pipelineForecast").PipelineForecastResult;

export function SalesPipelinePanel({ orgId, orgSlug, className }: SalesPipelinePanelProps) {
	const forecast = useQuery(api.crm.entities.deals.pipelineForecast.getPipelineForecast, {
		orgId,
	});
	const velocity = useQuery(api.ai.queries.pipelineVelocity.getOrgPipelineVelocity, { orgId });

	// Pipeline ids — combined from forecast + velocity payloads (they
	// should always match but defensive merge keeps the panel
	// rendering even if one stream is briefly out of sync).
	const pipelineIds = useMemo(() => {
		const ids: string[] = [];
		if (forecast) for (const p of forecast.pipelines) ids.push(p.pipelineId);
		if (velocity)
			for (const p of velocity.pipelines) {
				const id = p.pipelineId as unknown as string;
				if (!ids.includes(id)) ids.push(id);
			}
		return ids;
	}, [forecast, velocity]);

	// Aggregated forecast across every pipeline — used by the "All"
	// view when 2+ pipelines exist. Pure arithmetic; no DB call.
	// Hooks must be called unconditionally (above the early returns
	// below) per React's rules-of-hooks.
	const aggregatedForecast = useMemoAggregateForecast(forecast?.pipelines ?? []);

	const pipelineCount = pipelineIds.length;
	const showSwitcher = pipelineCount > 1;
	const defaultActiveId = showSwitcher ? ALL_PIPELINES_ID : (pipelineIds[0] ?? null);

	const [activePipelineId, setActivePipelineId] = useState<string | null>(null);
	const effectiveActiveId = activePipelineId ?? defaultActiveId;

	if (forecast === undefined || velocity === undefined) {
		return (
			<Card className={cn("min-w-0 overflow-hidden", className)}>
				<CardHeader>
					<CardTitle>Sales pipeline</CardTitle>
					<CardDescription>Loading forecast + velocity…</CardDescription>
				</CardHeader>
				<CardContent>
					<Skeleton className="h-32 w-full rounded-[var(--radius)]" />
				</CardContent>
			</Card>
		);
	}

	if (pipelineCount === 0) {
		return (
			<Card className={cn("min-w-0 overflow-hidden", className)}>
				<CardHeader className="pb-2">
					<CardTitle>Sales pipeline</CardTitle>
					<CardDescription>
						Track deals through stages and forecast revenue.
					</CardDescription>
				</CardHeader>
				<CardContent>
					<DashboardEmptyState
						icon={Target}
						title="Set up your sales pipeline"
						body="Add a pipeline with stages (e.g. New → Qualified → Won) to see open value, win rate, and a weighted forecast right here."
						primary={{
							label: "Create a pipeline",
							href: `/${orgSlug}/settings?group=pipelines`,
						}}
						aiIntent="Set up a sales pipeline with sensible stages for my business"
						aiLabel="Ask AI to set it up"
					/>
				</CardContent>
			</Card>
		);
	}

	const isAll = effectiveActiveId === ALL_PIPELINES_ID;
	const activeForecast = isAll
		? aggregatedForecast
		: (forecast.pipelines.find((p) => p.pipelineId === effectiveActiveId) ?? null);
	const activeVelocity = isAll
		? null
		: (velocity.pipelines.find(
				(p) => (p.pipelineId as unknown as string) === effectiveActiveId,
			) ?? null);

	return (
		<Card className={cn("min-w-0 overflow-hidden", className)}>
			<CardHeader className="flex flex-col gap-3 pb-2 sm:flex-row sm:items-start sm:justify-between">
				<div className="flex flex-col gap-1 min-w-0">
					<CardTitle>Sales pipeline</CardTitle>
					<CardDescription>
						Open value, per-stage velocity, and HubSpot-style weighted forecast — all
						from one place.
					</CardDescription>
				</div>
				{showSwitcher && (
					<PipelineSwitcher
						forecasts={[
							{ id: ALL_PIPELINES_ID, name: "All pipelines" },
							...forecast.pipelines.map((p) => ({
								id: p.pipelineId,
								name: p.pipelineName,
							})),
						]}
						activeId={effectiveActiveId}
						onChange={setActivePipelineId}
					/>
				)}
			</CardHeader>
			<CardContent>
				<Tabs defaultValue="summary" className="gap-3">
					<TabsList>
						<TabsTrigger value="summary">Summary</TabsTrigger>
						<TabsTrigger value="velocity">Velocity</TabsTrigger>
						<TabsTrigger value="forecast">Forecast</TabsTrigger>
					</TabsList>
					<TabsContent value="summary">
						<SummaryTab forecast={activeForecast} orgSlug={orgSlug} />
					</TabsContent>
					<TabsContent value="velocity">
						{isAll ? (
							<AllPipelinesVelocity pipelines={forecast.pipelines} />
						) : (
							<VelocityTab velocity={activeVelocity} orgSlug={orgSlug} />
						)}
					</TabsContent>
					<TabsContent value="forecast">
						<ForecastTab forecast={activeForecast} orgSlug={orgSlug} />
					</TabsContent>
				</Tabs>
			</CardContent>
		</Card>
	);
}

// ─── Aggregation across pipelines ───────────────────────────────────────

/**
 * Sum every numeric forecast field across all pipelines, weighted-
 * average the coverage ratio, sum the 12-week sparkline element-wise.
 * Returns a synthetic forecast row whose `pipelineId` is the
 * `ALL_PIPELINES_ID` sentinel — never written back to the DB.
 *
 * `isDefault` is forced to false (the synthetic row isn't a real
 * pipeline). `coverageBands` falls back to the first pipeline's bands
 * since every pipeline in the same org reads from the same template
 * `forecast.coverageBands` slot — they should never disagree.
 *
 * Hook because it allocates a fresh `sparkline12w` array every call —
 * memoising on the pipelines reference avoids reallocating on every
 * render.
 */
function useMemoAggregateForecast(
	pipelines: ReadonlyArray<PipelineForecastRow>,
): PipelineForecastRow | null {
	return useMemo(() => {
		if (pipelines.length === 0) return null;
		const first = pipelines[0]!;
		const out: PipelineForecastRow = {
			pipelineId: ALL_PIPELINES_ID as unknown as Id<"pipelines">,
			pipelineName: "All pipelines",
			isDefault: false,
			openCount: 0,
			openValue: 0,
			weightedValue: 0,
			commitCount: 0,
			commitValue: 0,
			bestCaseCount: 0,
			bestCaseValue: 0,
			pipelineBucketCount: 0,
			pipelineBucketValue: 0,
			wonCount: 0,
			wonValue: 0,
			lostCount: 0,
			lostValue: 0,
			coverageRatio: 0,
			coverageBands: first.coverageBands,
			sparkline12w: first.sparkline12w.map((b) => ({ t: b.t, value: 0 })),
			windowStartedAt: first.windowStartedAt,
			windowEndedAt: first.windowEndedAt,
			currency: first.currency,
		};
		for (const p of pipelines) {
			out.openCount += p.openCount;
			out.openValue += p.openValue;
			out.weightedValue += p.weightedValue;
			out.commitCount += p.commitCount;
			out.commitValue += p.commitValue;
			out.bestCaseCount += p.bestCaseCount;
			out.bestCaseValue += p.bestCaseValue;
			out.pipelineBucketCount += p.pipelineBucketCount;
			out.pipelineBucketValue += p.pipelineBucketValue;
			out.wonCount += p.wonCount;
			out.wonValue += p.wonValue;
			out.lostCount += p.lostCount;
			out.lostValue += p.lostValue;
			// Element-wise sparkline aggregation. Bucket timestamps line
			// up because every pipeline read uses the same `now` in
			// `readPipelineForecast`.
			for (let i = 0; i < out.sparkline12w.length && i < p.sparkline12w.length; i++) {
				out.sparkline12w[i]!.value += p.sparkline12w[i]!.value;
			}
		}
		out.coverageRatio =
			out.wonValue > 0 ? Math.round((out.openValue / out.wonValue) * 10) / 10 : 0;
		return out;
	}, [pipelines]);
}

// ─── Pipeline switcher ──────────────────────────────────────────────────

function PipelineSwitcher({
	forecasts,
	activeId,
	onChange,
}: {
	forecasts: Array<{ id: string; name: string }>;
	activeId: string | null;
	onChange: (id: string) => void;
}) {
	return (
		<div className="flex flex-wrap items-center gap-1 rounded-[var(--radius)] border bg-muted/40 p-1 max-w-full">
			{forecasts.map((p) => (
				<button
					type="button"
					key={p.id}
					onClick={() => onChange(p.id)}
					className={cn(
						"rounded-[calc(var(--radius)-2px)] px-2 py-1 text-xs font-medium transition-colors truncate max-w-[10rem]",
						activeId === p.id
							? "bg-background text-foreground shadow-sm"
							: "text-muted-foreground hover:text-foreground",
					)}
					title={p.name}
				>
					{p.name}
				</button>
			))}
		</div>
	);
}

// ─── Summary tab ────────────────────────────────────────────────────────

function SummaryTab({
	forecast,
	orgSlug,
}: {
	forecast: PipelineForecastRow | null;
	orgSlug: string;
}) {
	if (!forecast) {
		return (
			<DashboardEmptyState
				icon={Target}
				title="No deals yet"
				body="Add your first deal to start tracking open value, win rate, and a weighted revenue forecast."
				primary={{ label: "Add a deal", href: `/${orgSlug}/deals` }}
				aiIntent="Create 5 sample deals so I can explore the pipeline"
				aiLabel="Ask AI for sample deals"
			/>
		);
	}
	const winRate =
		forecast.wonCount + forecast.lostCount > 0
			? Math.round((forecast.wonCount / (forecast.wonCount + forecast.lostCount)) * 100)
			: 0;
	return (
		<div className="grid grid-cols-1 gap-3 md:grid-cols-3">
			<MetricTile
				label="Open value"
				value={
					forecast.openCount === 0 && forecast.openValue === 0
						? "—"
						: formatCurrency(forecast.openValue, forecast.currency)
				}
				footnote={`${forecast.openCount} active`}
				href={`/${orgSlug}/deals`}
			/>
			<MetricTile
				label="Weighted forecast"
				value={formatCurrency(forecast.weightedValue, forecast.currency)}
				footnote="Σ value × probability"
				accent="text-emerald-700 dark:text-emerald-400"
			/>
			<WinRateDial
				wonCount={forecast.wonCount}
				lostCount={forecast.lostCount}
				winRate={winRate}
			/>
		</div>
	);
}

// ─── Velocity tab (lifted from PipelineVelocityCard) ────────────────────

function VelocityTab({
	velocity,
	orgSlug,
}: {
	velocity: import("@/convex/ai/queries/pipelineVelocity").PipelineVelocityResult | null;
	orgSlug: string;
}) {
	if (!velocity) {
		return (
			<DashboardEmptyState
				icon={Target}
				title="No stage activity yet"
				body="Velocity shows how fast deals move through each stage. Add a few deals and move them along to see it come alive."
				primary={{ label: "Add a deal", href: `/${orgSlug}/deals` }}
				aiIntent="Create 5 sample deals so I can explore the pipeline"
				aiLabel="Ask AI for sample deals"
			/>
		);
	}
	return (
		<div className="space-y-3">
			<p className="text-xs text-muted-foreground">
				{velocity.totals.dealsOpen} open · {velocity.totals.dealsWon} won ·{" "}
				{velocity.totals.dealsLost} lost · avg {velocity.totals.avgPipelineDaysOpen}d open
			</p>
			<div className="overflow-hidden rounded-[var(--radius)] border">
				<div className="overflow-x-auto">
					<table className="w-full min-w-[420px] text-sm">
						<thead className="bg-muted/40 text-xs">
							<tr>
								<th className="ps-3 py-2 text-start font-medium">Stage</th>
								<th className="px-2 py-2 text-end font-medium">In stage</th>
								<th className="px-2 py-2 text-end font-medium">Avg days</th>
								<th className="pe-3 py-2 text-end font-medium">Dropoff</th>
							</tr>
						</thead>
						<tbody>
							{velocity.stages.map((s) => (
								<tr key={s.stageId} className="border-t">
									<td className="ps-3 py-2">
										<span
											className={
												s.isFinal && s.finalType === "negative"
													? "text-destructive"
													: s.isFinal && s.finalType === "positive"
														? "text-emerald-600 dark:text-emerald-500"
														: ""
											}
										>
											{s.stageName}
										</span>
									</td>
									<td className="px-2 py-2 text-end font-mono">
										{s.dealsInStage}
									</td>
									<td className="px-2 py-2 text-end font-mono">
										{s.avgDaysInStage > 0 ? `${s.avgDaysInStage}d` : "—"}
									</td>
									<td className="pe-3 py-2 text-end font-mono">
										{s.dealsExitingStage > 0 ? `${s.dropoffPct}%` : "—"}
									</td>
								</tr>
							))}
						</tbody>
					</table>
				</div>
			</div>
		</div>
	);
}

/**
 * Velocity tab when "All pipelines" is selected. Stage-by-stage
 * funnels can't be merged across pipelines whose stage IDs differ, so
 * we fall back to a per-pipeline overview table — one row per pipeline
 * with its open / won / lost totals + open value. The user can switch
 * to a specific pipeline tab for the full per-stage breakdown.
 */
function AllPipelinesVelocity({ pipelines }: { pipelines: ReadonlyArray<PipelineForecastRow> }) {
	if (pipelines.length === 0) {
		return (
			<p className="text-xs text-muted-foreground">
				Per-stage velocity is shown when you pick a specific pipeline above.
			</p>
		);
	}
	const totalOpen = pipelines.reduce((s, p) => s + p.openCount, 0);
	const totalWon = pipelines.reduce((s, p) => s + p.wonCount, 0);
	const totalLost = pipelines.reduce((s, p) => s + p.lostCount, 0);
	const currency = pipelines[0]!.currency;
	const totalOpenValue = pipelines.reduce((s, p) => s + p.openValue, 0);
	return (
		<div className="space-y-3">
			<p className="text-xs text-muted-foreground">
				{totalOpen} open · {totalWon} won · {totalLost} lost · across {pipelines.length}{" "}
				pipelines
			</p>
			<div className="overflow-hidden rounded-[var(--radius)] border">
				<div className="overflow-x-auto">
					<table className="w-full min-w-[420px] text-sm">
						<thead className="bg-muted/40 text-xs">
							<tr>
								<th className="ps-3 py-2 text-start font-medium">Pipeline</th>
								<th className="px-2 py-2 text-end font-medium">Open</th>
								<th className="px-2 py-2 text-end font-medium">Won (90d)</th>
								<th className="px-2 py-2 text-end font-medium">Lost (90d)</th>
								<th className="pe-3 py-2 text-end font-medium">Open value</th>
							</tr>
						</thead>
						<tbody>
							{pipelines.map((p) => (
								<tr key={p.pipelineId} className="border-t">
									<td className="ps-3 py-2 truncate max-w-[12rem]">
										{p.pipelineName}
										{p.isDefault && (
											<span className="ms-1 text-[10px] text-muted-foreground">
												default
											</span>
										)}
									</td>
									<td className="px-2 py-2 text-end font-mono">{p.openCount}</td>
									<td className="px-2 py-2 text-end font-mono">{p.wonCount}</td>
									<td className="px-2 py-2 text-end font-mono">{p.lostCount}</td>
									<td className="pe-3 py-2 text-end font-mono tabular-nums">
										{formatCurrency(p.openValue, p.currency)}
									</td>
								</tr>
							))}
							<tr className="border-t bg-muted/20 font-medium">
								<td className="ps-3 py-2">All pipelines</td>
								<td className="px-2 py-2 text-end font-mono">{totalOpen}</td>
								<td className="px-2 py-2 text-end font-mono">{totalWon}</td>
								<td className="px-2 py-2 text-end font-mono">{totalLost}</td>
								<td className="pe-3 py-2 text-end font-mono tabular-nums">
									{formatCurrency(totalOpenValue, currency)}
								</td>
							</tr>
						</tbody>
					</table>
				</div>
			</div>
			<p className="text-[11px] text-muted-foreground">
				Pick a specific pipeline above to see its per-stage funnel (deals-in-stage, avg
				days, dropoff %).
			</p>
		</div>
	);
}

// ─── Forecast tab ───────────────────────────────────────────────────────

function ForecastTab({
	forecast,
	orgSlug,
}: {
	forecast: PipelineForecastRow | null;
	orgSlug: string;
}) {
	if (!forecast) {
		return (
			<DashboardEmptyState
				icon={Target}
				title="Nothing to forecast yet"
				body="Add deals with values and close dates to get a HubSpot-style Commit / Best Case / Pipeline forecast."
				primary={{ label: "Add a deal", href: `/${orgSlug}/deals` }}
				aiIntent="Create 5 sample deals so I can explore the pipeline"
				aiLabel="Ask AI for sample deals"
			/>
		);
	}
	const sparkValues = forecast.sparkline12w.map((b) => b.value);
	const totalWonInWindow = forecast.wonValue;

	return (
		<div className="grid grid-cols-1 gap-3 md:grid-cols-2">
			{/* HubSpot-style buckets */}
			<div className="grid grid-cols-3 gap-2 min-w-0">
				<MetricTile
					label="Commit"
					sublabel="≥75%"
					value={formatCurrency(forecast.commitValue, forecast.currency)}
					footnote={`${forecast.commitCount} deals`}
					accent="text-emerald-700 dark:text-emerald-400"
				/>
				<MetricTile
					label="Best case"
					sublabel="50–74%"
					value={formatCurrency(forecast.bestCaseValue, forecast.currency)}
					footnote={`${forecast.bestCaseCount} deals`}
					accent="text-amber-700 dark:text-amber-400"
				/>
				<MetricTile
					label="Pipeline"
					sublabel="<50%"
					value={formatCurrency(forecast.pipelineBucketValue, forecast.currency)}
					footnote={`${forecast.pipelineBucketCount} deals`}
					accent="text-muted-foreground"
				/>
			</div>
			{/* Won / Lost / Forecast */}
			<div className="grid grid-cols-3 gap-2 min-w-0">
				<MetricTile
					label="Won (90d)"
					value={formatCurrency(forecast.wonValue, forecast.currency)}
					footnote={`${forecast.wonCount} deals`}
					accent="text-emerald-700 dark:text-emerald-400"
				/>
				<MetricTile
					label="Lost (90d)"
					value={formatCurrency(forecast.lostValue, forecast.currency)}
					footnote={`${forecast.lostCount} deals`}
					accent="text-rose-700 dark:text-rose-400"
				/>
				<MetricTile
					label="Forecast"
					value={formatCurrency(forecast.weightedValue, forecast.currency)}
					footnote="Σ value × prob"
				/>
			</div>
			{/* Coverage ratio */}
			<div className="md:col-span-1 min-w-0">
				<CoverageDial
					ratio={forecast.coverageRatio}
					bands={forecast.coverageBands}
					wonValue={totalWonInWindow}
					currency={forecast.currency}
				/>
			</div>
			{/* Sparkline (12 weeks of cumulative won) */}
			<div className="flex flex-col justify-between gap-2 rounded-[var(--radius)] border bg-card/50 p-3 md:col-span-1 min-w-0">
				<div className="flex items-baseline justify-between gap-2">
					<span className="text-[10px] uppercase tracking-wide text-muted-foreground">
						Won — last 12 weeks
					</span>
					<span className="text-xs font-semibold tabular-nums">
						{formatCurrency(totalWonInWindow, forecast.currency)}
					</span>
				</div>
				<Sparkline
					values={sparkValues}
					height={40}
					strokeWidth={1.5}
					className="text-emerald-600 dark:text-emerald-400"
					aria-label="Weekly won-deal value over the trailing 12 weeks"
				/>
			</div>
		</div>
	);
}

// ─── Reusable shells ────────────────────────────────────────────────────

function MetricTile({
	label,
	sublabel,
	value,
	footnote,
	accent,
	href,
}: {
	label: string;
	sublabel?: string;
	value: string;
	footnote?: string;
	accent?: string;
	href?: string;
}) {
	const body = (
		<div className="flex flex-col gap-0.5 rounded-[var(--radius)] border bg-card/50 px-3 py-2 h-full min-w-0">
			<span className="flex items-baseline justify-between gap-1 text-[10px] uppercase tracking-wide text-muted-foreground flex-1">
				<span className="truncate">{label}</span>
				{sublabel && <span className="text-muted-foreground/70 shrink-0">{sublabel}</span>}
			</span>
			<span className={cn("text-lg font-bold tabular-nums truncate", accent)}>{value}</span>
			{footnote && (
				<span className="text-[10px] text-muted-foreground truncate">{footnote}</span>
			)}
		</div>
	);
	if (href) {
		return (
			<Link
				href={href}
				className="rounded-[var(--radius)] outline-none ring-ring/50 hover:ring-1 min-w-0"
			>
				{body}
			</Link>
		);
	}
	return body;
}

function WinRateDial({
	wonCount,
	lostCount,
	winRate,
}: {
	wonCount: number;
	lostCount: number;
	winRate: number;
}) {
	const closed = wonCount + lostCount;
	return (
		<div className="flex flex-col gap-1.5 rounded-[var(--radius)] border bg-card/50 px-3 py-2 min-w-0">
			<span className="flex items-center justify-between gap-1 text-[10px] uppercase tracking-wide text-muted-foreground">
				<span>Win rate</span>
				<span className="text-muted-foreground/70">90d</span>
			</span>
			<span className="text-lg font-bold tabular-nums">{winRate}%</span>
			<span className="text-[10px] text-muted-foreground">
				{wonCount} won · {lostCount} lost
			</span>
			{closed > 0 && (
				<div
					className="flex h-1.5 overflow-hidden rounded-full bg-muted"
					role="img"
					aria-label={`${wonCount} won, ${lostCount} lost`}
				>
					<div
						className="bg-emerald-500"
						style={{ width: `${(wonCount / closed) * 100}%` }}
					/>
					<div
						className="bg-rose-500"
						style={{ width: `${(lostCount / closed) * 100}%` }}
					/>
				</div>
			)}
		</div>
	);
}

function CoverageDial({
	ratio,
	bands,
	wonValue,
	currency,
}: {
	ratio: number;
	bands: { healthy: number; warning: number };
	wonValue: number;
	currency: string;
}) {
	const healthState =
		wonValue === 0
			? "neutral"
			: ratio >= bands.healthy
				? "ok"
				: ratio >= bands.warning
					? "warn"
					: "danger";
	const Icon =
		healthState === "ok" ? TrendingUp : healthState === "danger" ? TrendingDown : Minus;
	const tone =
		healthState === "ok"
			? "text-emerald-600 dark:text-emerald-400"
			: healthState === "danger"
				? "text-rose-600 dark:text-rose-400"
				: "text-amber-600 dark:text-amber-400";
	const label =
		healthState === "ok"
			? "Healthy coverage"
			: healthState === "warn"
				? "Coverage tightening"
				: healthState === "danger"
					? "Coverage low"
					: "Build up wins to compute coverage";
	return (
		<div className="flex h-full flex-col gap-1.5 rounded-[var(--radius)] border bg-card/50 px-3 py-2 min-w-0">
			<span className="text-[10px] uppercase tracking-wide text-muted-foreground">
				Coverage ratio
			</span>
			<span className="flex items-baseline gap-2">
				<span className={cn("text-lg font-bold tabular-nums", tone)}>
					{wonValue === 0 ? "—" : `${ratio.toFixed(1)}×`}
				</span>
				<Icon className={cn("size-3.5", tone)} aria-hidden="true" />
			</span>
			<span className="text-[10px] text-muted-foreground">{label}</span>
			<span className="text-[10px] text-muted-foreground/80 truncate">
				Open ÷ won (90d): {formatCurrency(wonValue, currency)} won · target ≥{" "}
				{bands.healthy}×
			</span>
		</div>
	);
}
