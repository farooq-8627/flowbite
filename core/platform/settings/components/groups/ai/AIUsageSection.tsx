"use client";
/**
 * core/platform/settings/components/groups/ai/AIUsageSection.tsx
 *
 * Real AI Usage card. Replaces the prior 0/0 placeholder.
 *
 * Backend: `api.ai.queries.telemetry.getOrgUsage`. Single query feeds
 * this card AND the Billing → Plan limits gauge so the numbers always
 * agree.
 *
 * Layout:
 *   [usage gauge: tokens this month / plan limit]   [range tabs: 7d / 30d / 90d]
 *   [4-stat strip: total turns / total cost / errors / avg duration]
 *   [daily sparkline]
 *   [top tools table + top models table]
 */

import { useQuery } from "convex/react";
import { Activity, AlertTriangle, Clock, DollarSign, Sparkles } from "lucide-react";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { cn } from "@/lib/utils";
import { SettingsSection } from "../../shared/SettingsSection";

type RangeKey = "7d" | "30d" | "90d";
const RANGES: ReadonlyArray<{ key: RangeKey; label: string }> = [
	{ key: "7d", label: "7 days" },
	{ key: "30d", label: "30 days" },
	{ key: "90d", label: "90 days" },
];

const PLAN_LABEL: Record<string, string> = {
	free: "Free",
	starter: "Starter",
	pro: "Pro",
	enterprise: "Enterprise",
};

function formatNumber(n: number): string {
	if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
	if (n >= 1_000) return `${(n / 1_000).toFixed(n >= 10_000 ? 0 : 1)}K`;
	return n.toLocaleString();
}

function formatCost(usd: number): string {
	if (usd === 0) return "$0";
	if (usd < 0.01) return "<$0.01";
	if (usd < 1) return `$${usd.toFixed(2)}`;
	return `$${usd.toFixed(2)}`;
}

function StatTile({
	icon: Icon,
	label,
	value,
	hint,
	tone,
}: {
	icon: typeof Activity;
	label: string;
	value: string;
	hint?: string;
	tone?: "default" | "danger";
}) {
	return (
		<div className="flex flex-col gap-1 rounded-[var(--radius)] border bg-background p-3">
			<div className="flex items-center gap-1.5 text-xs text-muted-foreground">
				<Icon className="size-3.5" />
				<span>{label}</span>
			</div>
			<div
				className={cn(
					"text-xl font-semibold tabular-nums",
					tone === "danger" && "text-destructive",
				)}
			>
				{value}
			</div>
			{hint && <div className="text-[11px] text-muted-foreground">{hint}</div>}
		</div>
	);
}

function Sparkline({ data }: { data: ReadonlyArray<{ day: string; tokens: number }> }) {
	if (data.length === 0) {
		return (
			<div className="flex h-16 items-center justify-center text-xs text-muted-foreground">
				No usage in the selected range yet.
			</div>
		);
	}
	const max = Math.max(1, ...data.map((d) => d.tokens));
	return (
		<div className="flex h-16 items-end gap-px">
			{data.map((d) => {
				const pct = (d.tokens / max) * 100;
				return (
					<div
						key={d.day}
						title={`${d.day}: ${d.tokens.toLocaleString()} tokens`}
						className="flex-1 rounded-t-[2px] bg-primary/70 hover:bg-primary"
						style={{ height: `${Math.max(2, pct)}%` }}
					/>
				);
			})}
		</div>
	);
}

