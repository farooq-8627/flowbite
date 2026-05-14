"use client";

/**
 * StageFilter — toolbar dropdown that scopes a deal list/table to a specific
 * pipeline stage. "All stages" is the default.
 *
 * Use it from any deal-presenting view that wants stage-aware filtering. The
 * filter is local UI state — combine with a saved view to persist it.
 */

import { ChevronDownIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuLabel,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

export interface StageOption {
	id: string;
	name: string;
	color?: string;
}

interface StageFilterProps {
	stages: StageOption[];
	value?: string; // selected stage id, or undefined for "all"
	onChange: (stageId: string | undefined) => void;
	className?: string;
}

export function StageFilter({ stages, value, onChange, className }: StageFilterProps) {
	const active = stages.find((s) => s.id === value);
	const triggerLabel = active?.name ?? "All stages";

	return (
		<DropdownMenu>
			<DropdownMenuTrigger asChild>
				<Button
					type="button"
					variant="outline"
					size="sm"
					className={cn("h-8 gap-1.5 px-2.5 text-xs", className)}
				>
					<span className="text-muted-foreground">Stage:</span>
					{active?.color && (
						<span
							aria-hidden
							className="size-1.5 rounded-full"
							style={{ backgroundColor: active.color }}
						/>
					)}
					<span className="font-medium">{triggerLabel}</span>
					<ChevronDownIcon className="size-3.5 opacity-60" />
				</Button>
			</DropdownMenuTrigger>
			<DropdownMenuContent align="start" className="w-48">
				<DropdownMenuLabel className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
					Filter by stage
				</DropdownMenuLabel>
				<DropdownMenuItem
					onSelect={() => onChange(undefined)}
					className="flex items-center gap-2 text-xs"
				>
					<span
						className={cn(
							"inline-block size-1.5 rounded-full",
							!value ? "bg-primary" : "bg-transparent",
						)}
					/>
					All stages
				</DropdownMenuItem>
				<DropdownMenuSeparator />
				{stages.map((s) => (
					<DropdownMenuItem
						key={s.id}
						onSelect={() => onChange(s.id)}
						className="flex items-center gap-2 text-xs"
					>
						<span
							className={cn(
								"inline-block size-1.5 rounded-full",
								s.id === value ? "bg-primary" : "bg-transparent",
							)}
						/>
						{s.color && (
							<span
								aria-hidden
								className="size-1.5 rounded-full"
								style={{ backgroundColor: s.color }}
							/>
						)}
						{s.name}
					</DropdownMenuItem>
				))}
			</DropdownMenuContent>
		</DropdownMenu>
	);
}
