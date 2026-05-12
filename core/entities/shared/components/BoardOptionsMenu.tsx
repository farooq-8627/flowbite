"use client";

/**
 * BoardOptionsMenu — board-view equivalent of DataTableViewOptions.
 *
 * Two sections in one popover:
 *   1. "Card fields" — per-session toggles over the slot's cardFields catalog.
 *      Choices are ephemeral (not persisted) so users can experiment. Admin
 *      saves the default in Settings → Modules → <slot> → Module Display.
 *   2. "Show statuses" — surfaces hidden terminal statuses (e.g. "converted",
 *      "lost") that are hidden by default to reduce visual noise.
 *
 * Deliberately slim: one icon button in the toolbar, popover opens on click.
 */

import { Settings2 } from "lucide-react";
import { useMemo } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Separator } from "@/components/ui/separator";
import { FIELD_CATALOG } from "@/core/entities/shared/config/field-catalog";
import type { EntitySlot } from "@/core/entities/shared/types";

interface BoardOptionsMenuProps {
	slot: EntitySlot;
	/** Currently visible card fields (subset of the catalog keys). */
	cardFields: string[];
	onCardFieldsChange: (next: string[]) => void;
	/** All status column ids for the slot's board grouping (e.g. all lead statuses). */
	allStatuses?: string[];
	/** Hidden-by-default statuses (e.g. converted / lost). */
	hiddenStatuses?: string[];
	/** Which hidden statuses the user has opted to reveal. */
	revealedStatuses?: string[];
	onRevealedStatusesChange?: (next: string[]) => void;
}

export function BoardOptionsMenu({
	slot,
	cardFields,
	onCardFieldsChange,
	allStatuses,
	hiddenStatuses,
	revealedStatuses,
	onRevealedStatusesChange,
}: BoardOptionsMenuProps) {
	const catalog = FIELD_CATALOG[slot];
	const fieldKeys = useMemo(() => Object.keys(catalog), [catalog]);

	const toggleField = (key: string) => {
		if (cardFields.includes(key)) onCardFieldsChange(cardFields.filter((k) => k !== key));
		else onCardFieldsChange([...cardFields, key]);
	};

	const toggleStatus = (status: string) => {
		if (!onRevealedStatusesChange || !revealedStatuses) return;
		if (revealedStatuses.includes(status))
			onRevealedStatusesChange(revealedStatuses.filter((s) => s !== status));
		else onRevealedStatusesChange([...revealedStatuses, status]);
	};

	const hasStatusSection = hiddenStatuses && hiddenStatuses.length > 0;

	return (
		<Popover>
			<PopoverTrigger asChild>
				<Button
					variant="outline"
					size="sm"
					className="h-7 gap-1.5 px-2 text-xs"
					aria-label="Board view options"
				>
					<Settings2 className="size-3.5" />
					<span className="hidden sm:inline">View</span>
				</Button>
			</PopoverTrigger>
			<PopoverContent align="end" className="w-64 p-2" sideOffset={6}>
				<div className="space-y-2">
					<Label className="px-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
						Card fields
					</Label>
					<div className="flex flex-col gap-1">
						{fieldKeys.map((key) => {
							const spec = catalog[key];
							const id = `bo-field-${slot}-${key}`;
							return (
								<label
									key={key}
									htmlFor={id}
									className="flex cursor-pointer items-center gap-2 rounded-[var(--radius)] px-2 py-1 text-xs hover:bg-accent"
								>
									<Checkbox
										id={id}
										checked={cardFields.includes(key)}
										onCheckedChange={() => toggleField(key)}
									/>
									<span className="flex-1 truncate">{spec?.label ?? key}</span>
								</label>
							);
						})}
					</div>
				</div>

				{hasStatusSection && allStatuses && (
					<>
						<Separator className="my-2" />
						<div className="space-y-2">
							<Label className="px-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
								Show statuses
							</Label>
							<p className="px-1 text-[10px] text-muted-foreground">
								Terminal statuses are hidden by default. Toggle them on to see the
								full board.
							</p>
							<div className="flex flex-col gap-1">
								{hiddenStatuses?.map((status) => {
									const isShown = revealedStatuses?.includes(status) ?? false;
									const id = `bo-status-${slot}-${status}`;
									return (
										<label
											key={status}
											htmlFor={id}
											className="flex cursor-pointer items-center gap-2 rounded-[var(--radius)] px-2 py-1 text-xs hover:bg-accent"
										>
											<Checkbox
												id={id}
												checked={isShown}
												onCheckedChange={() => toggleStatus(status)}
											/>
											<Badge
												variant="outline"
												className="h-4 px-1 text-[9px] capitalize"
											>
												{status}
											</Badge>
										</label>
									);
								})}
							</div>
						</div>
					</>
				)}
			</PopoverContent>
		</Popover>
	);
}
