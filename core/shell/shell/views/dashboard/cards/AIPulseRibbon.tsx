"use client";

/**
 * AIPulseRibbon — Stage 6 (SPRINT-PLAN.md / AI-AGENT-CAPABILITY-AUDIT.md
 * §2.1 Milestone B).
 *
 * Top-3 highest-value next actions, dismissible per-user, rendered ABOVE
 * the metric strip. Stage 6 evolves the Stage 5 ribbon to read from the
 * materialised `aiNextActions` ranking (rebuilt reactively on every
 * relevant lead/deal/task mutation — see `nextActionsTrigger.ts`) so
 * each row carries a stable score + explicit confidence label (Stage 6
 * closes capability-audit gap T-4 by surfacing confidence on every
 * suggestion).
 *
 * Merged sources (single proactive surface)
 * ───────────────────────────────────────────
 *   1. `convex.ai.queries.nextActions:listForUser` — the ranked store
 *      (per-user, assignment-driven). Covers reminders, stale leads,
 *      stuck deals, high-value deal stalls. Each row has `score (0-100)`,
 *      `confidence (high|medium|low)` and a chat-prefill `suggestedIntent`.
 *   2. `convex.ai.suggestions:list` (scope "org") — the heuristic engine,
 *      now MERGED IN permanently (not just a cold-start fallback). It
 *      carries org-level signals the per-user ranker can't see (e.g. a
 *      stale lead owned by a teammate). This folds the old standalone
 *      "AI suggestions" panel into this one surface.
 *
 * Both sources are permission-scoped SERVER-SIDE: `listForUser` only
 * returns record kinds the member may view (leads/deals/tasks/contacts/
 * companies), and `suggestions:list` gates each category the same way.
 * The client merge dedupes — an anchored heuristic suggestion is dropped
 * when a ranked row already covers the same record; anchorless org
 * aggregates (e.g. "N leads untouched") are always kept. Results are
 * sorted most-urgent-first and capped at `MAX_VISIBLE`; the exhaustive
 * list lives at `/ai/next-actions`.
 *
 * Collapse: the header bar is a per-user collapse toggle (persisted in
 * `users.preferences.dashboardSectionsCollapsed.aiPulse`) mirroring the
 * AICockpitSection pattern, so the pulse can fold independently of the
 * whole cockpit. Confidence chip colours: high → primary, medium →
 * amber, low → muted.
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
	Loader2,
	Sparkles,
	X,
} from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useRef } from "react";
import { Button } from "@/components/ui/button";
import { APP_CONFIG } from "@/config/app-config";
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

// Merged surface (ranked next-actions + permission-scoped org signals)
// shows up to this many chips; the exhaustive ranked list lives at
// /ai/next-actions via the "All next actions" link.
const MAX_VISIBLE = 9;

// Cross-mount gate for `lazyWarmForUser` — sessionStorage so the cap is
// scoped to the current tab. The TTL matches the server's 60s rate-limit
// window. Without this gate, every dashboard remount (sidebar nav, tab
// blur/focus, route change back to `/`) re-fires the warm, blowing
// through the budget within seconds and producing a stream of "Too many
// requests" errors in the Convex log.
const LAZY_WARM_TTL_MS = 60_000;

function lazyWarmKey(orgId: string, userId: string): string {
	return `${APP_CONFIG.storagePrefix}:ai:lazyWarm:${orgId}:${userId}`;
}

function shouldFireLazyWarm(orgId: string, userId: string): boolean {
	if (typeof window === "undefined") return false;
	try {
		const last = window.sessionStorage.getItem(lazyWarmKey(orgId, userId));
		if (!last) return true;
		const elapsed = Date.now() - Number(last);
		return Number.isFinite(elapsed) && elapsed > LAZY_WARM_TTL_MS;
	} catch {
		// sessionStorage can throw in Safari private mode / SSR — fail
		// open and let the server limit handle it.
		return true;
	}
}

function markLazyWarmFired(orgId: string, userId: string): void {
	if (typeof window === "undefined") return;
	try {
		window.sessionStorage.setItem(lazyWarmKey(orgId, userId), String(Date.now()));
	} catch {
		// Ignore — see shouldFireLazyWarm.
	}
}

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

/**
 * Canonical key used to dedupe an org-wide heuristic suggestion against a
 * ranked row that already covers the same record. Reminders live in the
 * `tasks` table, so the ranked `reminder` kind normalises to `task` to
 * line up with the heuristic anchor's `entityType` ("task" / "deal").
 */
