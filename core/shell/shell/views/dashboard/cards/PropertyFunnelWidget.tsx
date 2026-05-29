"use client";

/**
 * core/shell/shell/views/dashboard/cards/PropertyFunnelWidget.tsx
 *
 * Stage 4 of /DASHBOARD-V2-PLAN.md (2026-05-29) — real-estate template
 * widget that renders the default deal pipeline as a stage-by-stage
 * funnel with per-stage counts + cumulative dropoff vs the leading
 * stage.
 *
 * Uses `convex/crm/entities/deals/industryAnalytics:getPropertyFunnel`
 * which returns ordered stage rows with `relativeWidth ∈ [0,1]` and
 * `dropoffPct`. We render a centered horizontal funnel — each row has
 * a tapered bar whose width is `relativeWidth × 100%`, plus the count
 * + dropoff badge on the trailing edge.
 */

import { useQuery } from "convex/react";
import { ArrowRightIcon, FilterIcon } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { sendChatPrefill } from "@/core/ai/lib/chatPrefill";
import { useEntityLabels } from "@/core/shell/shared/hooks/useEntityLabels";
import { formatCurrency } from "@/core/shell/shared/hooks/useOrgDefaultCurrency";
import { cn } from "@/lib/utils";

interface PropertyFunnelWidgetProps {
	orgId: Id<"orgs">;
	orgSlug: string;
	className?: string;
}

export function PropertyFunnelWidget({ orgId, orgSlug, className }: PropertyFunnelWidgetProps) {
	const data = useQuery(api.crm.entities.deals.industryAnalytics.getPropertyFunnel, { orgId });
	const labels = useEntityLabels();

	if (data === undefined) {
		return (
			<Card className={cn("flex h-full flex-col", className)}>
				<CardHeader className="pb-2">
					<CardTitle className="text-base">Property funnel</CardTitle>
				</CardHeader>
				<CardContent className="flex-1 space-y-2 pt-0">
					<Skeleton className="h-7 w-full" />
					<Skeleton className="h-7 w-3/4" />
					<Skeleton className="h-7 w-1/2" />
					<Skeleton className="h-7 w-1/3" />
				</CardContent>
			</Card>
		);
	}

	const isEmpty =
		data === null || data.stages.length === 0 || data.totals.open + data.totals.won === 0;

	return (
		<Card className={cn("flex h-full flex-col", className)}>
			<CardHeader className="flex flex-row items-center justify-between gap-2 pb-2">
				<div className="flex items-center gap-2">
					<FilterIcon className="size-4 text-muted-foreground" aria-hidden />
					<div>
						<CardTitle className="text-base">
							{data?.pipelineName ?? "Property funnel"}
						</CardTitle>
						<CardDescription className="text-xs">
							Open {labels.deal.plural.toLowerCase()} by stage — surfaces where deals
							stall.
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
							href={`/${orgSlug}/${labels.deal.slug}`}
							aria-label={`Open all ${labels.deal.plural.toLowerCase()}`}
						>
							Open all
							<ArrowRightIcon className="size-3" aria-hidden />
						</Link>
					</Button>
				)}
			</CardHeader>
			<CardContent className="flex-1 pt-0">
				{isEmpty || data === null ? (
					<div className="flex h-full flex-col items-center justify-center gap-2 rounded-[var(--radius)] border border-dashed bg-muted/30 px-4 py-6 text-center">
						<FilterIcon className="size-6 text-muted-foreground" aria-hidden />
						<p className="text-sm font-medium text-foreground">
							No {labels.deal.plural.toLowerCase()} yet
						</p>
						<p className="text-xs text-muted-foreground">
							Add a {labels.deal.singular.toLowerCase()} and the funnel will fill in
							stage by stage.
						</p>
						<Button
							size="sm"
							variant="outline"
							className="mt-1 h-7 text-xs"
							onClick={() =>
								sendChatPrefill(
									`Create a new ${labels.deal.singular.toLowerCase()} — pick a property and seed the basics.`,
								)
							}
						>
							Ask AI to add a {labels.deal.singular.toLowerCase()}
						</Button>
					</div>
				) : (
					<div className="grid gap-4 lg:grid-cols-[1fr_auto]">
						<ul className="flex flex-col gap-1.5">
							{data.stages.map((s, i) => {
								const widthPct = Math.max(8, Math.round(s.relativeWidth * 100));
								const isLeader = i === 0;
								return (
									<li
										key={s.stageId}
										className="grid grid-cols-[7rem_1fr_5rem] items-center gap-2 text-sm"
									>
										<span className="truncate text-xs text-muted-foreground">
											{s.stageName}
										</span>
										<div
											className="relative h-6 w-full overflow-hidden rounded-[var(--radius)] bg-muted"
											role="img"
											aria-label={`${s.count} ${labels.deal.plural.toLowerCase()} in ${s.stageName}`}
										>
											<div
												className="absolute inset-y-0 start-0 flex items-center justify-end rounded-[var(--radius)] px-2 text-[10px] font-medium text-white transition-all"
												style={{
													width: `${widthPct}%`,
													backgroundColor:
														s.color ?? "hsl(var(--primary))",
												}}
											>
												{s.count > 0 ? s.count : ""}
											</div>
										</div>
										<span className="text-end text-xs tabular-nums text-muted-foreground">
											{isLeader || s.count === 0
												? formatCurrency(s.value, data.currency)
												: `−${s.dropoffPct}%`}
										</span>
									</li>
								);
							})}
						</ul>
						<div className="grid gap-3 lg:w-32 lg:grid-cols-1">
							<TotalsTile
								label="Open"
								value={String(data.totals.open)}
								sub={formatCurrency(data.totals.openValue, data.currency)}
								tone="text-foreground"
							/>
							<TotalsTile
								label="Won"
								value={String(data.totals.won)}
								sub={formatCurrency(data.totals.wonValue, data.currency)}
								tone="text-emerald-600"
							/>
						</div>
					</div>
				)}
			</CardContent>
		</Card>
	);
}

function TotalsTile({
	label,
	value,
	sub,
	tone,
}: {
	label: string;
	value: string;
	sub: string;
	tone: string;
}) {
	return (
		<div className="rounded-[var(--radius)] border bg-muted/30 px-3 py-2">
			<p className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</p>
			<p className={cn("text-lg font-semibold tabular-nums", tone)}>{value}</p>
			<p className="text-[10px] tabular-nums text-muted-foreground">{sub}</p>
		</div>
	);
}
