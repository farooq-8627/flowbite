"use client";

/**
 * ViewOptionsMenu — toolbar popover that controls per-session card/column
 * visibility, board group-by axis, and hidden-status reveal.
 *
 * Field metadata comes from `useEntityFields(slot)` — the canonical source.
 * Toggling a checkbox is per-session (caller-managed). Admin-global hide
 * lives in Settings → Modules → <Entity> → Fields.
 *
 * RULE: protected fields (e.g. displayName, personCode) are NEVER shown in
 * the toggle list — they cannot be hidden anywhere, so surfacing a useless
 * checkbox is bad UX. They're filtered out client-side in this component.
 */

import { Settings2 } from "lucide-react";
import { useMemo } from "react";
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
import type { Id } from "@/convex/_generated/dataModel";
import { ALLOWED_BOARD_GROUP_BY, getStatusColor } from "@/core/entities/shared/config/defaults";
import { useEntityFields } from "@/core/entities/shared/hooks/useEntityFields";
import type { EntitySlot } from "@/core/entities/shared/types";

interface ViewOptionsMenuProps {
	slot: EntitySlot;
	orgId?: Id<"orgs">;
	view: "list" | "board";
	visibleFields: string[];
	onVisibleFieldsChange: (next: string[]) => void;
	groupBy?: string;
	onGroupByChange?: (next: string) => void;
	allStatuses?: string[];
	hiddenStatuses?: string[];
	revealedStatuses?: string[];
	onRevealedStatusesChange?: (next: string[]) => void;
}

export function ViewOptionsMenu({
	slot,
	orgId,
	view,
	visibleFields,
	onVisibleFieldsChange,
	groupBy,
	onGroupByChange,
	allStatuses: _allStatuses,
	hiddenStatuses,
	revealedStatuses,
	onRevealedStatusesChange,
}: ViewOptionsMenuProps) {
	const { visibleFields: fields } = useEntityFields(slot, orgId);

	// Skip protected fields — they can't be hidden, so a toggle is meaningless.
	// (Admin-global hide is in Settings → Modules → <Entity> → Fields.)
	const fieldEntries = useMemo(
		() => fields.filter((f) => !f.protected).map((f) => ({ key: f.name, label: f.label })),
		[fields],
	);

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

	const hasStatusSection = view === "board" && hiddenStatuses && hiddenStatuses.length > 0;
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
					data-tour="view-options-trigger"
				>
					<Settings2 className="size-3.5" />
					<span className="hidden sm:inline">View</span>
				</Button>
			</PopoverTrigger>
			<PopoverContent align="end" className="w-72 p-3" sideOffset={6}>
				{hasGroupBySection && (
					<>
						<div className="space-y-1.5">
							<Label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
								Group by
							</Label>
							<Select value={groupBy} onValueChange={(v) => onGroupByChange?.(v)}>
								<SelectTrigger className="h-8 w-full text-xs">
									<SelectValue />
								</SelectTrigger>
								<SelectContent>
									{allowedGroupBy.map((opt) => {
										const f = fields.find((x) => x.name === opt);
										const label = f?.label ?? labelForGroupBy(opt);
										return (
											<SelectItem key={opt} value={opt} className="text-xs">
												{label}
											</SelectItem>
										);
									})}
								</SelectContent>
							</Select>
						</div>
						<Separator className="my-3" />
					</>
				)}

				<div className="space-y-1.5">
					<Label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
						{fieldsLabel}
					</Label>
					<div className="-mx-1 flex max-h-64 flex-col gap-0.5 overflow-y-auto">
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

				{hasStatusSection && (
					<>
						<Separator className="my-3" />
						<div className="space-y-1.5">
							<Label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
								Show statuses
							</Label>
							<p className="text-[10px] text-muted-foreground">
								Closed and lost columns are hidden by default.
							</p>
							<div className="-mx-1 flex flex-col gap-0.5">
								{hiddenStatuses?.map((status) => {
									const isShown = revealedStatuses?.includes(status) ?? false;
									const id = `vo-status-${slot}-${status}`;
									const color = getStatusColor(slot, status);
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
											<span
												aria-hidden
												className="inline-block size-2 shrink-0 rounded-full"
												style={{ backgroundColor: color }}
											/>
											<span className="flex-1 truncate capitalize">
												{status}
											</span>
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
