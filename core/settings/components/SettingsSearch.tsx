"use client";

import { useEffect, useRef, useState, useCallback, useMemo } from "react";
import { Search } from "lucide-react";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { useSettingsSearch, scrollToSection } from "../hooks/useSettingsSearch";
import type { SettingsGroupId } from "../config/settings-nav";
import type { SettingsSearchHit } from "../hooks/useSettingsSearch";

type Props = {
	/** Current user's resolved permission list */
	permissions: string[] | undefined;
	/** Callback when a result is picked — parent must set the active group, then scroll */
	onNavigate: (groupId: SettingsGroupId, sectionId: string) => void;
	className?: string;
	inputClassName?: string;
	placeholder?: string;
};

/**
 * Full-text settings search with a Fuse.js-backed dropdown.
 *
 * Behaviour:
 *   - ↓/↑ to navigate results
 *   - Enter to pick the highlighted result
 *   - Escape to close the dropdown
 *   - Clicking outside the panel closes it
 *   - Picking a result calls onNavigate(group, section) which the parent uses to
 *     set the active group, then scrollToSection() is used to jump to the card.
 */
export function SettingsSearch({
	permissions,
	onNavigate,
	className,
	inputClassName,
	placeholder = "Search settings…",
}: Props) {
	const [query, setQuery] = useState("");
	const [open, setOpen] = useState(false);
	const [highlight, setHighlight] = useState(0);
	const containerRef = useRef<HTMLDivElement>(null);

	const results = useSettingsSearch(query, permissions);

	// Reset highlight whenever the result set changes
	useEffect(() => { setHighlight(0); }, [results.length]);

	// Close on outside click
	useEffect(() => {
		if (!open) return;
		function onDocClick(e: MouseEvent) {
			if (!containerRef.current?.contains(e.target as Node)) setOpen(false);
		}
		document.addEventListener("mousedown", onDocClick);
		return () => document.removeEventListener("mousedown", onDocClick);
	}, [open]);

	const handlePick = useCallback((hit: SettingsSearchHit) => {
		setOpen(false);
		setQuery("");
		onNavigate(hit.groupId as SettingsGroupId, hit.id);
		// Defer scroll so the parent has time to switch the active group + mount the section.
		window.setTimeout(() => scrollToSection(hit.id), 60);
	}, [onNavigate]);

	const handleKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
		if (!open || results.length === 0) return;
		if (e.key === "ArrowDown") {
			e.preventDefault();
			setHighlight((i) => (i + 1) % results.length);
		} else if (e.key === "ArrowUp") {
			e.preventDefault();
			setHighlight((i) => (i - 1 + results.length) % results.length);
		} else if (e.key === "Enter") {
			e.preventDefault();
			const hit = results[highlight];
			if (hit) handlePick(hit);
		} else if (e.key === "Escape") {
			setOpen(false);
		}
	};

	const showDropdown = open && query.trim().length > 0;
	const hasResults = results.length > 0;

	// Pre-compute which highlight region to mark so JSX stays readable.
	const highlightedResults = useMemo(
		() => results.map((r, i) => ({ ...r, __focused: i === highlight })),
		[results, highlight],
	);

	return (
		<div ref={containerRef} className={cn("relative", className)}>
			<Search className="pointer-events-none absolute start-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
			<Input
				value={query}
				onChange={(e) => { setQuery(e.target.value); setOpen(true); }}
				onFocus={() => setOpen(true)}
				onKeyDown={handleKey}
				placeholder={placeholder}
				className={cn("h-7 ps-8 text-xs", inputClassName)}
				aria-label="Search settings"
				aria-expanded={showDropdown}
				aria-controls="settings-search-results"
				role="combobox"
			/>

			{showDropdown && (
				<div
					id="settings-search-results"
					role="listbox"
					className={cn(
						"absolute top-full mt-1 w-80 max-w-[min(90vw,24rem)]",
						"z-50 overflow-hidden rounded-[var(--radius)] border bg-popover text-popover-foreground shadow-md",
					)}
				>
					{hasResults ? (
						<ul className="max-h-80 overflow-y-auto py-1">
							{highlightedResults.map((hit) => (
								<li
									key={hit.id}
									role="option"
									aria-selected={hit.__focused}
									onMouseEnter={() => setHighlight(results.indexOf(hit))}
									onMouseDown={(e) => { e.preventDefault(); handlePick(hit); }}
									className={cn(
										"flex cursor-pointer flex-col gap-0.5 px-3 py-2 text-xs",
										hit.__focused && "bg-accent text-accent-foreground",
									)}
								>
									<div className="flex items-center justify-between gap-2">
										<span className="truncate font-medium text-sm">{hit.label}</span>
										<span className="shrink-0 text-[10px] uppercase tracking-wide text-muted-foreground">
											{hit.groupLabel}
										</span>
									</div>
									<span className="line-clamp-2 text-xs text-muted-foreground">
										{hit.description}
									</span>
								</li>
							))}
						</ul>
					) : (
						<div className="px-3 py-4 text-center text-xs text-muted-foreground">
							No settings match <b>{query}</b>.
						</div>
					)}
				</div>
			)}
		</div>
	);
}
