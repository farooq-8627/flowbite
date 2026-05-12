"use client";

/**
 * StaleIndicator — renders a colored dot/border based on pipeline stage stale config.
 * Colors come from `pipeline.stages[].{staleColor, warningColor, staleAfterDays, warningAfterDays}`.
 * NEVER hardcode red/yellow — always read from stage config.
 */

import { cn } from "@/lib/utils";

interface StaleIndicatorProps {
	daysInStage: number;
	staleAfterDays?: number;
	warningAfterDays?: number;
	staleColor?: string;
	warningColor?: string;
	className?: string;
}

export function StaleIndicator({
	daysInStage,
	staleAfterDays,
	warningAfterDays,
	staleColor,
	warningColor,
	className,
}: StaleIndicatorProps) {
	const isStale = staleAfterDays !== undefined && daysInStage > staleAfterDays;
	const isWarning = !isStale && warningAfterDays !== undefined && daysInStage > warningAfterDays;

	if (!isStale && !isWarning) return null;

	const color = isStale ? staleColor : warningColor;

	return (
		<span
			className={cn("inline-block size-2 rounded-full", className)}
			style={{ backgroundColor: color ?? "#ef4444" }}
			title={`${Math.round(daysInStage)}d in stage`}
		/>
	);
}
