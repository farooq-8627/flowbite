"use client";

/**
 * AINextActionsView — Stage 6 (SPRINT-PLAN.md / AI-AGENT-CAPABILITY-AUDIT.md
 * §2.1 Milestone B).
 *
 * Full-screen ranked list at `/{orgSlug}/ai/next-actions`. The dashboard
 * `AIPulseRibbon` shows the top-3; this view shows the full top-100 with
 * confidence-filter tabs (All / High / Medium / Low) and per-row
 * actions:
 *
 *   - **Act on it** → opens the AI chat panel + prefills the suggestedIntent.
 *   - **Snooze 7d** → patches `snoozedUntil` so the row disappears for a week.
 *   - **Dismiss**   → deletes the row + records the suggestion fingerprint
 *                     in `users.preferences.aiPulseDismissed` so the next
 *                     30-min cron tick re-suppresses it.
 *
 * Reads only from `api.ai.queries.nextActions:listForUser` (already
 * subscribed by the ribbon — Convex de-dups). No new query fan-out.
 */

import { useMutation, useQuery } from "convex/react";
import {
	AlertCircle,
	AlertTriangle,
	BellOff,
	Info,
	ListChecks,
	MessageSquareIcon,
	Sparkles,
	X,
} from "lucide-react";
import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { openChatPanel, sendChatPrefill } from "@/core/ai/lib/chatPrefill";
import { useCurrentOrg } from "@/core/shell/shared/hooks/useCurrentOrg";
import { cn } from "@/lib/utils";

type Confidence = "high" | "medium" | "low";

type RankedRow = {
	id: Id<"aiNextActions">;
	recordKind: string;
	recordCode: string;
	score: number;
	confidence: Confidence;
	reasonCode: string;
	reasonText: string;
	suggestedIntent: string;
	dueAt?: number;
	snoozedUntil?: number;
	createdAt: number;
};

type RankedListResult = {
	count: number;
	generatedAt: number | null;
	rows: RankedRow[];
};

type ConfidenceFilter = "all" | Confidence;

export function AINextActionsView() {
	const { fullOrgEntry: currentOrg } = useCurrentOrg();
	const orgId = currentOrg?.org._id;
	const orgSlug = currentOrg?.org.slug;

	const ranked = useQuery(
		api.ai.queries.nextActions.listForUser,
		orgId ? { orgId, limit: 100 } : "skip",
	) as RankedListResult | undefined;

	const dismiss = useMutation(api.ai.queries.nextActions.dismissNextAction);
	const snooze = useMutation(api.ai.queries.nextActions.snoozeNextAction);

	const [filter, setFilter] = useState<ConfidenceFilter>("all");

	const filteredRows = useMemo<RankedRow[]>(() => {
		if (!ranked) return [];
		if (filter === "all") return ranked.rows;
		return ranked.rows.filter((r) => r.confidence === filter);
	}, [ranked, filter]);

	if (!currentOrg || !orgId) return null;

	const isLoading = ranked === undefined;
	const empty = !isLoading && filteredRows.length === 0;

	const handleAct = (row: RankedRow) => {
		openChatPanel();
		queueMicrotask(() => sendChatPrefill(row.suggestedIntent));
	};

	const handleSnooze = (row: RankedRow) => {
		void snooze({ orgId, actionId: row.id, days: 7 });
	};

	const handleDismiss = (row: RankedRow) => {
		void dismiss({ orgId, actionId: row.id });
	};

	return (
		<div className="h-full overflow-y-auto p-4 md:p-6">
			<div className="mx-auto flex max-w-4xl flex-col gap-4">
				<header className="flex items-start gap-3">
					<span
						aria-hidden
						className="mt-0.5 flex size-9 items-center justify-center rounded-[var(--radius)] bg-primary/10 text-primary"
					>
						<ListChecks className="size-5" />
					</span>
					<div className="min-w-0 flex-1">
						<h1 className="text-lg font-semibold leading-tight">Next actions</h1>
						<p className="text-sm text-muted-foreground">
							Ranked by urgency. Updated every 30 minutes by the proactive ranker.{" "}
							{orgSlug ? `Workspace: ${orgSlug}.` : ""}
						</p>
					</div>
				</header>

				<Tabs value={filter} onValueChange={(v) => setFilter(v as ConfidenceFilter)}>
					<TabsList className="w-full max-w-sm">
						<TabsTrigger value="all" className="flex-1">
							All ({ranked?.count ?? 0})
						</TabsTrigger>
						<TabsTrigger value="high" className="flex-1">
							High
						</TabsTrigger>
						<TabsTrigger value="medium" className="flex-1">
							Medium
						</TabsTrigger>
						<TabsTrigger value="low" className="flex-1">
							Low
						</TabsTrigger>
					</TabsList>
				</Tabs>

				{isLoading ? (
					<p className="text-sm text-muted-foreground">Loading…</p>
				) : empty ? (
					<Card className="border-dashed py-10">
						<CardContent className="flex flex-col items-center gap-2 text-center">
							<Sparkles className="size-7 text-muted-foreground" aria-hidden />
							<p className="text-sm font-medium">All caught up.</p>
							<p className="max-w-md text-xs text-muted-foreground">
								No next actions match this filter. The ranker rebuilds every 30
								minutes — try checking back later or pick a different confidence
								tier.
							</p>
						</CardContent>
					</Card>
				) : (
					<ul className="grid gap-3">
						{filteredRows.map((row) => (
							<NextActionRow
								key={row.id}
								row={row}
								onAct={() => handleAct(row)}
								onSnooze={() => handleSnooze(row)}
								onDismiss={() => handleDismiss(row)}
							/>
						))}
					</ul>
				)}
			</div>
		</div>
	);
}