function rankedDedupeKey(recordKind: string, recordCode: string): string {
	const kind = recordKind === "reminder" ? "task" : recordKind;
	return `${kind}:${recordCode}`;
}

export function AIPulseRibbon({ orgId, orgSlug, className }: AIPulseRibbonProps) {
	const me = useMe();
	const ranked = useQuery(api.ai.queries.nextActions.listForUser, {
		orgId,
		limit: 20,
	}) as RankedListResult | undefined;

	// Org-wide heuristic suggestions — always merged into the pulse (no
	// longer just a cold-start fallback). This is the surface that
	// replaced the standalone "AI suggestions" panel: it carries
	// org-level signals the per-user ranker can't see. The server gates
	// each category by the member's view permissions, so this only ever
	// returns categories the role is allowed to see.
	const fallbackSuggestions = useQuery(anyApi.ai.suggestions.list, {
		orgId,
		scope: "org",
	}) as FallbackSuggestion[] | undefined;

	const dismissRanked = useMutation(api.ai.queries.nextActions.dismissNextAction);
	const dismissFallback = useMutation(api.users.mutations.dismissAiPulseSuggestion);

	// Per-user collapse state for the merged pulse — mirrors the
	// AICockpitSection toggle but scoped to just this surface so the user
	// can fold the pulse without folding the whole cockpit. Persisted in
	// `users.preferences.dashboardSectionsCollapsed.aiPulse`.
	const setCollapsed = useMutation(api.users.mutations.setDashboardSectionCollapsed);
	const collapsed = me?.preferences?.dashboardSectionsCollapsed?.aiPulse === true;

	// Stage 3-A.4 — lazy-warm the ranked store when it's empty for this
	// user. The server enforces the rate-limit (5/min per user/org) but
	// we ALSO gate on the client so casual navigation between tabs
	// (which remounts this component and clears `warmRequestedRef`) does
	// not produce a torrent of mutations whose only purpose is to be
	// rejected. The client gate uses `sessionStorage` keyed by
	// `${orgId}:${userId}` with a 60s TTL — matches the server window.
	const lazyWarm = useMutation(api.ai.queries.nextActions.lazyWarmForUser);
	const warmRequestedRef = useRef(false);
	// Stage 7 hotfix (2026-05-29) — `isWarming` previously stayed true
	// FOREVER after the first lazy-warm fire whenever the user had zero
	// suggestions, because `warmRequestedRef.current` never reset and
	// `ranked.count` stayed at 0 after a clean rebuild. The ribbon got
	// stuck showing "Refreshing AI suggestions…" indefinitely (user
	// reported 2026-05-29). Fix: include `generatedAt === null` in the
	// gate — once the rebuild lands `generatedAt` flips from null to a
	// timestamp, so we know the warm completed and the empty state is
	// the legitimate result, not a still-pending refresh.
	const isWarming =
		ranked !== undefined &&
		ranked.count === 0 &&
		ranked.generatedAt === null &&
		warmRequestedRef.current;

	useEffect(() => {
		if (warmRequestedRef.current) return;
		if (ranked === undefined) return; // still loading
		if (ranked.count > 0) return; // already populated
		if (ranked.generatedAt !== null) return; // already generated, just empty (user dismissed all)
		if (!me?._id) return; // need a userId for the session-scoped gate
		warmRequestedRef.current = true;
		// Cross-mount gate: skip the network round-trip if we already
		// warmed within the last 60s (matches the server rate window).
		if (!shouldFireLazyWarm(orgId, me._id)) return;
		markLazyWarmFired(orgId, me._id);
		void lazyWarm({ orgId }).catch((err) => {
			// Server soft-fails on rate-limit now (returns
			// `{ scheduled: false, rateLimited: true }`), so this
			// catch only fires for genuine errors. Log them but don't
			// surface to the user — the ribbon's emptiness is its own
			// signal.
			if (typeof console !== "undefined") {
				console.warn("[AIPulseRibbon] lazyWarmForUser failed:", err);
			}
		});
	}, [ranked, lazyWarm, orgId, me?._id]);

	const dismissedMap = useMemo(() => {
		const raw = me?.preferences?.aiPulseDismissed;
		return (raw ?? {}) as Record<string, number>;
	}, [me?.preferences?.aiPulseDismissed]);

	const visible = useMemo<DisplayRow[]>(() => {
		const rows: DisplayRow[] = [];
		const rankedKeys = new Set<string>();

		// Source 1 — the ranked store (per-user, scored). The server
		// already permission-scopes which record kinds come back, so we
		// render whatever it returns. Track each row's canonical key so
		// the heuristic merge below can avoid double-listing the same
		// record.
		if (ranked && ranked.count > 0) {
			for (const r of ranked.rows) {
				const fingerprint = `${r.recordKind}:${r.recordCode}:${r.reasonCode}`;
				if (fingerprint in dismissedMap) continue;
				rankedKeys.add(rankedDedupeKey(r.recordKind, r.recordCode));
				rows.push({
					id: `ranked:${r.id}`,
					source: "ranked",
					headline: rankedToHeadline(r),
					body: r.reasonText,
					severity: confidenceToSeverity(r.confidence),
					confidence: r.confidence,
					intent: r.suggestedIntent,
					rankedActionId: r.id,
				});
			}
		}

		// Source 2 — org-wide heuristic suggestions, MERGED IN (not just a
		// cold-start fallback). This is what folds the old "AI suggestions"
		// panel into the single pulse: org-level signals the per-user
		// ranker can't see (e.g. stale leads owned by a teammate) still
		// surface here. The server gates each category by permission, so
		// anything present is already allowed for this role. Dedupe rule:
		// drop an anchored suggestion when a ranked row already covers the
		// same record; keep anchorless aggregates (e.g. the "N leads
		// untouched" rollup) which have no per-record ranked equivalent.
		if (fallbackSuggestions) {
			for (const s of fallbackSuggestions) {
				if (s.id in dismissedMap) continue;
				if (s.anchor && rankedKeys.has(`${s.anchor.entityType}:${s.anchor.code}`)) {
					continue;
				}
				rows.push({
					id: `fallback:${s.id}`,
					source: "fallback",
					headline: s.headline,
					body: s.body,
					severity: s.severity,
					intent: s.intent,
					fallbackSuggestionId: s.id,
				});
			}
		}

		// Most urgent first (critical → warning → info). The sort is
		// stable, so ranked rows keep their score order within a tier.
		rows.sort((a, b) => severityRank(a.severity) - severityRank(b.severity));
		return rows.slice(0, MAX_VISIBLE);
	}, [ranked, fallbackSuggestions, dismissedMap]);

	if (ranked === undefined && fallbackSuggestions === undefined) return null;
	// Stage 1 of DASHBOARD-V2-PLAN.md (2026-05-28) — single-line
	// spinner replaces the previous 3-row bar skeleton. The skeleton
	// shape implied 3 imminent suggestions when in reality the warm
	// might rebuild zero rows (a clean dashboard) — that produced a
	// "fake content" feel the user flagged. The spinner is honest:
	// "AI is refreshing", followed by the actual ribbon (or nothing
	// when there's nothing to suggest).
	if (isWarming && (fallbackSuggestions === undefined || fallbackSuggestions.length === 0)) {
		return (
			<section
				aria-label="AI pulse, refreshing"
				className={cn(
					"flex items-center gap-2 rounded-[var(--radius)] border border-primary/30 bg-gradient-to-br from-primary/5 via-card to-card px-3 py-2",
					className,
				)}
			>
				<span
					aria-hidden
					className="flex size-6 items-center justify-center rounded-[var(--radius)] bg-primary/10 text-primary"
				>
					<Sparkles className="size-3.5" />
				</span>
				<Loader2 className="size-3.5 animate-spin text-muted-foreground" aria-hidden />
				<span className="text-xs text-muted-foreground">Refreshing AI suggestions…</span>
			</section>
		);
	}
	// Stage 7 (2026-05-29) — strong empty state replaces the previous
	// silent `return null`. When the ranker completes with zero rows
	// AND the heuristic engine has no fallback suggestions either, we
	// surface a small "Your AI co-pilot is ready" card explaining what
	// the ribbon will show once data exists. The user explicitly asked
	// for this (2026-05-29): "show AI widgets properly with proper
	// state and UX so people will get what actually we are providing
	// in the platform — instead of just gating on data".
	if (visible.length === 0) {
		return (
			<section
				aria-label="AI pulse, ready"
				className={cn(
					"flex items-start gap-3 rounded-[var(--radius)] border border-primary/30 bg-gradient-to-br from-primary/5 via-card to-card p-3",
					className,
				)}
			>
				<span
					aria-hidden
					className="flex size-8 shrink-0 items-center justify-center rounded-[var(--radius)] bg-primary/10 text-primary"
				>
					<Sparkles className="size-4" />
				</span>
				<div className="flex flex-1 flex-col gap-0.5">
					<p className="text-sm font-semibold text-foreground">
						Your AI co-pilot is ready
					</p>
					<p className="text-xs text-muted-foreground">
						As you add leads, deals, and tasks, the top 3 highest-value next actions
						will appear here — re-engage stale leads, push stuck deals, follow up on
						overdue reminders.
					</p>
				</div>
				<Button
					asChild
					size="sm"
					variant="outline"
					className="h-7 shrink-0 gap-1 self-center text-xs"
				>
					<Link href={`/${orgSlug}/leads`}>
						Add a lead
						<ArrowRight className="size-3" aria-hidden />
					</Link>
				</Button>
			</section>
		);
	}

	return (
		<section
			aria-label="AI pulse: top suggestions for you"
			className={cn(
				"flex flex-col gap-2 rounded-[var(--radius)] border border-primary/30 bg-gradient-to-br from-primary/5 via-card to-card p-3",
				className,
			)}
		>
			<header className="flex items-center gap-2">
				{/* The icon + title + count form the collapse toggle —
				    mirrors AICockpitSection (whole bar toggles, no chevron;
				    `aria-expanded` conveys state). The "All next actions"
				    link is a sibling, not nested, so clicking it navigates
				    without toggling. */}
				<button
					type="button"
					onClick={() => void setCollapsed({ section: "aiPulse", collapsed: !collapsed })}
					className="flex flex-1 cursor-pointer items-center gap-2 text-start"
					aria-expanded={!collapsed}
					aria-controls="ai-pulse-body"
				>
					<span
						aria-hidden
						className="flex size-6 items-center justify-center rounded-[var(--radius)] bg-primary/10 text-primary"
					>
						<Sparkles className="size-3.5" />
					</span>
					<h3 className="text-xs font-semibold uppercase tracking-wide text-foreground">
						AI Pulse
					</h3>
					<span className="text-[10px] uppercase tracking-wide text-muted-foreground/70">
						Top {visible.length}
					</span>
				</button>
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
			<ul
				id="ai-pulse-body"
				className={cn("grid grid-cols-1 gap-2 md:grid-cols-3", collapsed && "hidden")}
			>
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
