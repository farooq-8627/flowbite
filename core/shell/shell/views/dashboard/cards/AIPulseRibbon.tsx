"use client";

/**
 * AIPulseRibbon — Stage 6 (SPRINT-PLAN.md / AI-AGENT-CAPABILITY-AUDIT.md
 * §2.1 Milestone B).
 *
 * Top-3 highest-value next actions, dismissible per-user, rendered ABOVE
 * the metric strip. Stage 6 evolves the Stage 5 ribbon to read from the
 * materialised `aiNextActions` ranking (cron-rebuilt every 30 min) so
 * each row carries a stable score + explicit confidence label (Stage 6
 * closes capability-audit gap T-4 by surfacing confidence on every
 * suggestion).
 *
 * Source priority
 * ───────────────
 *   1. `convex.ai.queries.nextActions:listForUser` — the ranked store.
 *      Covers reminders, stale leads, stuck deals, high-value deal
 *      stalls. Each row has `score (0-100)`, `confidence (high|medium|low)`
 *      and a chat-prefill `suggestedIntent`.
 *   2. Fallback: `convex.ai.suggestions:list` — the Stage 5 heuristic
 *      engine. Used when the cron hasn't fired yet for this user (first
 *      ribbon render after seed) so the dashboard never feels empty.
 *
 * The cron rebuild deletes a user's previous rows before inserting the
 * fresh ranked top-100 — `listForUser` therefore always reflects the
 * latest tick. Confidence chip colours: high → primary, medium → amber,
 * low → muted.
 *
 * Per-user dismiss
 * ────────────────
 * Two dismiss paths share `users.preferences.aiPulseDismissed`:
 *   - Ranked rows → `api.ai.queries.nextActions.dismissNextAction`
 *     (deletes the row + records the suggestion fingerprint so the
 *     next rebuild can suppress it).
 *   - Fallback rows → `api.users.mutations.dismissAiPulseSuggestion`
 *     (the Stage 5 mutation, used only while the ranked store is empty).
 *
 * RTL-safe Tailwind (`ms-/me-/ps-/pe-/start-/end-`); `rounded-[var(--radius)]`.
 */

import { useMutation, useQuery } from "convex/react";
import { anyApi } from "convex/server";
import {
	AlertCircle,
	AlertTriangle,
	ArrowRight,
	Info,
	ListChecks,
	RefreshCw,
	Sparkles,
	X,
} from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { sendChatPrefill } from "@/core/ai/lib/chatPrefill";
import { useMe } from "@/core/shell/shared/hooks/useCurrentOrg";
import { cn } from "@/lib/utils";

type SuggestionSeverity = "info" | "warning" | "critical";
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

type FallbackSuggestion = {
	id: string;
	kind: string;
	headline: string;
	body: string;
	intent: string;
	severity: SuggestionSeverity;
	anchor?: { entityType: string; code: string };
};

const MAX_VISIBLE = 3;

interface AIPulseRibbonProps {
	orgId: Id<"orgs">;
	orgSlug: string;
	className?: string;
}

function severityRank(s: SuggestionSeverity): number {
	if (s === "critical") return 0;
	if (s === "warning") return 1;
	return 2;
}

function confidenceToSeverity(c: Confidence): SuggestionSeverity {
	if (c === "high") return "critical";
	if (c === "medium") return "warning";
	return "info";
}

type DisplayRow = {
	id: string;
	source: "ranked" | "fallback";
	headline: string;
	body: string;
	severity: SuggestionSeverity;
	confidence?: Confidence;
	intent: string;
	rankedActionId?: Id<"aiNextActions">;
	fallbackSuggestionId?: string;
};

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

