"use client";

import { useState } from "react";
import {
	Card,
	CardAction,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import { useSearchFilter } from "@/core/shell/shared/layouts";
import { cn } from "@/lib/utils";

type Props = {
	id?: string;
	title: string;
	description?: string;
	/** Optional button/link rendered in the top-right of the card header */
	action?: React.ReactNode;
	children: React.ReactNode;
	/**
	 * When `true`, the entire CardHeader becomes a clickable toggle
	 * (whole-row hit area minus the action button). The `children`
	 * body collapses out of the layout when closed. Use this for
	 * heavy / opt-in surfaces (e.g. Trash) that shouldn't dominate
	 * the page on first paint. Locked 2026-06-10 (per user — Trash
	 * specifically). Mirrors the AI Cockpit collapse UX: no chevron
	 * icon, the cursor + the show/hide animation are signal enough.
	 */
	collapsible?: boolean;
	/** When `collapsible`, defaults to `true` (collapsed). */
	defaultCollapsed?: boolean;
};

/**
 * Settings section card.
 *
 * If a search-filter context is active and this section's id isn't in the
 * matching set, the card returns null — inline search filtering without a
 * separate results screen.
 *
 * Sizing rules (2026-05-22):
 *   - `min-w-0 max-w-full` on Card so it shrinks to fit narrow viewports
 *     instead of overflowing horizontally and silently clipping content.
 *   - `min-w-0` on CardContent so flex/grid descendants behave correctly
 *     and horizontal scroll containers (tables, button rows) can scroll
 *     within their bounds rather than blowing out the parent.
 *   - Header description has `text-balance break-words` so long sentences
 *     wrap cleanly on phones instead of running into the action button.
 *
 * Collapsible mode (2026-06-10):
 *   - When `collapsible` is set, the header is a `<button>` and the body
 *     mounts only when expanded (so reactive Convex queries inside the
 *     body don't run while collapsed — same behaviour as AI Cockpit).
 *   - Search-driven auto-expand: if the surrounding `<SearchFilter>`
 *     context has narrowed to a matching set that includes this section,
 *     the section auto-opens so the user lands on the filtered match
 *     instead of a closed accordion. Closes again when search clears.
 */
export function SettingsSection({
	id,
	title,
	description,
	action,
	children,
	collapsible,
	defaultCollapsed,
}: Props) {
	const { matchingIds } = useSearchFilter();
	const [open, setOpen] = useState(() => {
		if (!collapsible) return true;
		// Auto-open during a search so the user sees the matched section.
		// (Read-once at mount; subsequent search-state changes don't
		// re-open a section the user manually closed — that would be
		// surprising mid-search.)
		if (matchingIds && id && matchingIds.has(id)) return true;
		return !(defaultCollapsed ?? true);
	});
	if (matchingIds && id && !matchingIds.has(id)) return null;

	const isCollapsible = collapsible === true;
	const headerClickable = isCollapsible;

	const headerInner = (
		<>
			<CardTitle className="min-w-0 text-sm sm:text-base">{title}</CardTitle>
			{description && (
				<CardDescription className="min-w-0 break-words text-balance text-xs sm:text-sm">
					{description}
				</CardDescription>
			)}
		</>
	);

	return (
		<Card id={id} className="min-w-0 max-w-full scroll-mt-6 gap-4 py-4 sm:gap-6 sm:py-6">
			<CardHeader className={cn("min-w-0 gap-0", action && "grid-cols-[1fr_auto]")}>
				{headerClickable ? (
					<button
						type="button"
						aria-expanded={open}
						aria-controls={id ? `${id}-body` : undefined}
						onClick={() => setOpen((v) => !v)}
						className="col-start-1 row-start-1 flex min-w-0 cursor-pointer flex-col items-start gap-0 text-start"
					>
						{headerInner}
					</button>
				) : (
					headerInner
				)}
				{action && (
					<CardAction
						className="min-w-0"
						onClick={(e) => {
							// In collapsible mode the action button must not
							// toggle the section.
							if (headerClickable) e.stopPropagation();
						}}
					>
						{action}
					</CardAction>
				)}
			</CardHeader>
			{(!isCollapsible || open) && (
				<CardContent id={id ? `${id}-body` : undefined} className="flex min-w-0 flex-col">
					{children}
				</CardContent>
			)}
		</Card>
	);
}
