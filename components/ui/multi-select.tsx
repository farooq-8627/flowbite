"use client";

/**
 * MultiSelect — universal multi-select dropdown with the "left-content + right-checkbox" pattern.
 *
 * Design contract (per design system):
 *   - NO pills above the trigger. The trigger shows summary text only.
 *   - The popover lists every option as a row:
 *        ┌─────────────────────────────────────────┐
 *        │ <left content (avatar+name / icon+text)>│   ← user-supplied via `renderRow`
 *        │                                  [☐]    │   ← checkbox on the right
 *        └─────────────────────────────────────────┘
 *   - Click anywhere on the row toggles selection. The checkbox reflects state.
 *   - Optional create-on-the-fly via `onCreate` prop (the create row appears
 *     when the search query has no exact match).
 *
 * Why a custom one rather than reusing TagPicker's inline command?
 *   - TagPicker still keeps a chip list inside its trigger; that pattern was
 *     rejected on a UX review (see this round's user feedback).
 *   - This component is generic: pass any option type, pass any row renderer.
 *     It's used by team-member pickers, person pickers, file-type pickers,
 *     and the new TagPicker.
 *
 * Modal behaviour:
 *   - The internal `Popover` runs with `modal={true}` so it works correctly
 *     inside another modal context (e.g. a Sheet's focus trap).
 */

import { CheckIcon, ChevronDownIcon, PlusIcon } from "lucide-react";
import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
	Command,
	CommandEmpty,
	CommandGroup,
	CommandInput,
	CommandItem,
	CommandList,
} from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

export interface MultiSelectOption {
	/** Stable identifier — used for value-equality. */
	value: string;
	/** Plain-text label for searching + accessible name. Required. */
	label: string;
	/** Optional secondary text shown below the label by default. */
	subtitle?: string;
	/** Arbitrary opaque payload for the row renderer (e.g. avatarUrl, color, kind). */
	meta?: Record<string, unknown>;
}

export interface MultiSelectProps<O extends MultiSelectOption = MultiSelectOption> {
	/** Currently selected option values. */
	value: string[];
	/** Fired when the selection changes. */
	onChange: (values: string[]) => void;
	/** All options. */
	options: O[];
	/** Optional render override for each row's left content. */
	renderRow?: (option: O, isSelected: boolean) => React.ReactNode;
	/** Optional render override for the trigger label. Defaults to "{n} selected" / placeholder. */
	renderTrigger?: (selectedOptions: O[]) => React.ReactNode;
	/** Trigger placeholder shown when nothing is selected. */
	placeholder?: string;
	/** Search input placeholder. Defaults to "Search…". */
	searchPlaceholder?: string;
	/** Empty-state text when search yields no matches. */
	emptyText?: string;
	/** Create-on-the-fly. When provided, a "Create '<query>'" row appears below results. */
	onCreate?: (label: string) => Promise<string | undefined> | string | undefined;
	/** Restrict selection to N items max. */
	max?: number;
	/** Single-select mode — closes the popover after selection and only allows one value. */
	single?: boolean;
	disabled?: boolean;
	className?: string;
	/** Width of the popover content. Defaults to trigger width. */
	contentWidth?: number | string;
}

