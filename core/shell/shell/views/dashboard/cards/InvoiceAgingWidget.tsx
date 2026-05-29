"use client";

/**
 * core/shell/shell/views/dashboard/cards/InvoiceAgingWidget.tsx
 *
 * Stage 4 of /DASHBOARD-V2-PLAN.md (2026-05-29) — freelancer / agency
 * template widget that buckets unpaid invoiced deals by age in stage
 * (0–7 / 8–14 / 15–30 / 30+ days). Pure deterministic rollup served
 * by `convex/crm/entities/deals/industryAnalytics:getInvoiceAging`.
 *
 * Visual shape: 4 horizontal aging-band rows (label · count · value)
 * with a coloured leading bar that scales relative to the most-loaded
 * bucket, followed by a "Most overdue" list (top 5) the user can
 * click to deep-link into the deal record.
 *
 * Empty state — dashed-border CTA card matching the
 * `<MessagesPreviewWidget>` / `<RecentActivityWidget>` pattern.
 */

import { useQuery } from "convex/react";
import { ArrowRightIcon, ReceiptTextIcon } from "lucide-react";
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

interface InvoiceAgingWidgetProps {
	orgId: Id<"orgs">;
	orgSlug: string;
	className?: string;
}

const BUCKET_TONE: Record<string, string> = {
	"0-7": "bg-emerald-500",
	"8-14": "bg-amber-500",
	"15-30": "bg-orange-500",
	"30+": "bg-rose-500",
};

export function InvoiceAgingWidget({ orgId, orgSlug, className }: InvoiceAgingWidgetProps) {
	const data = useQuery(api.crm.entities.deals.industryAnalytics.getInvoiceAging, { orgId });
	const labels = useEntityLabels();

	if (data === undefined) {
		return (
			<Card className={cn("flex h-full flex-col", className)}>
				<CardHeader className="pb-2">
					<CardTitle className="text-base">Invoice aging</CardTitle>
				</CardHeader>
				<CardContent className="flex-1 space-y-2 pt-0">
					<Skeleton className="h-6 w-full" />
					<Skeleton className="h-6 w-full" />
					<Skeleton className="h-6 w-full" />
				</CardContent>
			</Card>
		);
	}

	const isEmpty = data.total.count === 0;
	const peakBucketCount = data.buckets.reduce((m, b) => Math.max(m, b.count), 0);

	return (
		<Card className={cn("flex h-full flex-col", className)}>
			<CardHeader className="flex flex-row items-center justify-between gap-2 pb-2">
				<div className="flex items-center gap-2">
					<ReceiptTextIcon className="size-4 text-muted-foreground" aria-hidden />
					<div>
						<CardTitle className="text-base">Invoice aging</CardTitle>
						<CardDescription className="text-xs">
							Open invoices, grouped by days awaiting payment.
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
							aria-label="Open all invoiced deals"
						>
							Open all
							<ArrowRightIcon className="size-3" aria-hidden />
						</Link>
					</Button>
				)}
			</CardHeader>
			<CardContent className="flex-1 pt-0">
				{isEmpty ? (
					<div className="flex h-full flex-col items-center justify-center gap-2 rounded-[var(--radius)] border border-dashed bg-muted/30 px-4 py-6 text-center">
						<ReceiptTextIcon className="size-6 text-muted-foreground" aria-hidden />
						<p className="text-sm font-medium text-foreground">No open invoices</p>
						<p className="text-xs text-muted-foreground">
							Once a {labels.deal.singular.toLowerCase()} reaches an Invoiced stage,
							it will show up here grouped by age.
						</p>
						<Button
							size="sm"
							variant="outline"
							className="mt-1 h-7 text-xs"
							onClick={() =>
								sendChatPrefill(
									`Show me ${labels.deal.plural.toLowerCase()} ready to invoice this week.`,
								)
							}
						>
							Ask AI to spot upcoming invoices
						</Button>
					</div>
				) : (
					<div className="grid gap-4 lg:grid-cols-3">
						<div className="lg:col-span-2">
							<div className="mb-3 flex items-baseline justify-between gap-2">
								<div>
									<p className="text-xs text-muted-foreground">
										Total awaiting payment
									</p>
									<p className="text-xl font-semibold tabular-nums">
										{formatCurrency(data.total.value, data.currency)}
									</p>
								</div>
								<p className="text-xs text-muted-foreground tabular-nums">
									{data.total.count}{" "}
									{data.total.count === 1 ? "invoice" : "invoices"}
								</p>
							</div>
							<ul className="flex flex-col gap-2">
								{data.buckets.map((b) => {
									const tone = BUCKET_TONE[b.id] ?? "bg-muted-foreground/40";
									const widthPct =
										peakBucketCount === 0
											? 0
											: Math.max(
													2,
													Math.round((b.count / peakBucketCount) * 100),
												);
									return (
										<li
											key={b.id}
											className="grid grid-cols-[6rem_1fr_auto] items-center gap-3 text-sm"
										>
											<span className="text-xs text-muted-foreground">
												{b.label}
											</span>
											<div
												className="relative h-3 w-full overflow-hidden rounded-[var(--radius)] bg-muted"
												role="img"
												aria-label={`${b.count} ${b.count === 1 ? "invoice" : "invoices"} ${b.label}`}
											>
												<div
													className={cn(
														"absolute inset-y-0 start-0 rounded-[var(--radius)] transition-all",
														tone,
													)}
													style={{ width: `${widthPct}%` }}
												/>
											</div>
											<span className="text-xs tabular-nums text-foreground">
												{b.count} · {formatCurrency(b.value, data.currency)}
											</span>
										</li>
									);
								})}
							</ul>
						</div>
						<div>
							<p className="mb-2 text-xs font-medium text-muted-foreground">
								Most overdue
							</p>
							<ul className="flex flex-col gap-1.5">
								{data.mostOverdue.length === 0 ? (
									<li className="text-xs text-muted-foreground">—</li>
								) : (
									data.mostOverdue.map((d) => (
										<li key={d.dealId}>
											<Link
												href={`/${orgSlug}/${labels.deal.slug}/${d.dealCode}`}
												className="grid grid-cols-[1fr_auto] items-center gap-2 rounded-[var(--radius)] px-2 py-1 transition-colors hover:bg-accent"
											>
												<span className="truncate text-xs font-medium text-foreground">
													{d.title}
												</span>
												<span className="text-[10px] tabular-nums text-muted-foreground">
													{d.daysInStage}d
												</span>
												<span className="col-start-1 text-[10px] tabular-nums text-muted-foreground">
													{d.dealCode}
												</span>
												<span className="col-start-2 text-[10px] tabular-nums text-muted-foreground">
													{formatCurrency(d.value, data.currency)}
												</span>
											</Link>
										</li>
									))
								)}
							</ul>
						</div>
					</div>
				)}
			</CardContent>
		</Card>
	);
}
