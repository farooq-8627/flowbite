"use client";

/**
 * AIToolTraceView — Stage 7 (SPRINT-PLAN.md T-1).
 *
 * Full-screen audit trail for an AI conversation, mounted at
 * `/{orgSlug}/ai/trace/{conversationId}`. Reads
 * `api.ai.queries.toolTrace.getToolTraceForConversation` and renders
 * each `aiToolEvents` row in step order with:
 *
 *   - tool name + layer
 *   - status pill (ok / failure)
 *   - duration in ms
 *   - error code + (truncated) message when status=failure
 *   - cost in USD
 *
 * RBAC is enforced server-side via `ai.trace.view` + conversation-
 * membership gate (owner OR `messages.viewAll`). Failed reads return
 * `null` and we render a polite empty card.
 *
 * No mutations — read only.
 */

import { useQuery } from "convex/react";
import { AlertTriangle, CheckCircle2, ChevronLeft, ListChecks } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { useCurrentOrg } from "@/core/shell/shared/hooks/useCurrentOrg";

type TraceEvent = {
	id: Id<"aiToolEvents">;
	toolName: string;
	layer?: string;
	startedAt: number;
	durationMs: number;
	ok: boolean;
	errorCode?: string;
	errorMessage?: string;
	model?: string;
	provider?: string;
	inputTokens?: number;
	outputTokens?: number;
	costUsd?: number;
};

interface AIToolTraceViewProps {
	conversationId: Id<"aiConversations">;
}

export function AIToolTraceView({ conversationId }: AIToolTraceViewProps) {
	const { fullOrgEntry: currentOrg } = useCurrentOrg();
	const orgId = currentOrg?.org._id;
	const orgSlug = currentOrg?.org.slug;

	const trace = useQuery(
		api.ai.queries.toolTrace.getToolTraceForConversation,
		orgId ? { orgId, conversationId } : "skip",
	);

	if (trace === undefined) {
		return (
			<div className="container mx-auto max-w-5xl py-6">
				<Card>
					<CardHeader>
						<CardTitle>AI tool trace</CardTitle>
					</CardHeader>
					<CardContent>Loading…</CardContent>
				</Card>
			</div>
		);
	}

	if (trace === null || !trace.conversation) {
		return (
			<div className="container mx-auto max-w-5xl py-6">
				<Card className="border-dashed">
					<CardHeader>
						<CardTitle>Trace unavailable</CardTitle>
					</CardHeader>
					<CardContent className="space-y-3 text-sm text-muted-foreground">
						<p>
							This trace is not available — the conversation may not exist, you don't
							have access, or the workspace owner hasn't enabled AI tool traces
							(`ai.trace.view`).
						</p>
						{orgSlug ? (
							<Button asChild variant="outline" size="sm">
								<a href={`/${orgSlug}/dashboard`}>
									<ChevronLeft className="me-1 size-4" />
									Back to dashboard
								</a>
							</Button>
						) : null}
					</CardContent>
				</Card>
			</div>
		);
	}

	const { conversation, events, totals } = trace;

	return (
		<div className="container mx-auto max-w-5xl py-6 space-y-4">
			<div className="flex items-baseline justify-between gap-3">
				<div>
					<h1 className="text-2xl font-semibold flex items-center gap-2">
						<ListChecks className="size-5" />
						AI tool trace
					</h1>
					<p className="text-sm text-muted-foreground">
						{conversation.title ?? "Untitled conversation"} ·{" "}
						{new Date(conversation.createdAt).toLocaleString()}
					</p>
				</div>
				{orgSlug ? (
					<Button asChild variant="ghost" size="sm">
						<a href={`/${orgSlug}/dashboard`}>
							<ChevronLeft className="me-1 size-4" />
							Back
						</a>
					</Button>
				) : null}
			</div>

			<Card>
				<CardHeader>
					<CardTitle className="text-sm font-medium">
						{totals.eventCount} tool call{totals.eventCount === 1 ? "" : "s"} ·{" "}
						{totals.errorCount} error{totals.errorCount === 1 ? "" : "s"} · total{" "}
						{Math.round(totals.totalDurationMs)}ms · ${totals.totalCostUsd.toFixed(2)}
					</CardTitle>
				</CardHeader>
				<CardContent>
					{events.length === 0 ? (
						<p className="text-sm text-muted-foreground">
							No tool calls recorded for this conversation yet.
						</p>
					) : (
						<div className="overflow-hidden rounded-[var(--radius)] border">
							<table className="w-full text-sm">
								<thead className="bg-muted/40 text-xs">
									<tr>
										<th className="ps-3 py-2 text-start font-medium">Tool</th>
										<th className="px-2 py-2 text-start font-medium">Status</th>
										<th className="px-2 py-2 text-end font-medium">Duration</th>
										<th className="px-2 py-2 text-start font-medium">Error</th>
										<th className="pe-3 py-2 text-end font-medium">Cost</th>
									</tr>
								</thead>
								<tbody>
									{events.map((e: TraceEvent) => (
										<tr key={e.id} className="border-t">
											<td className="ps-3 py-2">
												<div className="font-medium">{e.toolName}</div>
												{e.layer ? (
													<div className="text-xs text-muted-foreground">
														{e.layer}
													</div>
												) : null}
											</td>
											<td className="px-2 py-2">
												{e.ok ? (
													<Badge className="bg-emerald-50 text-emerald-700 hover:bg-emerald-50 dark:bg-emerald-900/40 dark:text-emerald-400">
														<CheckCircle2 className="me-1 size-3" />
														OK
													</Badge>
												) : (
													<Badge variant="destructive">
														<AlertTriangle className="me-1 size-3" />
														Failed
													</Badge>
												)}
											</td>
											<td className="px-2 py-2 text-end font-mono">
												{e.durationMs}ms
											</td>
											<td className="px-2 py-2">
												{e.ok ? (
													<span className="text-muted-foreground">—</span>
												) : (
													<div>
														{e.errorCode ? (
															<code className="rounded bg-muted px-1 text-xs">
																{e.errorCode}
															</code>
														) : null}
														<div className="text-xs text-muted-foreground line-clamp-2">
															{e.errorMessage}
														</div>
													</div>
												)}
											</td>
											<td className="pe-3 py-2 text-end font-mono">
												{typeof e.costUsd === "number"
													? `$${e.costUsd.toFixed(4)}`
													: "—"}
											</td>
										</tr>
									))}
								</tbody>
							</table>
						</div>
					)}
				</CardContent>
			</Card>
		</div>
	);
}