export function AIPulseRibbon({ orgId, orgSlug, className }: AIPulseRibbonProps) {
	const me = useMe();
	const ranked = useQuery(api.ai.queries.nextActions.listForUser, {
		orgId,
		limit: 20,
	}) as RankedListResult | undefined;

	// Fallback only fires when the ranked store is empty so that the
	// dashboard never goes silent. We pass the same anyApi reference the
	// existing AISuggestionsPanel uses to keep the Convex subscription
	// table de-duped.
	const fallbackSuggestions = useQuery(anyApi.ai.suggestions.list, {
		orgId,
		scope: "org",
	}) as FallbackSuggestion[] | undefined;

	const dismissRanked = useMutation(api.ai.queries.nextActions.dismissNextAction);
	const dismissFallback = useMutation(api.users.mutations.dismissAiPulseSuggestion);

	// Stage 3-A.4 — lazy-warm the ranked store when it's empty for this
	// user. Fires at most ONCE per session via the `warmRequestedRef`
	// gate (per AGENTS.md "Never put hook-returned objects in useEffect
	// deps" — the mutation is destructured + stable). The mutation is
	// rate-limited at 1/min on the server; the ref is just a UX courtesy
	// to avoid re-firing during reactive cycles.
	const lazyWarm = useMutation(api.ai.queries.nextActions.lazyWarmForUser);
	const warmRequestedRef = useRef(false);
	const isWarming = ranked !== undefined && ranked.count === 0 && warmRequestedRef.current;

	useEffect(() => {
		if (warmRequestedRef.current) return;
		if (ranked === undefined) return; // still loading
		if (ranked.count > 0) return; // already populated
		if (ranked.generatedAt !== null) return; // already generated, just empty (user dismissed all)
		warmRequestedRef.current = true;
		void lazyWarm({ orgId }).catch((err) => {
			// Rate-limit rejections are expected when the user navigates
			// quickly between tabs; swallow silently. Other errors leave
			// the ref set so we don't retry until next session.
			if (typeof console !== "undefined") {
				console.warn("[AIPulseRibbon] lazyWarmForUser failed:", err);
			}
		});
	}, [ranked, lazyWarm, orgId]);

	const dismissedMap = useMemo(() => {
		const raw = me?.preferences?.aiPulseDismissed;
		return (raw ?? {}) as Record<string, number>;
	}, [me?.preferences?.aiPulseDismissed]);

	const visible = useMemo<DisplayRow[]>(() => {
		// Source 1: ranked store. We treat it as the source of truth.
		if (ranked && ranked.count > 0) {
			return ranked.rows
				.filter((r) => {
					const fingerprint = `${r.recordKind}:${r.recordCode}:${r.reasonCode}`;
					return !(fingerprint in dismissedMap);
				})
				.slice(0, MAX_VISIBLE)
				.map<DisplayRow>((r) => ({
					id: `ranked:${r.id}`,
					source: "ranked",
					headline: rankedToHeadline(r),
					body: r.reasonText,
					severity: confidenceToSeverity(r.confidence),
					confidence: r.confidence,
					intent: r.suggestedIntent,
					rankedActionId: r.id,
				}));
		}
		// Source 2: heuristic engine. Only shown while the ranked store
		// is still warming up.
		if (!fallbackSuggestions) return [];
		return [...fallbackSuggestions]
			.filter((s) => !(s.id in dismissedMap))
			.sort((a, b) => severityRank(a.severity) - severityRank(b.severity))
			.slice(0, MAX_VISIBLE)
			.map<DisplayRow>((s) => ({
				id: `fallback:${s.id}`,
				source: "fallback",
				headline: s.headline,
				body: s.body,
				severity: s.severity,
				intent: s.intent,
				fallbackSuggestionId: s.id,
			}));
	}, [ranked, fallbackSuggestions, dismissedMap]);

	if (ranked === undefined && fallbackSuggestions === undefined) return null;
	// Stage 3-A.4 — render a 3-row skeleton during the warm window so
	// the user knows the AI is working. Without this the card silently
	// disappears between "queries returning empty" and "rebuild lands".
	if (isWarming && (fallbackSuggestions === undefined || fallbackSuggestions.length === 0)) {
		return (
			<section
				aria-label="AI pulse — refreshing actions"
				className={cn(
					"flex flex-col gap-2 rounded-[var(--radius)] border border-primary/30 bg-gradient-to-br from-primary/5 via-card to-card p-3",
					className,
				)}
			>
				<header className="flex items-center gap-2">
					<span
						aria-hidden
						className="flex size-6 items-center justify-center rounded-[var(--radius)] bg-primary/10 text-primary"
					>
						<Sparkles className="size-3.5" />
					</span>
					<h3 className="text-xs font-semibold uppercase tracking-wide text-foreground">
						AI Pulse
					</h3>
					<span className="ms-auto inline-flex items-center gap-1 text-[10px] uppercase tracking-wide text-muted-foreground">
						<RefreshCw className="size-3 animate-spin" aria-hidden />
						Refreshing actions…
					</span>
				</header>
				<ul className="grid gap-2 md:grid-cols-3">
					{[0, 1, 2].map((i) => (
						<li
							key={i}
							className="flex flex-col gap-1.5 rounded-[var(--radius)] border bg-card p-2.5 shadow-xs"
						>
							<Skeleton className="h-3 w-3/4" />
							<Skeleton className="h-3 w-full" />
							<Skeleton className="h-5 w-20" />
						</li>
					))}
				</ul>
			</section>
		);
	}
	if (visible.length === 0) return null;

	return (
		<section
			aria-label="AI pulse — top suggestions for you"
			className={cn(
				"flex flex-col gap-2 rounded-[var(--radius)] border border-primary/30 bg-gradient-to-br from-primary/5 via-card to-card p-3",
				className,
			)}
		>
			<header className="flex items-center gap-2">
				<span
					aria-hidden
					className="flex size-6 items-center justify-center rounded-[var(--radius)] bg-primary/10 text-primary"
				>
					<Sparkles className="size-3.5" />
				</span>
				<h3 className="text-xs font-semibold uppercase tracking-wide text-foreground">
					AI Pulse
				</h3>
				<span className="ms-auto text-[10px] uppercase tracking-wide text-muted-foreground/70">
					Top {visible.length}
				</span>
				<Button
					asChild
					size="sm"
					variant="ghost"
					className="h-6 gap-1 px-2 text-[11px] text-muted-foreground hover:text-foreground"
				>
					<Link href={`/${orgSlug}/ai/next-actions`}>
						<ListChecks className="size-3" aria-hidden />
						All next actions
					</Link>
				</Button>
			</header>
			<ul className="grid gap-2 md:grid-cols-3">
				{visible.map((row) => (
					<PulseChip
						key={row.id}
						row={row}
						onDismiss={() => {
							if (row.source === "ranked" && row.rankedActionId) {
								void dismissRanked({ orgId, actionId: row.rankedActionId });
							} else if (row.source === "fallback" && row.fallbackSuggestionId) {
								void dismissFallback({ suggestionId: row.fallbackSuggestionId });
							}
						}}
						onAct={() => sendChatPrefill(row.intent)}
					/>
				))}
			</ul>
		</section>
	);
}

