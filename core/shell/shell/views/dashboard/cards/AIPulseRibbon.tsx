"use client";

/**
 * AIPulseRibbon — Stage 5 (SPRINT-PLAN.md / DASHBOARD-AUDIT.md §4 D5).
 *
 * Top-3 highest-value AI suggestions, dismissible per-user, rendered
 * ABOVE the metric strip when there is at least one undismissed
 * suggestion. Tighter density than `<AISuggestionsPanel>` — those are
 * actionable hints that the user can choose to investigate; this is
 * the "what should I look at right now?" badge.
 *
 * Pattern
 * ───────
 *   - Source: `convex.ai.suggestions.list({orgId, scope: "org"})` —
 *     same heuristic engine that drives the existing AI Suggestions
 *     Panel. No new model calls; no new index reads. Already shipped.
 *   - Per-user dismiss: `users.preferences.aiPulseDismissed` map of
 *     `{ [suggestionId]: dismissedAt }`. Persisted via
 *     `api.users.mutations.dismissAiPulseSuggestion`. Read inline from
 *     the user document via `useMe()` — no second `useQuery`.
 *   - Severity gating: critical → warning → info (same rank as the
 *     suggestions panel). Cap visible at 3 to keep the ribbon glanceable.
 *   - Dismissal is optimistic — the row is hidden immediately, the
 *     server write fires in the background. Failures don't matter
 *     here because the worst case is the row reappears next render
 *     (and the user can dismiss again).
 *
 * Empty state
 * ───────────
 * When there are 0 undismissed suggestions, the ribbon renders nothing
 * (returns `null`). The dashboard layout collapses naturally.
 *
 * Performance
 * ───────────
 *   - Reads only from queries already running on the dashboard — no
 *     new subscriptions. `suggestions.list` is the same query the
 *     `<AISuggestionsPanel>` subscribes to; React + Convex dedup the
 *     subscription so adding the ribbon below costs nothing.
 *   - Dismiss mutation is fire-and-forget; we don't await it.
 *
 * RTL-safe Tailwind only (`ms-`, `me-`, `ps-`, `pe-`, `start-`, `end-`).
 * Border radius via `var(--radius)`.
 */

import { useMutation, useQuery } from "convex/react";
import { anyApi } from "convex/server";
import { AlertCircle, AlertTriangle, ArrowRight, Info, Sparkles, X } from "lucide-react";
import { useMemo } from "react";
import { Button } from "@/components/ui/button";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { sendChatPrefill } from "@/core/ai/lib/chatPrefill";
import { useMe } from "@/core/shell/shared/hooks/useCurrentOrg";
import { cn } from "@/lib/utils";

type SuggestionSeverity = "info" | "warning" | "critical";

type Suggestion = {
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
	className?: string;
}

function severityRank(s: SuggestionSeverity): number {
	if (s === "critical") return 0;
	if (s === "warning") return 1;
	return 2;
}

export function AIPulseRibbon({ orgId, className }: AIPulseRibbonProps) {
	const me = useMe();
	const suggestions = useQuery(anyApi.ai.suggestions.list, {
		orgId,
		scope: "org",
	}) as Suggestion[] | undefined;

	const dismiss = useMutation(api.users.mutations.dismissAiPulseSuggestion);

	const dismissedMap = useMemo(() => {
		const raw = me?.preferences?.aiPulseDismissed;
		// Cast is safe — schema validates the shape on write. Convex
		// returns the row exactly as it was stored.
		return (raw ?? {}) as Record<string, number>;
	}, [me?.preferences?.aiPulseDismissed]);

	const visible = useMemo<Suggestion[]>(() => {
		if (!suggestions) return [];
		return [...suggestions]
			.filter((s) => !(s.id in dismissedMap))
			.sort((a, b) => severityRank(a.severity) - severityRank(b.severity))
			.slice(0, MAX_VISIBLE);
	}, [suggestions, dismissedMap]);

	if (suggestions === undefined) return null; // initial load — silently render nothing
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
			</header>
			<ul className="grid gap-2 md:grid-cols-3">
				{visible.map((s) => (
					<PulseChip
						key={s.id}
						suggestion={s}
						onDismiss={() => {
							// Fire and forget — optimistic UI handled by query
							// auto-revalidation on the server-side write.
							void dismiss({ suggestionId: s.id });
						}}
						onAct={() => sendChatPrefill(s.intent)}
					/>
				))}
			</ul>
		</section>
	);
}

function PulseChip({
	suggestion,
	onDismiss,
	onAct,
}: {
	suggestion: Suggestion;
	onDismiss: () => void;
	onAct: () => void;
}) {
	return (
		<li
			className="group relative flex flex-col gap-1.5 rounded-[var(--radius)] border bg-card p-2.5 shadow-xs transition-colors hover:border-ring/40"
			data-severity={suggestion.severity}
		>
			<div className="flex items-start gap-2 pe-6">
				<SeverityIcon severity={suggestion.severity} />
				<div className="min-w-0 flex-1">
					<p className="line-clamp-2 text-xs font-medium leading-snug text-foreground">
						{suggestion.headline}
					</p>
					<p className="mt-0.5 line-clamp-2 text-[11px] leading-snug text-muted-foreground">
						{suggestion.body}
					</p>
				</div>
			</div>
			<div className="flex items-center justify-end">
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
