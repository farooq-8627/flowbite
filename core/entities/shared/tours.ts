"use client";

/**
 * Entity tour — ONE shared coachmark that fires exactly ONCE per device
 * across every entity page (leads / contacts / deals / companies).
 *
 * Why one tour, one id (locked 2026-06-06, per the user)
 * ──────────────────────────────────────────────────────
 * Every entity uses the SAME list/board chrome (`EntityPageLayout`) and the
 * SAME card (`EntityCard`). Running a separate per-board walkthrough on each
 * entity meant the user saw "Drag to move / Click to act / Search / View
 * toggle" four times. Now a single `<FirstTimeTour id="entity-tour-v1">`
 * mounted once in `EntityListPage` explains it on whichever entity the user
 * opens first and never shows again on any other entity page.
 *
 * Targeting (`data-tour="…"` contract):
 *   - entity-search      → the toolbar search box        (EntityPageLayout)
 *   - view-toggle-board  → the list/board switch          (ViewToggleIcons)
 *   - entity-create      → the primary "Add …" button     (EntityPageLayout)
 *   - lead-card-grip     → the drag grip on any card       (EntityCard — generic)
 *   - lead-card-convert  → the per-card primary action     (EntityCard — leads only)
 *
 * Missing targets are skipped automatically (FirstTimeTour). The card-action
 * step only resolves on the leads board (only leads have a convert button);
 * on contacts/deals/companies it's skipped, which is the intended
 * "…and the same gestures on the other entities" behaviour.
 *
 * Bump the id (`entity-tour-v1` → `-v2`) when these steps change meaningfully.
 */

import type { TourStep } from "@/components/ui/first-time-tour";

export const ENTITY_TOUR_ID = "entity-tour-v1";

export const ENTITY_TOUR_STEPS: TourStep[] = [
	{
		target: "entity-search",
		title: "Search this list",
		body: "Type to filter records instantly — matches jump to the top so you spot them fast.",
		side: "bottom",
	},
	{
		target: "view-toggle-board",
		title: "List or board",
		body: "Switch between a spreadsheet-style table and a drag-and-drop kanban board grouped by status or stage.",
		side: "bottom",
	},
	{
		target: "entity-create",
		title: "Add a record",
		body: "Create a new record here. The form only asks for what the current stage needs.",
		side: "bottom",
	},
	{
		target: "lead-card-grip",
		title: "Drag to move",
		body: "Grab the grip on the edge of any card and drop it into another column to update its status or stage.",
		side: "start",
	},
	{
		target: "lead-card-convert",
		title: "Quick actions on a card",
		body: "Single-click the action button to act instantly. Double-click to open the full form with options.",
		side: "top",
	},
];
