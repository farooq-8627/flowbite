"use client";

/**
 * Entity tour steps — shared across leads/contacts/deals/companies kanban
 * boards. The same `data-tour` anchors are placed on EntityCard's grip and
 * primary shortcut button.
 *
 * Tour scope decision (round 5):
 *   - The CHROME (search box, view toggle, View Options trigger) is explained
 *     ONCE per device by the global `entity-layout-v1` tour mounted in
 *     `EntityPageLayout`. Don't duplicate those steps here.
 *   - Each entity's per-board tour focuses on CARD gestures: drag-to-change,
 *     primary action click, etc. Those are entity-specific and benefit from
 *     a dedicated walkthrough on each entity page the first time it opens.
 *
 * Each consuming view passes a unique `id` (e.g. "leads-board-v1") so each
 * board fires its own tour exactly once per device.
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
			target: "lead-card-lost",
			title: "Trash without losing data",
			body: "The trash icon flags the record as inactive — it stays in the audit trail and can be unhidden from view options at any time.",
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
			body: "Pick which fields appear on cards, change the group-by axis, and reveal hidden columns.",
			side: "bottom",
		},
	];
}
