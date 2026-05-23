"use client";
/**
 * core/entities/shared/components/EntityAISummaryCard.tsx
 *
 * At-a-glance AI summary panel rendered on entity detail pages.
 *
 * Reads pre-computed `aiContext.summary` + `keyFacts` from the entity row —
 * the same data the AI chat panel pulls into its zero-token context card.
 * No LLM call here; this is a pure render of whatever the last
 * `rebuildEntityContext` job wrote.
 *
 * When `summary` is empty AND `keyFacts` is empty, the component renders
 * `null` — pages without context look identical to before.
 *
 * Visual language matches `core/ai/components/ChatContextCard.tsx`
 * (Sparkles icon, primary-tinted border) so the user recognises the
 * AI-curated content even when the chat panel is closed.
 */
import { ChevronDown, ChevronUp, Sparkles } from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/utils";

interface Props {
	summary?: string;
	keyFacts?: string[];
	lastUpdatedAt?: number;
	/** Default number of keyFacts to show before "Show more" expands. */
	initialFactCount?: number;
	/** Optional className override for the outer wrapper. */
	className?: string;
}

export function EntityAISummaryCard({
	summary,
	keyFacts,
	lastUpdatedAt,
	initialFactCount = 4,
	className,
}: Props) {
	const [expanded, setExpanded] = useState(false);

	const hasSummary = typeof summary === "string" && summary.trim().length > 0;
	const facts = (keyFacts ?? []).filter((f) => f && f.trim().length > 0);

	// Nothing to render — keep the page exactly as it was pre-Phase-3B.
	if (!hasSummary && facts.length === 0) return null;

	const visibleFacts = expanded ? facts : facts.slice(0, initialFactCount);
	const hasMore = facts.length > initialFactCount;

	return (
		<div
			className={cn(
				"rounded-[var(--radius)] border border-primary/30 bg-primary/5 p-3",
				className,
			)}
		>
			<div className="mb-2 flex items-center gap-2">
				<Sparkles className="size-3.5 shrink-0 text-primary" />
				<span className="text-[11px] font-semibold uppercase tracking-wide text-primary">
					AI summary
				</span>
				{lastUpdatedAt && (
					<span className="ms-auto text-[10px] tabular-nums text-muted-foreground">
						Updated {new Date(lastUpdatedAt).toLocaleDateString()}
					</span>
				)}
			</div>

			{hasSummary && (
				<p className="mb-2 text-xs leading-relaxed text-foreground">{summary}</p>
			)}

			{visibleFacts.length > 0 && (
				<ul className="space-y-1">
					{visibleFacts.map((fact) => (
						<li
							key={fact}
							className="flex items-start gap-1.5 text-[11px] text-muted-foreground"
						>
							<span
								aria-hidden
								className="mt-1.5 size-1 shrink-0 rounded-full bg-current"
							/>
							<span className="text-foreground">{fact}</span>
						</li>
					))}
				</ul>
			)}

			{hasMore && (
				<button
					type="button"
					onClick={() => setExpanded((v) => !v)}
					className="mt-2 flex items-center gap-1 text-[11px] font-medium text-primary hover:underline"
				>
					{expanded ? (
						<>
							<ChevronUp className="size-3" /> Show less
						</>
					) : (
						<>
							<ChevronDown className="size-3" /> Show{" "}
							{facts.length - initialFactCount} more
						</>
					)}
				</button>
			)}
		</div>
	);
}
