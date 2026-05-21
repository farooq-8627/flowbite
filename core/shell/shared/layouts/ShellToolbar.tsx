"use client";

import { Menu } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { ShellSearch } from "./ShellSearch";
import type { ShellSection } from "./types";

type Props = {
	sections: ShellSection[];
	activeSectionId: string | null;
	onPickSection: (id: string) => void;
	onOpenSheet?: () => void;
	query: string;
	onQueryChange: (value: string) => void;
	isSearching: boolean;
	searchPlaceholder?: string;
	searchAriaLabel?: string;
	className?: string;
};

/**
 * Shell-layout toolbar — composed of:
 *   1. (Mobile only) Hamburger button that opens the nav sheet.
 *   2. Search input — always visible.
 *   3. (Not searching) Horizontal row of section pills for the active group.
 *
 * Layout notes:
 *   - On < sm, the pill row wraps onto the next line beside the search.
 *   - On xl+, this toolbar is injected into the TopNav "slot" by ShellLayout —
 *     so the pills read as part of the global header.
 *   - On < xl, the same toolbar is rendered inline just under the header.
 */
export function ShellToolbar({
	sections,
	activeSectionId,
	onPickSection,
	onOpenSheet,
	query,
	onQueryChange,
	isSearching,
	searchPlaceholder,
	searchAriaLabel,
	className,
}: Props) {
	return (
		<div className={cn("flex w-full items-center gap-2 flex-col sm:flex-row", className)}>
			<div className="flex flex-row items-center gap-1 w-full sm:w-auto shrink-0">
				{onOpenSheet && (
					<Button
						variant="ghost"
						size="icon"
						className="size-7 shrink-0"
						onClick={onOpenSheet}
					>
						<Menu className="size-4" />
					</Button>
				)}
				<ShellSearch
					value={query}
					onChange={onQueryChange}
					placeholder={searchPlaceholder}
					ariaLabel={searchAriaLabel}
					className="w-fit sm:w-56 shrink-0"
				/>
			</div>
			{!isSearching && sections.length > 0 && (
				<div className="flex w-full hidden sm:flex sm:w-auto min-w-0 flex-1 items-center gap-1 overflow-x-auto scrollbar-none">
					{sections.map((sub) => (
						<button
							key={sub.id}
							type="button"
							onClick={() => onPickSection(sub.id)}
							className={cn(
								"shrink-0 rounded-[var(--radius)] px-2.5 py-1 text-xs transition-colors",
								activeSectionId === sub.id
									? "bg-accent text-accent-foreground font-medium"
									: "text-muted-foreground hover:bg-muted hover:text-foreground",
							)}
						>
							{sub.label}
						</button>
					))}
				</div>
			)}
		</div>
	);
}
