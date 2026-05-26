"use client";
/**
 * core/platform/settings/components/groups/ai/AIReliabilityCard.tsx
 *
 * Stage 5 — Per-tool AI reliability dashboard. Surfaces the
 * `reliability.perTool` block from `api.ai.queries.telemetry.getOrgUsage`
 * as a sortable table ranked by call volume.
 *
 * For each tool the card shows:
 *   - Call count over the selected window (defaults to 30d).
 *   - Success rate (% of non-error executions).
 *   - Average duration (ms).
 *   - Top error reason + occurrence count (when there are any errors).
 *   - "View trace" button — wired to `/{orgSlug}/ai/trace/<toolName>` in
 *     Stage 7 (the Analytical layer / trace viewer). For now the button
 *     is a placeholder + tooltip explaining the upcoming trace UI, so
 *     this stage doesn't ship a dead link.
 *
 * Also drives Constraint H from /SPRINT-PLAN.md once Stage 6 lands —
 * the same `reliability.perTool` payload feeds a "tool X is failing
 * 50% of calls today, prefer Y" hint in `systemPrompt.ts`.
 *
 * Pattern: same `useQuery` + `SettingsSection` skeleton as
 * `AIUsageSection.tsx`. The two cards share the underlying query so
 * the panel only pays for one round-trip.
 */

import { useQuery } from "convex/react";
import { Activity, AlertTriangle, CheckCircle2, Clock, Eye } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
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

function formatPercent(rate: number): string {
	if (Number.isNaN(rate)) return "—";
	return `${Math.round(rate * 100)}%`;
}

function formatMs(ms: number): string {
	if (ms <= 0) return "—";
	if (ms < 1000) return `${ms} ms`;
	return `${(ms / 1000).toFixed(1)} s`;
}

function formatNumber(n: number): string {
	if (n >= 1000) return `${(n / 1000).toFixed(n >= 10_000 ? 0 : 1)}K`;
	return n.toLocaleString();
}

export function AIReliabilityCard({ orgId }: { orgId: Id<"orgs"> }) {
	const [range, setRange] = useState<RangeKey>("30d");
	const usage = useQuery(api.ai.queries.telemetry.getOrgUsage, { orgId, range });

	if (usage === undefined) {
		return (
			<SettingsSection
				id="ai.reliability"
				title="Tool reliability"
				description="Per-tool success rate, latency, and top error reasons over the selected window."
			>
				<div className="py-6 text-center text-sm text-muted-foreground">Loading…</div>
			</SettingsSection>
		);
	}

	const perTool = usage.reliability.perTool;
	const overallSuccessRate = (() => {
		const totals = perTool.reduce(
			(acc, t) => {
				acc.calls += t.callCount;
				acc.errors += t.errorCount;
				return acc;
			},
			{ calls: 0, errors: 0 },
		);
		if (totals.calls === 0) return 1;
		return (totals.calls - totals.errors) / totals.calls;
	})();

	return (
		<SettingsSection
			id="ai.reliability"
			title="Tool reliability"
			description="Per-tool success rate, latency, and top error reasons over the selected window."
		>
			{/* Header — overall success rate + range tabs */}
			<div className="flex items-center justify-between gap-2 border-b pb-3">
				<div className="flex items-center gap-2">
					<CheckCircle2
						className={cn(
							"size-4",
							overallSuccessRate >= 0.95
								? "text-emerald-500"
								: overallSuccessRate >= 0.85
									? "text-amber-500"
									: "text-rose-500",
						)}
					/>
					<span className="text-sm font-medium">
						Overall success rate{" "}
						<span className="ms-1 tabular-nums">
							{formatPercent(overallSuccessRate)}
						</span>
					</span>
				</div>
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

			{/* Per-tool table */}
			<div className="mt-3 flex flex-col gap-2">
				{perTool.length === 0 ? (
					<div className="rounded-[var(--radius)] border border-dashed py-6 text-center text-xs text-muted-foreground">
						No tool calls in the selected window. Reliability stats will appear after
						the AI runs at least one tool here.
					</div>
				) : (
					<div className="overflow-hidden rounded-[var(--radius)] border bg-background">
						<div className="grid grid-cols-12 gap-2 border-b bg-muted/40 px-3 py-2 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
							<span className="col-span-4">Tool</span>
							<span className="col-span-2 text-end tabular-nums">Calls</span>
							<span className="col-span-2 text-end tabular-nums">Success</span>
							<span className="col-span-2 text-end tabular-nums">Avg</span>
							<span className="col-span-2 text-end">Trace</span>
						</div>
						<ul className="flex flex-col divide-y">
							{perTool.map((t) => {
								const rate = t.successRate;
								const rateTone =
									rate >= 0.95
										? "text-emerald-600 dark:text-emerald-400"
										: rate >= 0.85
											? "text-amber-600 dark:text-amber-400"
											: "text-rose-600 dark:text-rose-400";
								return (
									<li
										key={t.toolName}
										className="flex flex-col gap-1 px-3 py-2 text-xs"
									>
										<div className="grid grid-cols-12 items-center gap-2">
											<span
												className="col-span-4 truncate font-mono"
												title={t.toolName}
											>
												{t.toolName}
											</span>
											<span className="col-span-2 flex items-center justify-end gap-1 tabular-nums text-muted-foreground">
												<Activity className="size-3" aria-hidden />
												{formatNumber(t.callCount)}
											</span>
											<span
												className={cn(
													"col-span-2 text-end font-medium tabular-nums",
													rateTone,
												)}
											>
												{formatPercent(rate)}
											</span>
											<span className="col-span-2 flex items-center justify-end gap-1 tabular-nums text-muted-foreground">
												<Clock className="size-3" aria-hidden />
												{formatMs(t.avgDurationMs)}
											</span>
											<span className="col-span-2 flex items-center justify-end">
												<Tooltip>
													<TooltipTrigger asChild>
														<Button
															size="sm"
															variant="ghost"
															className="h-6 gap-1 px-2 text-[11px]"
															disabled
															aria-label={`View trace for ${t.toolName} (Stage 7)`}
														>
															<Eye className="size-3" aria-hidden />
															View
														</Button>
													</TooltipTrigger>
													<TooltipContent side="top">
														Trace viewer ships in Stage 7 of the AI
														sprint.
													</TooltipContent>
												</Tooltip>
											</span>
										</div>
										{t.errorCount > 0 && t.topErrorReason && (
											<div className="flex items-start gap-1.5 rounded-[var(--radius)] bg-rose-500/5 px-2 py-1 text-[11px] text-rose-700 dark:text-rose-300">
												<AlertTriangle
													className="mt-0.5 size-3 flex-shrink-0"
													aria-hidden
												/>
												<span className="min-w-0 flex-1 break-words">
													<span className="font-medium">
														Top error ({t.topErrorCount}×):
													</span>{" "}
													<span className="font-mono">
														{t.topErrorReason}
													</span>
												</span>
											</div>
										)}
									</li>
								);
							})}
						</ul>
					</div>
				)}
				<p className="text-[11px] text-muted-foreground">
					Showing the {perTool.length} most-called tools over the last{" "}
					{range === "7d" ? "7 days" : range === "30d" ? "30 days" : "90 days"}. Stage 6
					injects "low-reliability tool" hints into the system prompt so the model can
					self-correct.
				</p>
			</div>
		</SettingsSection>
	);
}
