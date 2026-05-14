"use client";

/**
 * SavedViewsMenu — toolbar dropdown for switching between user-saved table
 * column configurations.
 *
 * STORAGE — `users.preferences.savedViews[slot]` = `[{id, name, columns, filters?}]`.
 *
 * UI shape:
 *   ┌──────────────────────┐
 *   │ View: All deals    ▾ │   ← trigger
 *   ├──────────────────────┤
 *   │ • All deals          │   ← currently active (•)
 *   │   Hot leads          │
 *   │   ──────────────     │
 *   │ + Save current view… │
 *   │ × Delete this view   │
 *   └──────────────────────┘
 *
 * The "Save current view" item creates a new row with the user's current
 * `columns + filters`. The "Delete this view" item is only enabled when an
 * explicitly saved view is active (i.e. not the implicit "All").
 */

import { useMutation, useQuery } from "convex/react";
import { ChevronDownIcon, PlusIcon, Trash2Icon } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuLabel,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { api } from "@/convex/_generated/api";
import { cn } from "@/lib/utils";

export interface SavedView {
	id: string;
	name: string;
	columns: string[];
	filters?: Record<string, unknown>;
}

interface SavedViewsMenuProps {
	slot: string;
	/** Currently-applied columns (from local state). Used when saving. */
	currentColumns: string[];
	/** Currently-applied filters (deal stage, source, etc.). Used when saving. */
	currentFilters?: Record<string, unknown>;
	/** Active saved-view id, or undefined for the implicit "All". */
	activeViewId?: string;
	/** Apply a saved view (or clear when null). */
	onApply: (view: SavedView | null) => void;
	className?: string;
}

export function SavedViewsMenu({
	slot,
	currentColumns,
	currentFilters,
	activeViewId,
	onApply,
	className,
}: SavedViewsMenuProps) {
	const me = useQuery(api.users.queries.me);
	const updatePreferences = useMutation(api.users.mutations.updatePreferences);

	const allSaved = useMemo<SavedView[]>(() => {
		const map = me?.preferences?.savedViews ?? {};
		return ((map as Record<string, SavedView[]>)[slot] ?? []).slice();
	}, [me?.preferences?.savedViews, slot]);

	const active = allSaved.find((v) => v.id === activeViewId);
	const triggerLabel = active?.name ?? "All";

	const [saveOpen, setSaveOpen] = useState(false);
	const [draftName, setDraftName] = useState("");

	const persist = async (next: SavedView[]) => {
		await updatePreferences({
			savedViews: {
				...((me?.preferences?.savedViews as Record<string, SavedView[]>) ?? {}),
				[slot]: next,
			},
		});
	};

	const saveCurrent = async () => {
		const name = draftName.trim();
		if (!name) {
			toast.error("Name your view first");
			return;
		}
		const id = `${slot}_${Date.now().toString(36)}`;
		const next: SavedView = {
			id,
			name,
			columns: currentColumns,
			...(currentFilters && Object.keys(currentFilters).length > 0
				? { filters: currentFilters }
				: {}),
		};
		try {
			await persist([...allSaved, next]);
			toast.success(`Saved view "${name}"`);
			setDraftName("");
			setSaveOpen(false);
			onApply(next);
		} catch (err) {
			toast.error("Couldn't save view", {
				description: err instanceof Error ? err.message : undefined,
			});
		}
	};

	const deleteActive = async () => {
		if (!active) return;
		try {
			const next = allSaved.filter((v) => v.id !== active.id);
			await persist(next);
			toast.success(`Deleted "${active.name}"`);
			onApply(null);
		} catch (err) {
			toast.error("Couldn't delete view", {
				description: err instanceof Error ? err.message : undefined,
			});
		}
	};

	return (
		<div className={cn("inline-flex items-center", className)}>
			<DropdownMenu>
				<DropdownMenuTrigger asChild>
					<Button
						type="button"
						variant="outline"
						size="sm"
						className="h-8 gap-1.5 px-2.5 text-xs"
					>
						<span className="text-muted-foreground">View:</span>
						<span className="font-medium">{triggerLabel}</span>
						<ChevronDownIcon className="size-3.5 opacity-60" />
					</Button>
				</DropdownMenuTrigger>
				<DropdownMenuContent align="start" className="w-56">
					<DropdownMenuLabel className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
						Views
					</DropdownMenuLabel>
					<DropdownMenuItem
						onSelect={() => onApply(null)}
						className="flex items-center gap-2 text-xs"
					>
						<span
							className={cn(
								"inline-block size-1.5 rounded-full",
								!activeViewId ? "bg-primary" : "bg-transparent",
							)}
						/>
						All
					</DropdownMenuItem>
					{allSaved.map((v) => (
						<DropdownMenuItem
							key={v.id}
							onSelect={() => onApply(v)}
							className="flex items-center gap-2 text-xs"
						>
							<span
								className={cn(
									"inline-block size-1.5 rounded-full",
									v.id === activeViewId ? "bg-primary" : "bg-transparent",
								)}
							/>
							{v.name}
						</DropdownMenuItem>
					))}
					<DropdownMenuSeparator />
					<DropdownMenuItem
						onSelect={(e) => {
							e.preventDefault();
							setSaveOpen(true);
						}}
						className="flex items-center gap-2 text-xs"
					>
						<PlusIcon className="size-3.5" />
						Save current view…
					</DropdownMenuItem>
					{active && (
						<DropdownMenuItem
							onSelect={deleteActive}
							className="flex items-center gap-2 text-xs text-destructive focus:text-destructive"
						>
							<Trash2Icon className="size-3.5" />
							Delete "{active.name}"
						</DropdownMenuItem>
					)}
				</DropdownMenuContent>
			</DropdownMenu>

			<Popover open={saveOpen} onOpenChange={setSaveOpen}>
				<PopoverTrigger asChild>
					{/* Hidden anchor — the popover is opened from the dropdown item. */}
					<span className="sr-only" />
				</PopoverTrigger>
				<PopoverContent className="w-64 p-3" align="start" sideOffset={6}>
					<div className="flex flex-col gap-2">
						<label
							htmlFor="saved-view-name"
							className="text-[11px] font-medium leading-none"
						>
							Name this view
						</label>
						<Input
							id="saved-view-name"
							value={draftName}
							onChange={(e) => setDraftName(e.target.value)}
							placeholder="e.g. Hot leads"
							className="h-8 text-sm"
						/>
						<p className="text-[10px] leading-snug text-muted-foreground">
							Saves your current columns
							{currentFilters && Object.keys(currentFilters).length > 0
								? " + filters"
								: ""}
							.
						</p>
						<div className="flex justify-end gap-2 pt-1">
							<Button
								type="button"
								size="sm"
								variant="outline"
								className="h-7 text-xs"
								onClick={() => {
									setSaveOpen(false);
									setDraftName("");
								}}
							>
								Cancel
							</Button>
							<Button
								type="button"
								size="sm"
								className="h-7 text-xs"
								onClick={saveCurrent}
							>
								Save
							</Button>
						</div>
					</div>
				</PopoverContent>
			</Popover>
		</div>
	);
}
