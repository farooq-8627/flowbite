"use client";

/**
 * ViewToggleIcons — visually-combined List/Board switch.
 *
 * Presents as a single pill with a shared border — the two icon buttons sit
 * snug against each other (first gets `rounded-s`, second gets `rounded-e`,
 * divider between them). Keeps the underlying semantics (two discrete buttons
 * with `aria-pressed`) per D3 so a11y tools still see two switches.
 *
 * NO TOOLTIPS — explained once via the global entity-layout `<FirstTimeTour>`
 * (anchors: `data-tour="view-toggle-list"` / `data-tour="view-toggle-board"`).
 * Tooltips on these buttons re-fired on every hover after the user already
 * understood them; the tour fires once per device and stays out of the way.
 * `aria-label` keeps the controls accessible to screen readers and any
 * native browser title hint.
 *
 * Lives in `core/shell/shared/entity-layout/` because every shared view that
 * uses the entity-style toolbar (Leads, Contacts, Deals, Companies, Notes,
 * etc.) consumes this widget. Free of entity-domain imports.
 */

import { LayoutGridIcon, ListIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { ViewKind } from "./types";

interface ViewToggleIconsProps {
	view: ViewKind;
	onViewChange: (v: ViewKind) => void;
	views?: ViewKind[];
}

export function ViewToggleIcons({
	view,
	onViewChange,
	views = ["list", "board"],
}: ViewToggleIconsProps) {
	const showList = views.includes("list");
	const showBoard = views.includes("board");

	return (
		<div className="inline-flex h-8 items-center overflow-hidden rounded-[var(--radius)] border bg-background p-0.5">
			{showBoard && (
				<Button
					variant="ghost"
					size="icon"
					aria-label="Board view"
					title="Board view"
					data-tour="view-toggle-board"
					aria-pressed={view === "board"}
					onClick={() => onViewChange("board")}
					className={cn(
						"size-6 shrink-0 rounded-[calc(var(--radius)-2px)]",
						view === "board"
							? "bg-accent text-accent-foreground"
							: "text-muted-foreground hover:text-foreground",
					)}
				>
					<LayoutGridIcon className="size-3.5" />
				</Button>
			)}
			{showList && (
				<Button
					variant="ghost"
					size="icon"
					aria-label="List view"
					title="List view"
					data-tour="view-toggle-list"
					aria-pressed={view === "list"}
					onClick={() => onViewChange("list")}
					className={cn(
						"size-6 shrink-0 rounded-[calc(var(--radius)-2px)]",
						view === "list"
							? "bg-accent text-accent-foreground"
							: "text-muted-foreground hover:text-foreground",
					)}
				>
					<ListIcon className="size-3.5" />
				</Button>
			)}
		</div>
	);
}
