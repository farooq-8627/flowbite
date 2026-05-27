"use client";

/**
 * core/ai/components/results/ToolSummaryCard.tsx
 *
 * P1.9 (`PHASE-3-AI-AUDIT.md §5 Phase 4 Part 1`) — rich tool-result
 * envelope rendered above the live entity card. Solves the 2026-05-24
 * "lead created with empty values, just a green tick" bug by giving
 * every successful commit_* tool a structured summary the user reads
 * before the entity card.
 *
 * Layout:
 *
 *   ┌──────────────────────────────────────────────────┐
 *   │  ✓ Created lead L-014: Sarah Khan                │  ← headline
 *   ├──────────────────────────────────────────────────┤
 *   │  Name             Sarah Khan                     │
 *   │  Email            sarah@example.com              │  ← table
 *   │  Phone            +1 (555) 123 4567              │
 *   │  Company size     51-200                         │
 *   │  Industry         SaaS                           │
 *   ├──────────────────────────────────────────────────┤
 *   │  • Tag #hot was applied                          │  ← facts
 *   │  • Lead has been assigned to you                 │
 *   ├──────────────────────────────────────────────────┤
 *   │  [Add follow-up] [Log a call] [Convert]          │  ← chips
 *   └──────────────────────────────────────────────────┘
 *
 * Backwards compat: when a tool doesn't return `summary`, the card is
 * not rendered. The TimelineRow falls back to its existing structured
 * display rendering.
 *
 * RTL-safe: all directional spacing uses logical properties (`ms-`,
 * `me-`, `ps-`, `pe-`).
 */

import { CheckCircle2, ChevronRight, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

// Local restatement of the backend type — same approach as
// `ToolResultRenderer.ToolDisplay` to avoid a frontend ↔ Convex
// cross-import that would pull Convex into the bundle.

export type ToolSummaryRow = {
	label: string;
	value: string;
	emphasis?: "added" | "changed" | "unchanged";
};

export type ToolSummarySuggestion = {
	label: string;
	intent: string;
};

export type ToolSummary = {
	headline: string;
	table?: ToolSummaryRow[];
	facts?: string[];
	suggestedNext?: ToolSummarySuggestion[];
	cardFields?: string[];
};

type ToolSummaryCardProps = {
	summary: ToolSummary;
	/**
	 * Optional click handler for suggestion chips. When provided, the
	 * chip click pre-fills the composer with the suggestion's intent.
	 * When undefined, the chips are rendered but the click is a no-op
	 * (e.g. when the panel is rendered outside a chat context).
	 */
	onSuggestionClick?: (intent: string) => void;
};

export function ToolSummaryCard({ summary, onSuggestionClick }: ToolSummaryCardProps) {
	const hasTable = summary.table && summary.table.length > 0;
	const hasFacts = summary.facts && summary.facts.length > 0;
	const hasSuggestions = summary.suggestedNext && summary.suggestedNext.length > 0;

	return (
		<div
			className={cn(
				"w-full max-w-full min-w-0 rounded-[var(--radius)] border border-emerald-200 dark:border-emerald-900",
				"bg-emerald-50/50 dark:bg-emerald-950/20",
				"divide-y divide-emerald-200/60 dark:divide-emerald-900/60",
			)}
		>
			{/* Headline */}
			<div className="flex items-center gap-2 px-3 py-2 text-sm font-medium text-emerald-900 dark:text-emerald-100">
				<CheckCircle2 className="size-4 flex-none text-emerald-600 dark:text-emerald-400" />
				<span className="break-words">{summary.headline}</span>
			</div>

			{/* Field/value table */}
			{hasTable && (
				<dl className="grid grid-cols-[max-content_1fr] gap-x-3 gap-y-1 px-3 py-2 text-xs">
					{summary.table?.map((row, idx) => (
						<RowInner
							// biome-ignore lint/suspicious/noArrayIndexKey: tool emitters can repeat row labels (e.g. two rows whose label is a time like "10:43"); RowInner is stateless and the array is rebuilt fresh per tool result
							key={`row-${idx}-${row.label}`}
							row={row}
						/>
					))}
				</dl>
			)}

			{/* Facts (bulleted observations) */}
			{hasFacts && (
				<ul className="px-3 py-2 text-xs space-y-0.5 list-none">
					{summary.facts?.map((fact, idx) => (
						<li
							// biome-ignore lint/suspicious/noArrayIndexKey: facts are plain strings that may legitimately repeat; the <li> is stateless presentational markup
							key={`fact-${idx}-${fact}`}
							className="flex items-start gap-1.5 text-foreground/80"
						>
							<span
								aria-hidden
								className="mt-1 size-1 rounded-full bg-foreground/40 flex-none"
							/>
							<span className="break-words">{fact}</span>
						</li>
					))}
				</ul>
			)}

			{/* Suggested-next chips */}
			{hasSuggestions && (
				<div className="flex flex-wrap items-center gap-1.5 px-3 py-2">
					<Sparkles className="size-3 text-emerald-600 dark:text-emerald-400 flex-none" />
					<span className="me-1 text-[11px] font-medium text-emerald-900 dark:text-emerald-100">
						Next:
					</span>
					{summary.suggestedNext?.map((s, idx) => (
						<Button
							// biome-ignore lint/suspicious/noArrayIndexKey: suggestion intents/labels can repeat across emissions; the chip is a stateless button so an index-based composite key is safe
							key={`s-${idx}-${s.intent}-${s.label}`}
							size="sm"
							variant="outline"
							className={cn(
								"h-7 rounded-full px-2.5 text-xs",
								"border-emerald-300/70 dark:border-emerald-800",
								"bg-background/60 hover:bg-background",
							)}
							onClick={() => onSuggestionClick?.(s.intent)}
							disabled={!onSuggestionClick}
						>
							{s.label}
							<ChevronRight aria-hidden className="size-3 ms-0.5" />
						</Button>
					))}
				</div>
			)}
		</div>
	);
}

function RowInner({ row }: { row: ToolSummaryRow }) {
	const emphasisClass =
		row.emphasis === "changed"
			? "text-amber-700 dark:text-amber-400"
			: row.emphasis === "unchanged"
				? "text-muted-foreground"
				: "text-foreground";
	return (
		<>
			<dt className="text-muted-foreground font-medium me-1 break-words">{row.label}</dt>
			<dd className={cn("break-words", emphasisClass)}>{row.value || "—"}</dd>
		</>
	);
}
