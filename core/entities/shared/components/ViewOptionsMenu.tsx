"use client";

/**
 * ViewOptionsMenu — the universal "View" popover for every entity page.
 *
 * Replaces the old lead-only BoardOptionsMenu. Works for leads, contacts,
 * deals, companies, and any future slot; in list mode and board mode.
 *
 * Sections (shown conditionally depending on `view`):
 *   1. "Card fields" / "List columns" — per-session visibility toggles over
 *      the slot's FIELD_CATALOG. Ephemeral overrides of the admin default.
 *   2. "Group by" (board only) — choose the board grouping axis from
 *      ALLOWED_BOARD_GROUP_BY[slot]. Swaps the columns live.
 *   3. "Show hidden statuses" (board + lead-like) — opt-in reveal of terminal
 *      statuses that are hidden by default (e.g. converted, lost).
 *
 * The menu itself is stateless — all state is lifted into the parent view,
 * which is responsible for applying the toggles to its rendering.
 */

import { Settings2 } from "lucide-react";
import { useMemo } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { ALLOWED_BOARD_GROUP_BY } from "@/core/entities/shared/config/defaults";
import { FIELD_CATALOG } from "@/core/entities/shared/config/field-catalog";
import type { EntitySlot } from "@/core/entities/shared/types";

interface ViewOptionsMenuProps {
	slot: EntitySlot;
	/** Which view this menu is attached to — controls which sections are visible. */
	view: "list" | "board";
	/** Currently visible card/list fields (subset of the catalog keys). */
	visibleFields: string[];
	onVisibleFieldsChange: (next: string[]) => void;
	/** Extra custom fields discovered dynamically (e.g. from fieldDefinitions). */
	extraFields?: Array<{ key: string; label: string }>;
	/** Current board group-by field (board view only). */
	groupBy?: string;
	onGroupByChange?: (next: string) => void;
	/** All status column ids for the slot's status-based grouping (lead-like). */
	allStatuses?: string[];
	hiddenStatuses?: string[];
	revealedStatuses?: string[];
	onRevealedStatusesChange?: (next: string[]) => void;
}

export function ViewOptionsMenu({
	slot,
	view,
	visibleFields,
	onVisibleFieldsChange,
	extraFields,
	groupBy,
	onGroupByChange,
	allStatuses,
	hiddenStatuses,
	revealedStatuses,
	onRevealedStatusesChange,
}: ViewOptionsMenuProps) {
	const catalog = FIELD_CATALOG[slot];
	const fieldEntries = useMemo(() => {
		// Merge static catalog with any dynamic custom fields (file, dropdown, …).
		const base = Object.entries(catalog).map(([key, spec]) => ({
			key,
			label: spec?.label ?? key,
		}));
		const seen = new Set(base.map((b) => b.key));
		const extra = (extraFields ?? []).filter((f) => !seen.has(f.key));
		return [...base, ...extra];
	}, [catalog, extraFields]);

	const toggleField = (key: string) => {
		if (visibleFields.includes(key))
			onVisibleFieldsChange(visibleFields.filter((k) => k !== key));
		else onVisibleFieldsChange([...visibleFields, key]);
	};

	const toggleStatus = (status: string) => {
		if (!onRevealedStatusesChange || !revealedStatuses) return;
		if (revealedStatuses.includes(status))
			onRevealedStatusesChange(revealedStatuses.filter((s) => s !== status));
		else onRevealedStatusesChange([...revealedStatuses, status]);
	};

	const hasStatusSection =
		view === "board" && hiddenStatuses && hiddenStatuses.length > 0 && allStatuses;
	const hasGroupBySection = view === "board" && !!onGroupByChange && !!groupBy;
	const allowedGroupBy = ALLOWED_BOARD_GROUP_BY[slot];

	const fieldsLabel = view === "board" ? "Card fields" : "List columns";

	return (
		<Popover>
			<PopoverTrigger asChild>
				<Button
					variant="outline"
					size="sm"
					className="h-7 gap-1.5 px-2 text-xs"
					aria-label="View options"
				>
					<Settings2 className="size-3.5" />
					<span className="hidden sm:inline">View</span>
				</Button>
			</PopoverTrigger>
			<PopoverContent align="end" className="w-72 p-2" sideOffset={6}>
				{hasGroupBySection && (
					<>
						<div className="space-y-2">
							<Label className="px-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
								Group by
							</Label>
							<Select value={groupBy} onValueChange={(v) => onGroupByChange?.(v)}>
								<SelectTrigger className="h-7 text-xs">
									<SelectValue />
								</SelectTrigger>
								<SelectContent>
									{allowedGroupBy.map((opt) => {
										const spec = catalog[opt];
										const label = spec?.label ?? labelForGroupBy(opt);
										return (
											<SelectItem key={opt} value={opt} className="text-xs">
												{label}
											</SelectItem>
										);
									})}
								</SelectContent>
							</Select>
						</div>
						<Separator className="my-2" />
					</>
				)}

				<div className="space-y-2">
					<Label className="px-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
						{fieldsLabel}
					</Label>
					<div className="flex max-h-64 flex-col gap-1 overflow-y-auto">
						{fieldEntries.map(({ key, label }) => {
							const id = `vo-field-${slot}-${key}`;
							return (
								<label
									key={key}
									htmlFor={id}
									className="flex cursor-pointer items-center gap-2 rounded-[var(--radius)] px-2 py-1 text-xs hover:bg-accent"
								>
									<Checkbox
										id={id}
										checked={visibleFields.includes(key)}
										onCheckedChange={() => toggleField(key)}
									/>
									<span className="flex-1 truncate">{label}</span>
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
									const id = `vo-status-${slot}-${status}`;
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

/** Fallback human label for group-by options not present in FIELD_CATALOG. */
function labelForGroupBy(key: string): string {
	switch (key) {
		case "tag":
		case "tags":
			return "Tag";
		case "assignedTo":
			return "Assignee";
		case "currentStageId":
			return "Stage";
		case "companyId":
			return "Company";
		default:
			return key.charAt(0).toUpperCase() + key.slice(1);
	}
}