export function AIUsageSection({ orgId }: { orgId: Id<"orgs"> }) {
	const [range, setRange] = useState<RangeKey>("30d");
	const usage = useQuery(api.ai.queries.telemetry.getOrgUsage, { orgId, range });

	if (usage === undefined) {
		return (
			<SettingsSection
				id="ai.usage"
				title="AI Usage"
				description="AI message consumption against your plan limit."
			>
				<div className="py-6 text-center text-sm text-muted-foreground">Loading…</div>
			</SettingsSection>
		);
	}

	const limitDisplay = usage.limit === -1 ? "Unlimited" : formatNumber(usage.limit);
	const used = usage.usedThisMonth.totalTokens;
	const percent =
		usage.limit === -1
			? 0
			: usage.limit === 0
				? 100
				: Math.min(100, Math.round((used / Math.max(usage.limit, 1)) * 100));
	const isAtLimit = usage.limit > 0 && used >= usage.limit;
	const isHot = percent >= 80;
	const errorRatePct = Math.round(usage.range.errorRate * 100);
	const totalToolCalls = usage.range.toolCalls;
	const totalChatTurns = Math.max(0, usage.range.totalCalls - totalToolCalls);

	return (
		<SettingsSection
			id="ai.usage"
			title="AI Usage"
			description="Tokens used this month, plus tool-call activity over the selected window."
			action={
				<Badge variant="secondary" className="capitalize">
					{PLAN_LABEL[usage.plan] ?? usage.plan} plan
				</Badge>
			}
		>
			{/* 1 — Plan-limit gauge */}
			<div className="flex flex-col gap-2 border-b pb-4">
				<div className="flex items-center justify-between text-sm">
					<span className="font-medium">Tokens this month</span>
					<span className="tabular-nums">
						<span
							className={cn(
								"font-medium",
								isAtLimit && "text-destructive",
								isHot && !isAtLimit && "text-amber-600 dark:text-amber-400",
							)}
						>
							{used.toLocaleString()}
						</span>
						<span className="text-muted-foreground"> / {limitDisplay}</span>
					</span>
				</div>
				{usage.limit !== -1 && (
					<Progress value={percent} className={cn(isAtLimit && "[&_*]:bg-destructive")} />
				)}
				<div className="flex items-center justify-between text-xs text-muted-foreground">
					<span>
						{usage.usedThisMonth.calls.toLocaleString()} calls · ${" "}
						{usage.usedThisMonth.costUsd.toFixed(2)} cost so far
					</span>
					{isAtLimit && (
						<span className="font-medium text-destructive">
							Limit reached — upgrade in Billing.
						</span>
					)}
				</div>
			</div>

			{/* 2 — Range tabs */}
			<div className="flex items-center justify-between gap-2 py-3">
				<span className="text-xs font-medium text-muted-foreground">Activity range</span>
				<div className="flex gap-0.5 rounded-[var(--radius)] border bg-background p-0.5">
					{RANGES.map((r) => (
						<Button
							key={r.key}
							size="sm"
							variant={range === r.key ? "default" : "ghost"}
							className="h-6 rounded-[calc(var(--radius)-2px)] px-2 text-[11px]"
							onClick={() => setRange(r.key)}
						>
							{r.label}
						</Button>
					))}
				</div>
			</div>

			{/* 3 — 4-stat strip */}
			<div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
				<StatTile
					icon={Sparkles}
					label="Chat turns"
					value={totalChatTurns.toLocaleString()}
					hint={`${formatNumber(usage.range.totalTokens)} tokens`}
				/>
				<StatTile
					icon={Activity}
					label="Tool calls"
					value={totalToolCalls.toLocaleString()}
					hint={`${usage.topTools.length} unique tools`}
				/>
				<StatTile
					icon={DollarSign}
					label="Cost"
					value={formatCost(usage.range.totalCostUsd)}
					hint="estimated, model pricing"
				/>
				<StatTile
					icon={AlertTriangle}
					label="Error rate"
					value={`${errorRatePct}%`}
					hint={`${usage.range.errorCount} of ${usage.range.totalCalls}`}
					tone={errorRatePct >= 10 ? "danger" : "default"}
				/>
			</div>

			{/* 4 — Sparkline */}
			<div className="mt-4 flex flex-col gap-2">
				<div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
					<Clock className="size-3.5" />
					<span>Daily token usage</span>
				</div>
				<Sparkline data={usage.daily} />
			</div>

			{/* 5 — Top tools + models */}
			<div className="mt-4 grid gap-4 sm:grid-cols-2">
				<div className="flex flex-col gap-2">
					<div className="text-xs font-medium text-muted-foreground">Top tools</div>
					{usage.topTools.length === 0 ? (
						<div className="rounded-[var(--radius)] border border-dashed py-4 text-center text-xs text-muted-foreground">
							No tool calls yet.
						</div>
					) : (
						<ul className="flex flex-col divide-y rounded-[var(--radius)] border bg-background">
							{usage.topTools.slice(0, 5).map((t) => (
								<li
									key={t.name}
									className="flex items-center justify-between gap-2 px-3 py-2 text-xs"
								>
									<span className="truncate font-mono">{t.name}</span>
									<span className="flex items-center gap-2 tabular-nums text-muted-foreground">
										<span>{t.calls.toLocaleString()}</span>
										{t.errors > 0 && (
											<span className="text-destructive">×{t.errors}</span>
										)}
									</span>
								</li>
							))}
						</ul>
					)}
				</div>
				<div className="flex flex-col gap-2">
					<div className="text-xs font-medium text-muted-foreground">Top models</div>
					{usage.topModels.length === 0 ? (
						<div className="rounded-[var(--radius)] border border-dashed py-4 text-center text-xs text-muted-foreground">
							No model usage yet.
						</div>
					) : (
						<ul className="flex flex-col divide-y rounded-[var(--radius)] border bg-background">
							{usage.topModels.slice(0, 5).map((m) => (
								<li
									key={m.model}
									className="flex items-center justify-between gap-2 px-3 py-2 text-xs"
								>
									<span className="truncate">
										<span className="font-mono">{m.model}</span>
										<span className="ms-1 text-muted-foreground">
											· {m.provider}
										</span>
									</span>
									<span className="flex items-center gap-2 tabular-nums text-muted-foreground">
										<span>{formatNumber(m.tokens)} tok</span>
										<span>{formatCost(m.costUsd)}</span>
									</span>
								</li>
							))}
						</ul>
					)}
				</div>
			</div>
		</SettingsSection>
	);
}
