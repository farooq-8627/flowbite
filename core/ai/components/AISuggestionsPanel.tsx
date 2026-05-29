"use client";

/**
 * core/ai/components/AISuggestionsPanel.tsx
 *
 * Phase 4 Part 1 P1.14 (`PHASE-3-AI-AUDIT.md §5`) — proactive AI
 * suggestions panel. Mounted on the dashboard (org scope) and on entity
 * detail pages (entity scope). Reads from the pure-heuristic
 * `convex.ai.suggestions.list` query — NO model calls, no token cost.
 *
 * Each suggestion card shows:
 *   - severity dot (rose for critical, amber for warning, sky for info)
 *   - headline
 *   - body
 *   - "Take action" CTA that opens the chat with the suggestion's
 *     `intent` pre-filled in the composer (via `onTakeAction` callback)
 *
 * Empty state (2026-05-30) — used to be `return null` so the panel
 * disappeared on quiet workspaces. The AI Pulse Ribbon now covers the
 * "top 3 things to do" surface higher up the page, but the suggestions
 * panel staying silent left a gap on detail pages and on workspaces
 * where the ribbon is dismissed. The panel now renders a calm
 * "All clear" card with a couple of helpful next-step CTAs that hand
 * off to the chat panel via `onTakeAction`. The visual weight is light
 * (dashed border, muted background) so a healthy workspace doesn't
 * feel like it's being shouted at.
 *
 * RTL-safe: all directional spacing uses logical properties (`ms-`,
 * `me-`, `ps-`, `pe-`).
 */

