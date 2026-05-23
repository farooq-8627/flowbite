"use client";

/**
 * core/ai/components/results/InsightResultCard.tsx
 *
 * Placeholder card for `display: { kind: "insight", insightId }`. The actual
 * insight schema (`aiBriefings.payload`) lands in Sprint 5 — until then this
 * card just shows a friendly "Insight available" pill so tool authors can
 * already emit `kind: "insight"` without breaking the renderer.
 */

import { LightbulbIcon } from "lucide-react";
import { cn } from "@/lib/utils";

type InsightResultCardProps = { insightId: string; orgId: string };

export function InsightResultCard({ insightId }: InsightResultCardProps) {
	return (
		<div
			className={cn(
				"flex items-center gap-2 rounded-[var(--radius)] border bg-card px-3 py-2 text-xs",
				"shadow-xs",
			)}
		>
			<LightbulbIcon className="size-3.5 text-primary" />
			<span className="font-medium">Insight ready</span>
			<span className="text-muted-foreground">·</span>
			<span className="truncate font-mono text-[11px] text-muted-foreground">
				{insightId.slice(0, 12)}
			</span>
		</div>
	);
}