function PulseChip({
	row,
	onDismiss,
	onAct,
}: {
	row: DisplayRow;
	onDismiss: () => void;
	onAct: () => void;
}) {
	return (
		<li
			className="group relative flex flex-col gap-1.5 rounded-[var(--radius)] border bg-card p-2.5 shadow-xs transition-colors hover:border-ring/40"
			data-severity={row.severity}
		>
			<div className="flex items-start gap-2 pe-6">
				<SeverityIcon severity={row.severity} />
				<div className="min-w-0 flex-1">
					<p className="line-clamp-2 text-xs font-medium leading-snug text-foreground">
						{row.headline}
					</p>
					<p className="mt-0.5 line-clamp-2 text-[11px] leading-snug text-muted-foreground">
						{row.body}
					</p>
				</div>
			</div>
			<div className="flex items-center justify-between">
				{row.confidence ? (
					<ConfidenceBadge confidence={row.confidence} />
				) : (
					<span className="text-[10px] text-muted-foreground/70">heuristic</span>
				)}
				<Button
					size="sm"
					variant="ghost"
					className="h-6 gap-1 px-2 text-[11px]"
					onClick={onAct}
				>
					Ask AI
					<ArrowRight className="size-3" aria-hidden />
				</Button>
			</div>
			<button
				type="button"
				aria-label="Dismiss suggestion"
				className="absolute end-1.5 top-1.5 rounded-full p-0.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
				onClick={onDismiss}
			>
				<X className="size-3" />
			</button>
		</li>
	);
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

function SeverityIcon({ severity }: { severity: SuggestionSeverity }) {
	if (severity === "critical") {
		return (
			<AlertCircle
				className="mt-0.5 size-3.5 flex-shrink-0 text-rose-500"
				aria-label="Critical"
			/>
		);
	}
	if (severity === "warning") {
		return (
			<AlertTriangle
				className="mt-0.5 size-3.5 flex-shrink-0 text-amber-500"
				aria-label="Warning"
			/>
		);
	}
	return <Info className="mt-0.5 size-3.5 flex-shrink-0 text-sky-500" aria-label="Info" />;
}