export function MultiSelect<O extends MultiSelectOption = MultiSelectOption>({
	value,
	onChange,
	options,
	renderRow,
	renderTrigger,
	placeholder = "Select…",
	searchPlaceholder = "Search…",
	emptyText = "No matches.",
	onCreate,
	max,
	single = false,
	disabled,
	className,
	contentWidth,
}: MultiSelectProps<O>) {
	const [open, setOpen] = useState(false);
	const [query, setQuery] = useState("");

	const selectedSet = useMemo(() => new Set(value), [value]);

	const filtered = useMemo(() => {
		if (!query) return options;
		const q = query.toLowerCase();
		return options.filter(
			(o) =>
				o.label.toLowerCase().includes(q) ||
				(o.subtitle?.toLowerCase().includes(q) ?? false),
		);
	}, [options, query]);

	const exactMatch = useMemo(
		() => options.some((o) => o.label.toLowerCase() === query.trim().toLowerCase()),
		[options, query],
	);

	const selectedOptions = useMemo(
		() => options.filter((o) => selectedSet.has(o.value)),
		[options, selectedSet],
	);

	const toggle = (val: string) => {
		if (single) {
			onChange([val]);
			setOpen(false);
			return;
		}
		if (selectedSet.has(val)) {
			onChange(value.filter((v) => v !== val));
		} else {
			if (max && value.length >= max) return;
			onChange([...value, val]);
		}
	};

	const handleCreate = async () => {
		if (!onCreate) return;
		const created = await onCreate(query.trim());
		if (created) {
			toggle(created);
			setQuery("");
		}
	};

	const triggerLabel = renderTrigger ? (
		renderTrigger(selectedOptions)
	) : selectedOptions.length === 0 ? (
		<span className="truncate text-muted-foreground">{placeholder}</span>
	) : single ? (
		<span className="truncate">{selectedOptions[0]?.label}</span>
	) : (
		<span className="truncate">
			{selectedOptions.length === 1
				? selectedOptions[0]?.label
				: `${selectedOptions.length} selected`}
		</span>
	);

	const contentStyle =
		contentWidth !== undefined
			? { width: typeof contentWidth === "number" ? `${contentWidth}px` : contentWidth }
			: undefined;

	return (
		<Popover open={open} onOpenChange={setOpen} modal>
			<PopoverTrigger asChild>
				<Button
					type="button"
					variant="outline"
					role="combobox"
					aria-expanded={open}
					disabled={disabled}
					className={cn(
						"h-9 w-full justify-between gap-2 px-3 font-normal",
						selectedOptions.length === 0 && "text-muted-foreground",
						className,
					)}
				>
					{triggerLabel}
					<ChevronDownIcon className="size-3.5 shrink-0 opacity-50" />
				</Button>
			</PopoverTrigger>
			<PopoverContent
				className={cn(
					"p-0",
					contentWidth === undefined && "w-[--radix-popover-trigger-width]",
				)}
				style={contentStyle}
				align="start"
				sideOffset={4}
			>
				<Command shouldFilter={false}>
					<CommandInput
						placeholder={searchPlaceholder}
						value={query}
						onValueChange={setQuery}
					/>
					<CommandList>
						<CommandEmpty>{emptyText}</CommandEmpty>
						{filtered.length > 0 && (
							<CommandGroup>
								{filtered.map((option) => {
									const isSelected = selectedSet.has(option.value);
									return (
										<CommandItem
											key={option.value}
											value={option.value}
											onSelect={() => toggle(option.value)}
											className="flex cursor-pointer items-center gap-2 py-2"
										>
											<div className="flex min-w-0 flex-1 items-center gap-2">
												{renderRow ? (
													renderRow(option, isSelected)
												) : (
													<DefaultRow option={option} />
												)}
											</div>
											{single ? (
												isSelected ? (
													<CheckIcon className="size-4 shrink-0 text-primary" />
												) : null
											) : (
												<Checkbox
													checked={isSelected}
													tabIndex={-1}
													aria-hidden
													className="pointer-events-none ms-auto"
												/>
											)}
										</CommandItem>
									);
								})}
							</CommandGroup>
						)}
						{onCreate && query.trim() && !exactMatch && (
							<CommandGroup heading="Create new">
								<CommandItem
									value={`__create__${query}`}
									onSelect={handleCreate}
									className="flex cursor-pointer items-center gap-2 py-2"
								>
									<PlusIcon className="size-3.5 text-muted-foreground" />
									<span className="truncate text-sm">
										Create "{query.trim()}"
									</span>
								</CommandItem>
							</CommandGroup>
						)}
					</CommandList>
				</Command>
			</PopoverContent>
		</Popover>
	);
}

// ─── DefaultRow — avatar/icon stub + label + subtitle ─────────────────────────

function DefaultRow({ option }: { option: MultiSelectOption }) {
	return (
		<div className="flex min-w-0 flex-col leading-tight">
			<span className="truncate text-sm">{option.label}</span>
			{option.subtitle && (
				<span className="truncate text-[11px] text-muted-foreground">
					{option.subtitle}
				</span>
			)}
		</div>
	);
}
