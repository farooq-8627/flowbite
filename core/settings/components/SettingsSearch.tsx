"use client";

import { Search, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

type Props = {
	value: string;
	onChange: (value: string) => void;
	placeholder?: string;
	className?: string;
	inputClassName?: string;
};

/**
 * Simple controlled input used by the settings topnav toolbar.
 *
 * No dropdown — filtering happens inline in the main content area
 * (see SearchResultsView). Filtering is driven by the parent via onChange.
 */
export function SettingsSearch({
	value,
	onChange,
	placeholder = "Search settings…",
	className,
	inputClassName,
}: Props) {
	return (
		<div className={cn("relative", className)}>
			<Search className="pointer-events-none absolute start-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
			<Input
				value={value}
				onChange={(e) => onChange(e.target.value)}
				placeholder={placeholder}
				aria-label="Search settings"
				className={cn("h-7 ps-8 pe-7 text-xs", inputClassName)}
			/>
			{value.length > 0 && (
				<Button
					type="button"
					variant="ghost"
					size="icon"
					onClick={() => onChange("")}
					aria-label="Clear search"
					className="absolute end-0.5 top-1/2 size-6 -translate-y-1/2 text-muted-foreground hover:text-foreground"
				>
					<X className="size-3" />
				</Button>
			)}
		</div>
	);
}
