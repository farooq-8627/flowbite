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
 * RTL-safe: all directional spacing uses logical properties (`ms-`,
 * `me-`, `ps-`, `pe-`).
 */

import { useQuery } from "convex/react";
import { anyApi } from "convex/server";
import { AlertCircle, AlertTriangle, ArrowRight, Info, Sparkles } from "lucide-react";
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
		// Don't render the empty case — saves vertical space on a quiet
		// workspace. Parent can decide to render a placeholder if needed.
		return null;
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