function NextActionRow({
	row,
	onAct,
	onSnooze,
	onDismiss,
}: {
	row: RankedRow;
	onAct: () => void;
	onSnooze: () => void;
	onDismiss: () => void;
}) {
	const headline = useMemo(() => rankedToHeadline(row), [row]);
	return (
		<li>
			<Card>
				<CardHeader className="flex flex-row items-start gap-3 pb-2">
					<ConfidenceIcon confidence={row.confidence} />
					<div className="min-w-0 flex-1">
						<div className="flex flex-wrap items-center gap-2">
							<CardTitle className="text-sm font-semibold">{headline}</CardTitle>
							<ConfidenceBadge confidence={row.confidence} />
							<span className="text-[10px] uppercase tracking-wide text-muted-foreground">
								score {row.score}
							</span>
						</div>
						<p className="mt-1 text-xs text-muted-foreground">{row.reasonText}</p>
					</div>
					<button
						type="button"
						aria-label="Dismiss next action"
						className="rounded-full p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
						onClick={onDismiss}
					>
						<X className="size-4" aria-hidden />
					</button>
				</CardHeader>
				<CardContent className="flex flex-wrap items-center gap-2 pt-0">
					<Button size="sm" onClick={onAct} className="gap-1.5">
						<MessageSquareIcon className="size-3.5" aria-hidden />
						Act on it
					</Button>
					<Button size="sm" variant="outline" onClick={onSnooze} className="gap-1.5">
						<BellOff className="size-3.5" aria-hidden />
						Snooze 7d
					</Button>
					<span className="ms-auto text-[11px] text-muted-foreground">
						{row.recordKind} · {row.recordCode}
					</span>
				</CardContent>
			</Card>
		</li>
	);
}

function rankedToHeadline(row: RankedRow): string {
	const code = row.recordCode;
	switch (row.recordKind) {
		case "lead":
			return `Re-engage lead ${code}`;
		case "contact":
			return `Reach out to ${code}`;
		case "deal":
			return `Move deal ${code} forward`;
		case "company":
			return `Check in with ${code}`;
		case "reminder":
			return `Follow-up ${code} needs you`;
		default:
			return `Act on ${code}`;
	}
}

function ConfidenceBadge({ confidence }: { confidence: Confidence }) {
	const tone =
		confidence === "high"
			? "bg-primary/10 text-primary"
			: confidence === "medium"
				? "bg-amber-500/10 text-amber-600 dark:text-amber-400"
				: "bg-muted text-muted-foreground";
	return (
		<span
			className={cn(
				"rounded-[var(--radius)] px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide",
				tone,
			)}
		>
			{confidence} confidence
		</span>
	);
}

function ConfidenceIcon({ confidence }: { confidence: Confidence }) {
	if (confidence === "high") {
		return (
			<AlertCircle
				className="mt-0.5 size-4 flex-shrink-0 text-rose-500"
				aria-label="High confidence"
			/>
		);
	}
	if (confidence === "medium") {
		return (
			<AlertTriangle
				className="mt-0.5 size-4 flex-shrink-0 text-amber-500"
				aria-label="Medium confidence"
			/>
		);
	}
	return (
		<Info className="mt-0.5 size-4 flex-shrink-0 text-sky-500" aria-label="Low confidence" />
	);
}
