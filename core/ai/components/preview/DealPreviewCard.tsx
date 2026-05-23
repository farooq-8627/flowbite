"use client";
/**
 * core/ai/components/preview/DealPreviewCard.tsx
 *
 * Two-step preview for `create_deal` AND `close_deal`.
 *
 * For create:
 *   ┌ Title ──────────────────────────  $5,000  ┐
 *   │ Marina apartment lease                    │
 *   │ Person: P-001  ·  Closes: Jun 15          │
 *   └───────────────────────────────────────────┘
 *
 * For close:
 *   ┌ Closing as WON ─────────────────────────┐
 *   │ Deal D-042                              │
 *   │ Reason: Customer signed today           │
 *   └─────────────────────────────────────────┘
 */
import { Calendar, CircleCheckBig, CircleX, DollarSign, User } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { useCurrentOrg } from "@/core/shell/shared/hooks/useCurrentOrg";
import { cn } from "@/lib/utils";
import type { PreviewCardProps } from "./index";

function formatCurrency(amount: number, currency: string): string {
	try {
		return new Intl.NumberFormat(undefined, {
			style: "currency",
			currency: currency || "USD",
			maximumFractionDigits: 0,
		}).format(amount);
	} catch {
		return `${currency} ${amount.toLocaleString()}`;
	}
}

function formatDate(ms: number): string {
	try {
		return new Date(ms).toLocaleDateString(undefined, {
			month: "short",
			day: "numeric",
			year: "numeric",
		});
	} catch {
		return new Date(ms).toISOString().slice(0, 10);
	}
}

export function DealPreviewCard({ args, title }: PreviewCardProps) {
	const { fullOrgEntry } = useCurrentOrg();
	const currency = String(fullOrgEntry?.org.settings?.defaultCurrency ?? "USD");

	// close_deal variant — the model passes { dealId, outcome, reason? }
	if (typeof args.outcome === "string") {
		const outcome = String(args.outcome) as "won" | "lost";
		const isWon = outcome === "won";
		return (
			<div
				className={cn(
					"space-y-2 rounded-[var(--radius)] border p-3",
					isWon
						? "border-emerald-300/60 bg-emerald-50/60 dark:border-emerald-700/40 dark:bg-emerald-950/20"
						: "border-rose-300/60 bg-rose-50/60 dark:border-rose-700/40 dark:bg-rose-950/20",
				)}
			>
				<div className="flex items-center gap-2">
					{isWon ? (
						<CircleCheckBig className="size-4 text-emerald-600 dark:text-emerald-400" />
					) : (
						<CircleX className="size-4 text-rose-600 dark:text-rose-400" />
					)}
					<span className="font-semibold text-sm">
						Closing as {outcome.toUpperCase()}
					</span>
					<Badge variant="outline" className="ms-auto text-[10px]">
						{String(args.dealId ?? title ?? "—")}
					</Badge>
				</div>
				{Boolean(args.reason) && (
					<p className="text-xs text-muted-foreground italic ps-6 line-clamp-3">
						“{String(args.reason)}”
					</p>
				)}
			</div>
		);
	}

	// create_deal variant — the model passes { title, value?, personCode?, expectedCloseDate? }
	const dealTitle = String(args.title ?? "Untitled deal");
	const value = typeof args.value === "number" ? args.value : null;
	const personCode = args.personCode ? String(args.personCode) : null;
	const closeDate = typeof args.expectedCloseDate === "number" ? args.expectedCloseDate : null;

	return (
		<div className="space-y-2.5">
			<div className="flex items-start gap-3">
				<div className="flex size-10 shrink-0 items-center justify-center rounded-[var(--radius)] bg-amber-500/15 text-amber-700 dark:text-amber-300">
					<DollarSign className="size-5" />
				</div>
				<div className="min-w-0 flex-1">
					<p className="line-clamp-2 font-semibold text-sm leading-tight">{dealTitle}</p>
					{value !== null && (
						<p className="mt-0.5 text-base font-bold text-amber-700 dark:text-amber-300 tabular-nums">
							{formatCurrency(value, currency)}
						</p>
					)}
				</div>
			</div>

			<div className="flex flex-wrap items-center gap-1.5 ps-12">
				{personCode && (
					<Badge variant="outline" className="gap-1 text-[10px]">
						<User className="size-2.5" />
						{personCode}
					</Badge>
				)}
				{closeDate && (
					<Badge variant="outline" className="gap-1 text-[10px]">
						<Calendar className="size-2.5" />
						closes {formatDate(closeDate)}
					</Badge>
				)}
			</div>
		</div>
	);
}
