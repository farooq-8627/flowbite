"use client";

/**
 * TagsPickerPopover — the search + create + check-row UI shared by
 * TagsCell (DB-backed, table cells / cards) and BufferedTagsPicker
 * (in-memory, create-mode forms).
 *
 * Single-select semantics. Clicking the active tag clears the selection;
 * picking a new tag replaces whatever was selected before.
 *
 * Why a separate component
 * ────────────────────────
 * The user wants the SAME picker UI everywhere — table pencil, card +,
 * Add Lead drawer, Edit Lead drawer. By isolating the popover here we keep
 * one place to tune the visuals (row layout, search behaviour, create-on-
 * the-fly) and let each call site bring its own data layer (DB writes vs
 * local state).
 *
 * The trigger styling stays with the consumer. This component renders ONLY
 * the popover content (so it composes with whatever trigger button the
 * caller wants — `+` button, pencil-on-hover, or a full-width picker
 * button used inside a form row).
 */

import { CheckIcon, PlusIcon } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

export interface TagOption {
	/** Stable id (Convex Id<"tags"> in DB-mode, the tag name in buffer-mode). */
	id: string;
	name: string;
	color?: string;
}

export interface TagsPickerPopoverContentProps {
	options: TagOption[];
	selectedId: string | undefined;
	/** Pick a tag (or clear if same id passed twice). */
	onSelect: (id: string) => void | Promise<void>;
	/** When provided, an inline "Create '<query>'" row appears for unknown values. */
	onCreate?: (name: string) => void | Promise<void>;
	className?: string;
	/** Initial input focus. Default: true. */
	autoFocus?: boolean;
}

export function TagsPickerPopoverContent({
	options,
	selectedId,
	onSelect,
	onCreate,
	className,
	autoFocus = true,
}: TagsPickerPopoverContentProps) {
	const [query, setQuery] = useState("");
	const inputRef = useRef<HTMLInputElement | null>(null);

	useEffect(() => {
		if (autoFocus) inputRef.current?.focus();
	}, [autoFocus]);

	const filtered = useMemo(() => {
		if (!query) return options;
		const q = query.toLowerCase();
		return options.filter((o) => o.name.toLowerCase().includes(q));
	}, [options, query]);

	const exact = useMemo(
		() => options.find((o) => o.name.toLowerCase() === query.trim().toLowerCase()),
		[options, query],
	);

	const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
		if (e.key === "Enter") {
			e.preventDefault();
			if (filtered.length > 0) {
				void onSelect(filtered[0]!.id);
			} else if (onCreate && query.trim() && !exact) {
				void onCreate(query.trim());
				setQuery("");
			}
		}
	};

	return (
		<div className={cn("flex flex-col", className)}>
			<div className="flex items-center gap-2 border-b px-2 py-1.5">
				<Input
					ref={inputRef}
					value={query}
					onChange={(e) => setQuery(e.target.value)}
					onKeyDown={handleKeyDown}
					placeholder="Search or create tag…"
					className="h-7 border-0 bg-transparent px-1 text-xs shadow-none focus-visible:border-transparent"
				/>
			</div>

			<div className="max-h-64 overflow-y-auto p-1">
				{filtered.length === 0 && !query.trim() && (
					<p className="py-3 text-center text-xs text-muted-foreground">
						No tags yet. Type to create one.
					</p>
				)}

				{filtered.map((tag) => {
					const isOn = selectedId === tag.id;
					return (
						<button
							key={tag.id}
							type="button"
							onClick={() => void onSelect(tag.id)}
							className={cn(
								"flex w-full cursor-pointer items-center gap-2 rounded-[calc(var(--radius)-2px)] px-2 py-1.5 text-start text-sm transition-colors",
								"hover:bg-accent hover:text-accent-foreground",
								isOn && "bg-accent/40",
							)}
						>
							<span
								aria-hidden
								className="inline-block size-2 shrink-0 rounded-full"
								style={{ backgroundColor: tag.color ?? "#94a3b8" }}
							/>
							<span className="flex-1 truncate">{tag.name}</span>
							{isOn ? (
								<CheckIcon
									aria-hidden
									className="size-3.5 shrink-0 text-primary"
									strokeWidth={3}
								/>
							) : null}
						</button>
					);
				})}

				{onCreate && query.trim() && !exact && (
					<>
						{filtered.length > 0 && <div className="my-1 h-px bg-border" />}
						<button
							type="button"
							onClick={() => {
								void onCreate(query.trim());
								setQuery("");
							}}
							className="flex w-full cursor-pointer items-center gap-2 rounded-[calc(var(--radius)-2px)] px-2 py-1.5 text-start text-sm transition-colors hover:bg-accent hover:text-accent-foreground"
						>
							<PlusIcon className="size-3.5 shrink-0 text-muted-foreground" />
							<span className="truncate">
								Create <strong>"{query.trim()}"</strong>
							</span>
						</button>
					</>
				)}
			</div>
		</div>
	);
}
