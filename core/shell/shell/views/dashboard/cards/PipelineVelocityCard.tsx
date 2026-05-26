"use client";

/**
 * PipelineVelocityCard — Stage 7 (SPRINT-PLAN.md / AI-AGENT-CAPABILITY-AUDIT.md
 * §2.2 A-4).
 *
 * Renders the pure-deterministic pipeline velocity rollup
 * (`convex/ai/queries/pipelineVelocity:getOrgPipelineVelocity`) as a
 * full-width dashboard card. For each pipeline:
 *
 *   - Pipeline name + total open / won / lost counts.
 *   - One row per stage: stage name, deals currently in stage, avg
 *     days in stage, dropoff %.
 *
 * Pure read — no LLM call, no mutation. The card is an empty CTA
 * ("No pipelines configured") when the org hasn't opted in.
 */

import { useQuery } from "convex/react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";

interface PipelineVelocityCardProps {
	orgId: Id<"orgs">;
	className?: string;
}

export function PipelineVelocityCard({ orgId, className }: PipelineVelocityCardProps) {
	const data = useQuery(api.ai.queries.pipelineVelocity.getOrgPipelineVelocity, { orgId });

	if (data === undefined) {
		return (
			<Card className={className}>
				<CardHeader>
					<CardTitle>Pipeline velocity</CardTitle>
					<CardDescription>Loading…</CardDescription>
				</CardHeader>
				<CardContent>
					<Skeleton className="h-24 w-full rounded-[var(--radius)]" />
				</CardContent>
			</Card>
		);
	}

	if (!data || data.pipelines.length === 0) {
		return (
			<Card className={className}>
				<CardHeader>
					<CardTitle>Pipeline velocity</CardTitle>
					<CardDescription>
						No pipelines configured yet — add one in Settings → Pipelines to see avg
						days-in-stage and dropoff per stage.
					</CardDescription>
				</CardHeader>
			</Card>
		);
	}

	return (
		<Card className={className}>
			<CardHeader>
				<CardTitle>Pipeline velocity</CardTitle>
				<CardDescription>
					Average days deals spend in each stage + dropoff per stage. Pure DB rollup —
					updates whenever a deal moves stage.
				</CardDescription>
			</CardHeader>
			<CardContent className="space-y-6">
				{data.pipelines.map((p) => (
					<div key={p.pipelineId} className="space-y-2">
						<div className="flex items-baseline justify-between">
							<h3 className="text-sm font-semibold">{p.pipelineName}</h3>
							<p className="text-xs text-muted-foreground">
								{p.totals.dealsOpen} open · {p.totals.dealsWon} won ·{" "}
								{p.totals.dealsLost} lost · avg {p.totals.avgPipelineDaysOpen}d open
							</p>
						</div>
						<div className="overflow-hidden rounded-[var(--radius)] border">
							<table className="w-full text-sm">
								<thead className="bg-muted/40 text-xs">
									<tr>
										<th className="ps-3 py-2 text-start font-medium">Stage</th>
										<th className="px-2 py-2 text-end font-medium">In stage</th>
										<th className="px-2 py-2 text-end font-medium">Avg days</th>
										<th className="pe-3 py-2 text-end font-medium">Dropoff</th>
									</tr>
								</thead>
								<tbody>
									{p.stages.map((s) => (
										<tr key={s.stageId} className="border-t">
											<td className="ps-3 py-2">
												<span
													className={
														s.isFinal && s.finalType === "negative"
															? "text-destructive"
															: s.isFinal &&
																	s.finalType === "positive"
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
												{s.avgDaysInStage > 0
													? `${s.avgDaysInStage}d`
													: "—"}
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
				))}
			</CardContent>
		</Card>
	);
}
