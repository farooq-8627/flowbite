"use client";

/**
 * TimelineConnector — per-entry segment of the rail line.
 *
 * Renders as an absolutely-positioned 1-pixel column inside the entry,
 * threading from the BOTTOM of this entry's icon to the TOP of the
 * next entry's icon. The connector lives INSIDE the icon's flex column
 * so it stays in column even when the entry's content is taller than
 * the icon.
 *
 * Why per-entry segments instead of one absolute rail
 * ───────────────────────────────────────────────────
 * Per direct user feedback (2026-05-19): the line should "start from
 * an icon and end with an icon" — meaning no rail extends above the
 * first or below the last entry. A full-feed absolute rail would
 * orphan a stub at the top (above the first icon) and at the bottom
 * (below the last icon) regardless of how carefully you trim the
 * height; per-entry segments solve this by definition (the LAST entry
 * just doesn't render a connector).
 *
 * Visual contract (collaboration with `ActionNode` in TimelineBareEntry):
 *   - Icon column = `size-8` slot (32px) with a `size-6` (24px) ring inside.
 *   - Connector = `start-1/2 -translate-x-1/2` (centred on the column),
 *     `top-8` (just below the icon), height = remaining vertical space
 *     of THIS entry plus the parent gap, so it visually meets the next
 *     icon's top.
 *
 * Implementation note
 * ───────────────────
 * The "entry's bottom + parent gap" is achieved with `inset-y` math.
 * The connector spans `top: 32px; bottom: -<gap>` so its end overlaps
 * the next icon's top edge by exactly 0px — they tessellate. The gap
 * size is forwarded via the `gapPx` prop so `TimelineFeed` controls
 * one source of truth and the connector follows suit.
 */

import { cn } from "@/lib/utils";

interface TimelineConnectorProps {
	/** Hide on the last entry — no segment after the final icon. */
	visible?: boolean;
	/**
	 * Pixel gap between sibling entries (matches the `gap-*` class on
	 * the parent `<ul>`). Default 28 (= `gap-7`).
	 */
	gapPx?: number;
	className?: string;
}

export function TimelineConnector({
	visible = true,
	gapPx = 28,
	className,
}: TimelineConnectorProps) {
	if (!visible) return null;
	return (
		<span
			aria-hidden
			className={cn(
				// Centred on the 32px icon column.
				"pointer-events-none absolute start-1/2 -translate-x-1/2 w-px bg-border",
				className,
			)}
			style={{
				top: 32, // bottom edge of the 32px icon slot
				bottom: -gapPx, // extends through the parent gap to meet the next icon
			}}
		/>
	);
}
