"use client";

import { Search, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

type Props = {
	value: string;
	onChange: (value: string) => void;
	placeholder?: string;
	className?: string;
	inputClassName?: string;
	ariaLabel?: string;
};

/**
 * Simple controlled search input used by any shell's topnav toolbar.
 *
 * No dropdown — filtering happens inline in the main content area via the
 * SearchFilterProvider / <SettingsSection> mechanism.
 */
export function ShellSearch({
	value,
	onChange,
	placeholder = "Search…",
	className,
	inputClassName,
	ariaLabel = "Search",
}: Props) {
	return (
		<div className={cn("relative", className)}>
			<Search className="pointer-events-none absolute start-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
			<Input
				value={value}
				onChange={(e) => onChange(e.target.value)}
				placeholder={placeholder}
				aria-label={ariaLabel}
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
