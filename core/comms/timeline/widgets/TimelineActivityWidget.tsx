"use client";

/**
 * TimelineActivityWidget — compact "Recent activity" card for the dashboard.
 *
 * Differs from the full feed on three axes:
 *   - No filters chip row (single intent: "what just happened").
 *   - No composer (dashboard is glance-only; click a card to navigate).
 *   - Tight `entryGapPx` so 6–8 entries fit comfortably in a small card.
 *
 * The widget pairs with `MessagesPreviewWidget` on the dashboard. Both
 * use the same row count (`limit`) and live in equal-width grid cells
 * so the visual density matches across the row.
 *
 * Sprint Stage 1 (2026-05-26 — DASHBOARD-AUDIT.md §3 Step 3) — empty
 * state widened from a plain-text "Workspace activity will appear here"
 * to a proper CTA card with an "Ask AI to create a record" button. The
 * underlying `TimelineFeed`'s `emptyState` prop now accepts an `action`
 * with `chatPrefillIntent` so the dashboard never hides itself behind
 * a quiet empty state.
 */

import { ActivityIcon } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { TimelineFeed } from "@/core/comms/timeline/components/TimelineFeed";
import { useCurrentOrg } from "@/core/shell/shared/hooks/useCurrentOrg";

interface TimelineActivityWidgetProps {
	/** When set, the card title becomes a link to the full timeline page. */
	orgSlug?: string;
	/** Number of entries to render. Default 6 (matches MessagesPreviewWidget). */
	limit?: number;
}

export function TimelineActivityWidget({ orgSlug, limit = 6 }: TimelineActivityWidgetProps) {
	useCurrentOrg();

	const titleNode = orgSlug ? (
		<Button
			asChild
			variant="ghost"
			size="sm"
			className="h-6 gap-1.5 px-1 text-xs font-semibold"
		>
			<Link href={`/${orgSlug}/timeline`}>
				<ActivityIcon className="size-3.5 text-muted-foreground" aria-hidden />
				Recent activity
			</Link>
		</Button>
	) : (
		<div className="flex items-center gap-1.5 px-1 text-xs font-semibold">
			<ActivityIcon className="size-3.5 text-muted-foreground" aria-hidden />
			Recent activity
		</div>
	);

	return (
		<Card className="flex h-full flex-col">
			<div className="flex items-center justify-between gap-2 px-3">
				{titleNode}
				{orgSlug && (
					<Link
						href={`/${orgSlug}/timeline`}
						className="text-xs text-muted-foreground hover:text-foreground"
					>
						View all →
					</Link>
				)}
			</div>
			<CardContent className="flex flex-1 flex-col px-3 pb-3 pt-0">
				<TimelineFeed
					scope={{ kind: "org" }}
					pageSize={limit}
					visibleCap={limit}
					showFilters={false}
					showComposer={false}
					entryGapPx={12}
					emptyState={{
						title: "Nothing yet",
						body: "Workspace activity will appear here as you create leads, deals, or notes.",
						action: {
							label: "Ask AI to create a lead",
							chatPrefillIntent:
								"Create a new lead — pick a name and seed the basics.",
						},
					}}
					className="min-h-0"
				/>
			</CardContent>
		</Card>
	);
}
