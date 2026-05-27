"use client";

/**
 * core/ai/components/ChatLandingPane.tsx
 *
 * Stage 3-A 3A.1 — Replaces the static "Bot icon + tagline" empty state
 * the chat panel showed when no conversation was active. The senior-CRM
 * specialist promise (per `AI-AGENT-CAPABILITY-AUDIT.md §6`) is "the AI
 * already knows what to do next when you sit down at your desk." This
 * pane is that promise, made visible:
 *
 *   1. **Greeting + last visit context** — friendly hook, plus the entity
 *      route the user was on the last time they opened the panel (so
 *      they can pick up exactly where they left off). RTL-safe.
 *   2. **Today's pulse** — one-paragraph briefing from
 *      `api.ai.briefingsPublic.todayForUser`. Already cached by the
 *      cron-driven daily refresh; if missing we surface the time the
 *      next briefing is scheduled instead of an empty card.
 *   3. **Top 3 next actions** — the highest-confidence rows from the
 *      Stage-6 `aiNextActions` ranker. Each row carries Act / Snooze /
 *      Dismiss buttons that all route through the existing
 *      `nextActions.dismissNextAction` + `nextActions.snoozeNextAction`
 *      mutations. "Act" prefills the chat with the row's
 *      `suggestedIntent` AND auto-sends — see decision row #27 in
 *      `AGENTS.md`.
 *   4. **Recent conversations** — chips that swap the active thread.
 *      Driven by the parent's already-loaded `conversations` array
 *      (zero new subscription cost — performance rule applies).
 *   5. **Proactive prompts** — three handcrafted intent chips that
 *      auto-send. Mirrors the dashboard QuickComposer's bottom row so
 *      the affordance feels consistent across surfaces.
 *
 * Layout decisions
 * ────────────────
 *   - Single column inside a ScrollArea (the parent already wraps the
 *     panel in a ScrollArea — we don't double-nest, we render flat).
 *   - All radii via `rounded-[var(--radius)]` per AGENTS.md.
 *   - Tailwind directional classes use `ms-/me-/ps-/pe-/start-/end-`.
 *   - When data hasn't loaded yet we show shadcn `<Skeleton>` blocks,
 *     never a plain "Loading…" string. Convex queries return `undefined`
 *     while in flight — the parent should still render this pane (the
 *     skeletons make the empty pane feel reactive instead of frozen).
 *
 * Why we don't fire a redundant `conversations.list` query here
 * ──────────────────────────────────────────────────────────────
 * AGENTS.md performance rule: "identity / list data is layout-level, no
 * per-card subscriptions." The parent ChatSheet already loads
 * conversations through `useAIChat({...})`. Threading it down as a prop
 * keeps the Convex subscription count flat — the ribbon on the
 * dashboard, the sidebar's history dropdown, and this landing pane all
 * share one query.
 */

import { useMutation, useQuery } from "convex/react";
import {
	BellOffIcon,
	CalendarClockIcon,
	CheckIcon,
	ClockIcon,
	HourglassIcon,
	MessageSquareTextIcon,
	Sparkles,
	TrendingUpIcon,
	XIcon,
} from "lucide-react";
import { useMemo } from "react";
import { Button } from "@/components/ui/button";
import { FirstTimeTour, type TourStep } from "@/components/ui/first-time-tour";
import { Skeleton } from "@/components/ui/skeleton";
import { api } from "@/convex/_generated/api";
import type { Doc, Id } from "@/convex/_generated/dataModel";
import { useMe } from "@/core/shell/shared/hooks/useCurrentOrg";
import { cn } from "@/lib/utils";

