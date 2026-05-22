"use client";

import type { Doc, Id } from "@/convex/_generated/dataModel";
import { cn } from "@/lib/utils";

interface DealPipelineTabsProps {
	pipelines: readonly Doc<"pipelines">[];
	activePipelineId: Id<"pipelines"> | undefined;
	onSelect: (id: Id<"pipelines">) => void;
}

export function DealPipelineTabs({ pipelines, activePipelineId, onSelect }: DealPipelineTabsProps) {
	if (pipelines.length <= 1) return null;
	return (
		<div role="tablist" aria-label="Pipelines" className="flex items-center gap-1">
			{pipelines.map((p) => {
				const isActive = activePipelineId === p._id;
				return (
					<button
						key={p._id}
						role="tab"
						type="button"
						aria-selected={isActive}
						onClick={() => onSelect(p._id)}
						className={cn(
							"flex h-7 items-center gap-1.5 rounded-[var(--radius)] ps-2.5 pe-2.5 text-xs transition-colors",
							isActive
								? "bg-primary/10 text-primary"
								: "text-muted-foreground hover:bg-muted/60",
						)}
					>
						<span className="font-medium">{p.name}</span>
						{p.isDefault && (
							<span className="text-[10px] text-muted-foreground/70">· default</span>
						)}
					</button>
				);
			})}
		</div>
	);
}