import { useQuery } from "convex/react";
import { anyApi } from "convex/server";
import { AlertCircle, AlertTriangle, ArrowRight, CheckCircle2, Info, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { Id } from "@/convex/_generated/dataModel";
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

interface AISuggestionsPanelProps {
	orgId: Id<"orgs">;
	scope: "org" | "entity";
	entityType?: string;
	entityCode?: string;
	/** Called when the user clicks "Take action" — typically opens the chat with the intent prefilled. */
	onTakeAction?: (intent: string) => void;
	className?: string;
}

export function AISuggestionsPanel({
	orgId,
	scope,
	entityType,
	entityCode,
	onTakeAction,
	className,
}: AISuggestionsPanelProps) {
	const suggestions = useQuery(anyApi.ai.suggestions.list, {
		orgId,
		scope,
		entityType,
		entityCode,
	}) as Suggestion[] | undefined;

	if (suggestions === undefined) {
		// Loading — render a tiny skeleton row so layout doesn't jump.
		return (
			<div
				className={cn(
					"rounded-[var(--radius)] border border-border bg-muted/30 px-3 py-3",
					className,
				)}
			>
				<div className="flex items-center gap-2 text-xs text-muted-foreground">
					<Sparkles className="h-3.5 w-3.5 animate-pulse" aria-hidden />
					Looking for next steps…
				</div>
			</div>
		);
	}

	if (suggestions.length === 0) {
		return (
			<AISuggestionsEmpty
				scope={scope}
				entityType={entityType}
				onTakeAction={onTakeAction}
				className={className}
			/>
		);
	}

	return (
		<section
			className={cn("rounded-[var(--radius)] border border-border bg-card", className)}
			aria-label="AI suggestions"
		>
			<header className="flex items-center gap-2 border-b border-border/60 px-3 py-2">
				<Sparkles className="h-3.5 w-3.5 text-primary" aria-hidden />
				<h3 className="text-xs font-medium text-foreground">AI suggestions</h3>
				<span className="ms-auto text-[10px] uppercase tracking-wide text-muted-foreground/70">
					{scope === "org" ? "Workspace" : "This record"}
				</span>
			</header>
			<ul className="divide-y divide-border/50">
				{suggestions.map((s) => (
					<li
						key={s.id}
						className="flex items-start gap-2.5 px-3 py-2.5"
						data-severity={s.severity}
					>
						<SeverityIcon severity={s.severity} />
						<div className="flex-1 min-w-0">
							<p className="text-sm font-medium text-foreground line-clamp-2">
								{s.headline}
							</p>
							<p className="mt-0.5 text-xs text-muted-foreground line-clamp-2">
								{s.body}
							</p>
						</div>
						<Button
							size="sm"
							variant="ghost"
							className="h-7 gap-1 text-xs"
							onClick={() => onTakeAction?.(s.intent)}
						>
							Ask AI
							<ArrowRight className="h-3 w-3" aria-hidden />
						</Button>
					</li>
				))}
			</ul>
		</section>
	);
}

function SeverityIcon({ severity }: { severity: SuggestionSeverity }) {
	if (severity === "critical") {
		return (
			<AlertCircle
				className="mt-0.5 h-4 w-4 flex-shrink-0 text-rose-500"
				aria-label="Critical"
			/>
		);
	}
	if (severity === "warning") {
		return (
			<AlertTriangle
				className="mt-0.5 h-4 w-4 flex-shrink-0 text-amber-500"
				aria-label="Warning"
			/>
		);
	}
	return <Info className="mt-0.5 h-4 w-4 flex-shrink-0 text-sky-500" aria-label="Info" />;
}

// ─── Empty state ────────────────────────────────────────────────────────────

interface AISuggestionsEmptyProps {
	scope: "org" | "entity";
	entityType?: string;
	onTakeAction?: (intent: string) => void;
	className?: string;
}

/**
 * Calm "All clear" card. Avoids the previous `return null` pattern so:
 *
 *   1. Detail pages (Profile / Deal / etc.) explicitly confirm the AI
 *      checked the record and found nothing flagged — silence used to
 *      look indistinguishable from the panel never having loaded.
 *   2. The Settings → Appearance preview, e2e tests, and screenshot
 *      tooling have a deterministic empty render to assert against.
 *   3. Users who dismiss every AI Pulse Ribbon item still see a positive
 *      "you're caught up" surface in the AI Cockpit instead of a hole.
 *
 * Two CTAs: one for "what's next" planning, one for a daily review. Both
 * route through `onTakeAction` — the same prefill bridge the active
 * suggestions use — so behaviour is consistent across every state.
 */
function AISuggestionsEmpty({
	scope,
	entityType,
	onTakeAction,
	className,
}: AISuggestionsEmptyProps) {
	const isOrgScope = scope === "org";
	const headline = isOrgScope ? "You're all caught up" : "Nothing flagged on this record";
	const body = isOrgScope
		? "No urgent follow-ups, stuck deals, or overdue tasks right now. Ask the AI what to focus on next or run a quick review of the workspace."
		: `Looks healthy — no risks, missing fields, or stalled steps to address right now. Ask the AI to suggest a next step${
				entityType ? ` for this ${entityType}` : ""
			}.`;

	const primaryIntent = isOrgScope
		? "What should I focus on next? Look at the open pipeline, overdue tasks, and stuck leads, then suggest one concrete next action."
		: `Suggest one concrete next step for ${entityType ?? "this record"} — keep it actionable and short.`;
	const secondaryIntent = isOrgScope
		? "Run a quick review of the workspace today: any deals slipping, any leads going cold, any tasks at risk? Summarise in 3 bullets."
		: `Audit ${entityType ?? "this record"} for missing fields, stale activity, and unanswered messages. Reply in 3 bullets.`;

	return (
		<section
			className={cn(
				"rounded-[var(--radius)] border border-dashed border-border bg-muted/30 px-3 py-3",
				className,
			)}
			aria-label="AI suggestions — all clear"
			data-state="empty"
		>
			<header className="flex items-center gap-2">
				<CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" aria-hidden />
				<h3 className="text-xs font-medium text-foreground">AI suggestions</h3>
				<span className="ms-auto text-[10px] uppercase tracking-wide text-muted-foreground/70">
					{isOrgScope ? "Workspace" : "This record"}
				</span>
			</header>
			<p className="mt-2 text-sm font-medium text-foreground">{headline}</p>
			<p className="mt-0.5 text-xs text-muted-foreground">{body}</p>
			{onTakeAction ? (
				<div className="mt-2.5 flex flex-wrap items-center gap-2">
					<Button
						size="sm"
						variant="default"
						className="h-7 gap-1 text-xs"
						onClick={() => onTakeAction(primaryIntent)}
					>
						<Sparkles className="h-3 w-3" aria-hidden />
						Ask AI what's next
					</Button>
					<Button
						size="sm"
						variant="ghost"
						className="h-7 gap-1 text-xs"
						onClick={() => onTakeAction(secondaryIntent)}
					>
						{isOrgScope ? "Run a quick review" : "Audit this record"}
						<ArrowRight className="h-3 w-3" aria-hidden />
					</Button>
				</div>
			) : null}
		</section>
	);
}