// ─── Static prompts — local to this file ────────────────────────────────
//
// We keep these in lock-step with the dashboard QuickComposer so a user
// sees the same suggestions both on the dashboard pinned composer AND
// inside the chat panel landing. Lifting them to a shared module was
// considered and rejected — they're three strings, both surfaces benefit
// from owning their own copy when the surfaces eventually diverge
// (e.g. landing-pane prompts that lean into "what changed today" vs
// dashboard prompts that lean into "what to do next"). Adding the
// indirection now would obscure intent for negligible DRY win.
const SUGGESTED_PROMPTS = [
	"Summarise what changed in my workspace today",
	"Which leads should I follow up with first?",
	"Draft a follow-up note for my hottest deal",
];

// ─── Helpers ─────────────────────────────────────────────────────────────

/**
 * Map a confidence label to a Tailwind colour pair. Single source of
 * truth — the AIPulseRibbon renders the same chip styles. Centralising
 * the map keeps both surfaces visually consistent without coupling
 * their components.
 */
export function confidenceTone(c: "high" | "medium" | "low"): string {
	if (c === "high") return "bg-primary/10 text-primary";
	if (c === "medium") return "bg-amber-500/10 text-amber-600 dark:text-amber-400";
	return "bg-muted text-muted-foreground";
}

/** Pick a section icon for a next-action row. Mirrors AIPulseRibbon's
 * recordKind→headline shape so users learn one mental model. */
function recordIcon(recordKind: string) {
	const cls = "size-3.5 shrink-0";
	if (recordKind === "reminder") return <HourglassIcon className={cn(cls, "text-amber-600")} />;
	if (recordKind === "deal") return <TrendingUpIcon className={cn(cls, "text-emerald-600")} />;
	return <Sparkles className={cn(cls, "text-primary")} />;
}

