"use client";

/**
 * Entity tour steps — shared across leads/contacts/deals/companies kanban
 * boards. The same `data-tour` anchors are placed on EntityCard's grip,
 * primary shortcut button, and the ViewOptionsMenu trigger.
 *
 * Each consuming view passes a unique `id` (e.g. "leads-board-v1") to
 * <FirstTimeTour /> so each board fires its own tour exactly once per device.
 */

import type { TourStep } from "@/components/ui/first-time-tour";

export interface EntityTourLabels {
	primaryActionVerb: string; // "Convert", "Move", "Edit"
	primaryActionTarget?: string; // optional secondary noun ("the lead → contact")
	groupedBy: string; // "status" | "stage" | "industry"
}

export function buildEntityBoardTour(labels: EntityTourLabels): TourStep[] {
	return [
		{
			target: "lead-card-convert",
			title: `${labels.primaryActionVerb} with one click`,
			body: `Click the action button on a card to ${labels.primaryActionVerb.toLowerCase()}${
				labels.primaryActionTarget ? ` ${labels.primaryActionTarget}` : ""
			} instantly. Double-click for the full options drawer.`,
			side: "top",
		},
		{
			target: "lead-card-grip",
			title: `Drag to change ${labels.groupedBy}`,
			body: `Grab the grip on the right edge of any card and drop it onto a different column to update its ${labels.groupedBy}.`,
			side: "start",
		},
		{
			target: "view-options-trigger",
			title: "Tune what you see",
			body: "Pick which fields appear on each card, change the group-by axis, and reveal hidden columns.",
			side: "bottom",
		},
	];
}