function relativeAbs(ms: number): string {
	const diff = Math.abs(Date.now() - ms);
	const day = 24 * 60 * 60 * 1000;
	if (diff < 60 * 1000) return "just now";
	if (diff < 60 * 60 * 1000) return `${Math.round(diff / 60000)}m ago`;
	if (diff < day) return `${Math.round(diff / 3_600_000)}h ago`;
	if (diff < 7 * day) return `${Math.round(diff / day)}d ago`;
	return new Date(ms).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

/** Test-only export — exercised by `ChatLandingPane.test.ts`. */
export const __test = { confidenceTone, relativeAbs, SUGGESTED_PROMPTS };

// ─── Component ───────────────────────────────────────────────────────────

interface RouteContextLite {
	name?: string;
	personCode?: string;
	dealCode?: string;
}

interface ChatLandingPaneProps {
	orgId: Id<"orgs">;
	/** Already-loaded conversations from the parent's `useAIChat`. */
	conversations: Doc<"aiConversations">[];
	/** Parent's `setConversationId` — chip click sets the active thread. */
	onSelectConversation: (id: Id<"aiConversations">) => void;
	/** Parent's `handleSend` — used by Act + suggested-prompt chips for
	 * auto-send (the user expects the AI to act, not just prefill the
	 * textarea). */
	onSend: (body: string) => void | Promise<void>;
	/** Optional entity context — when present, we surface a "Last
	 * visited" line so the user can re-anchor on the same record. */
	routeContext?: RouteContextLite | null;
}

export function ChatLandingPane({
	orgId,
	conversations,
	onSelectConversation,
	onSend,
	routeContext,
}: ChatLandingPaneProps) {
	const me = useMe();

	// Briefing — already cached server-side by the daily cron. Read-only.
	const briefing = useQuery(api.ai.briefingsPublic.todayForUser, { orgId });

	// Top-3 next actions — Stage 6 ranker. Returns
	// { count, generatedAt, rows: [{ id, recordKind, recordCode,
	// confidence, reasonText, suggestedIntent, ... }] }.
	const nextActions = useQuery(api.ai.queries.nextActions.listForUser, {
		orgId,
		limit: 3,
	});

	const dismissAction = useMutation(api.ai.queries.nextActions.dismissNextAction);
	const snoozeAction = useMutation(api.ai.queries.nextActions.snoozeNextAction);

	// Top-3 recent threads from the parent's already-loaded list. Drop
	// archived/deleted ones (the parent's query already filters
	// `status !== "deleted"` but archived rows DO come through; the
	// landing-pane chip section is a "pick up where you left off"
	// affordance and archived chats are intentionally hidden).
	const recentThreads = useMemo(
		() => conversations.filter((c) => c.status === "active").slice(0, 3),
		[conversations],
	);

	const greetingName = (me?.name ?? "").trim() || "there";

	const briefingState: "loading" | "empty" | "ready" =
		briefing === undefined ? "loading" : briefing === null ? "empty" : "ready";
	const nextActionsState: "loading" | "empty" | "ready" =
		nextActions === undefined ? "loading" : nextActions.count === 0 ? "empty" : "ready";

	return (
		<div className="flex flex-col gap-5 px-4 py-5">
			{/* ── 1. Greeting ─────────────────────────────────────────── */}
			<header className="flex flex-col gap-1">
				<div className="flex items-center gap-2">
					<span
						aria-hidden
						className="flex size-7 items-center justify-center rounded-[var(--radius)] bg-primary/10 text-primary"
					>
						<Sparkles className="size-3.5" />
					</span>
					<p className="text-sm font-semibold leading-tight">
						Welcome back, {greetingName} 👋
					</p>
				</div>
				{routeContext && (
					<p className="text-xs text-muted-foreground ps-9">
						Last visited:{" "}
						<span className="font-medium text-foreground">
							{routeContext.name ?? routeContext.personCode ?? routeContext.dealCode}
						</span>
					</p>
				)}
			</header>

			{/* ── 2. Today's pulse ────────────────────────────────────── */}
			<section data-tour="landing-pulse" className="flex flex-col gap-2">
				<h3 className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
					Today's pulse
				</h3>
				{briefingState === "loading" && (
					<div className="flex flex-col gap-1.5">
						<Skeleton className="h-3 w-full" />
						<Skeleton className="h-3 w-4/5" />
					</div>
				)}
				{briefingState === "empty" && (
					<p className="rounded-[var(--radius)] border border-dashed bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
						<ClockIcon className="me-1.5 inline size-3" />
						Your morning briefing arrives once your workspace has fresh activity.
					</p>
				)}
				{briefingState === "ready" && briefing && (
					<p className="text-xs leading-relaxed text-foreground">{briefing.summary}</p>
				)}
			</section>

			{/* ── 3. Top 3 next actions ────────────────────────────────── */}
			<section data-tour="landing-actions" className="flex flex-col gap-2">
				<h3 className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
					Top 3 next actions
				</h3>
				{nextActionsState === "loading" && (
					<div className="flex flex-col gap-2">
						{[0, 1, 2].map((i) => (
							<Skeleton key={i} className="h-16 w-full rounded-[var(--radius)]" />
						))}
					</div>
				)}
				{nextActionsState === "empty" && (
					<p className="rounded-[var(--radius)] border border-dashed bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
						<BellOffIcon className="me-1.5 inline size-3" />
						No outstanding actions right now — the AI re-ranks as your workspace
						changes.
					</p>
				)}
				{nextActionsState === "ready" && nextActions && (
					<ul className="flex flex-col gap-2">
						{nextActions.rows.map((row) => (
							<li
								key={row.id}
								className="flex flex-col gap-2 rounded-[var(--radius)] border bg-card px-3 py-2"
							>
								<div className="flex items-start gap-2">
									{recordIcon(row.recordKind)}
									<div className="min-w-0 flex-1">
										<p className="text-xs font-medium leading-snug">
											{row.recordCode} · {row.reasonText}
										</p>
									</div>
									<span
										className={cn(
											"shrink-0 rounded-[var(--radius)] px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide",
											confidenceTone(row.confidence),
										)}
									>
										{row.confidence}
									</span>
								</div>
								<div className="flex items-center justify-end gap-1">
									<Button
										type="button"
										size="sm"
										variant="outline"
										className="h-6 gap-1 px-2 text-[11px]"
										onClick={() =>
											snoozeAction({
												orgId,
												actionId: row.id,
												days: 7,
											})
										}
										aria-label="Snooze 7 days"
									>
										<ClockIcon className="size-3" />
										Snooze
									</Button>
									<Button
										type="button"
										size="sm"
										variant="ghost"
										className="h-6 gap-1 px-2 text-[11px] text-muted-foreground"
										onClick={() => dismissAction({ orgId, actionId: row.id })}
										aria-label="Dismiss action"
									>
										<XIcon className="size-3" />
										Dismiss
									</Button>
									<Button
										type="button"
										size="sm"
										className="h-6 gap-1 px-2 text-[11px]"
										onClick={() => void onSend(row.suggestedIntent)}
										aria-label="Take action"
									>
										<CheckIcon className="size-3" />
										Act
									</Button>
								</div>
							</li>
						))}
					</ul>
				)}
			</section>

			{/* ── 4. Recent conversations ─────────────────────────────── */}
			{recentThreads.length > 0 && (
				<section className="flex flex-col gap-2">
					<h3 className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
						Recent conversations
					</h3>
					<ul className="flex flex-wrap gap-1.5">
						{recentThreads.map((c) => {
							const title = (c.title ?? "").trim() || "Untitled";
							return (
								<li key={c._id}>
									<button
										type="button"
										onClick={() => onSelectConversation(c._id)}
										className="inline-flex max-w-[220px] items-center gap-1.5 rounded-[var(--radius)] border bg-card px-2.5 py-1 text-[11px] hover:border-ring/40 hover:bg-accent/40"
										title={title}
									>
										<MessageSquareTextIcon className="size-3 text-muted-foreground" />
										<span className="truncate">{title}</span>
										<span className="shrink-0 text-muted-foreground/80">
											· {relativeAbs(c.lastMessageAt ?? c._creationTime)}
										</span>
									</button>
								</li>
							);
						})}
					</ul>
				</section>
			)}

			{/* ── 5. Proactive prompts ─────────────────────────────────── */}
			<section data-tour="landing-chips" className="flex flex-col gap-2">
				<h3 className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
					Try asking
				</h3>
				<ul className="flex flex-col gap-1.5">
					{SUGGESTED_PROMPTS.map((prompt) => (
						<li key={prompt}>
							<button
								type="button"
								onClick={() => void onSend(prompt)}
								className="inline-flex w-full items-center gap-2 rounded-[var(--radius)] border border-dashed bg-muted/40 px-3 py-2 text-start text-xs text-muted-foreground transition-colors hover:border-solid hover:bg-muted hover:text-foreground"
							>
								<CalendarClockIcon className="size-3.5 shrink-0" />
								<span className="flex-1">{prompt}</span>
							</button>
						</li>
					))}
				</ul>
			</section>

			{/* First-time coachmark — fires once per device. Bump the id
			    (`v1` → `v2`) to re-show after meaningful step changes. */}
			<FirstTimeTour id="chat-landing-v1" steps={CHAT_LANDING_TOUR_STEPS} />
		</div>
	);
}

// ─── First-time tour steps — module scope so the array reference is stable ──
//
// Per AGENTS.md FirstTimeTour rules: bump the tour id (`v1` → `v2`) when
// these steps change meaningfully so users see the updated copy.
const CHAT_LANDING_TOUR_STEPS: TourStep[] = [
	{
		target: "landing-pulse",
		title: "Today's pulse",
		body: "Your morning briefing lives here — a one-paragraph summary of what changed in your workspace today.",
	},
	{
		target: "landing-actions",
		title: "Top 3 next actions",
		body: "These are the highest-priority things waiting for you. Click Act to ask the AI to handle one.",
	},
	{
		target: "landing-chips",
		title: "Quick prompts",
		body: "Tap one of these to ask me to summarise, prioritise, or draft right away.",
	},
];
