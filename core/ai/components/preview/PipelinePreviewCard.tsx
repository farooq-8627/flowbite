"use client";
/**
 * core/ai/components/preview/PipelinePreviewCard.tsx
 *
 * Two-step preview for `create_pipeline` and `add_pipeline_stage`.
 *
 * create_pipeline → renders the full stage chain inline.
 * add_pipeline_stage → renders the new stage + its insertion point.
 */
import { GitBranch, Plus } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import type { PreviewCardProps } from "./index";

export function PipelinePreviewCard({ args }: PreviewCardProps) {
	// add_pipeline_stage variant
	if (
		typeof args.code === "string" &&
		typeof args.name === "string" &&
		!Array.isArray(args.stages)
	) {
		const after = args.afterStageCode ? String(args.afterStageCode) : null;
		return (
			<div className="space-y-2.5">
				<div className="flex items-center gap-2">
					<div className="flex size-7 shrink-0 items-center justify-center rounded-[var(--radius)] bg-primary/10 text-primary">
						<Plus className="size-3.5" />
					</div>
					<span className="font-semibold text-sm">Add pipeline stage</span>
				</div>

				<div className="space-y-1.5 ps-9">
					<div className="flex items-center gap-2">
						<Badge variant="default">{String(args.name)}</Badge>
						<Badge variant="outline" className="font-mono text-[10px]">
							{String(args.code)}
						</Badge>
					</div>
					<p className="text-[11px] text-muted-foreground">
						Inserts after{" "}
						<span className="font-mono">{after ?? "(end of pipeline)"}</span>
					</p>
				</div>
			</div>
		);
	}

	// create_pipeline variant
	const name = args.name ? String(args.name) : "Untitled pipeline";
	const entityType = args.entityType ? String(args.entityType) : "deal";
	const stages = Array.isArray(args.stages)
		? (args.stages as Array<{ name: string; code: string }>)
		: [];

	return (
		<div className="space-y-2.5">
			<div className="flex items-center gap-2">
				<div className="flex size-7 shrink-0 items-center justify-center rounded-[var(--radius)] bg-primary/10 text-primary">
					<GitBranch className="size-3.5" />
				</div>
				<div className="min-w-0 flex-1">
					<p className="truncate font-semibold text-sm">{name}</p>
					<p className="text-[10px] uppercase tracking-wide text-muted-foreground">
						{entityType} pipeline · {stages.length} stage
						{stages.length === 1 ? "" : "s"}
					</p>
				</div>
			</div>

			{stages.length > 0 && (
				<div className="ps-9">
					<div className="flex flex-wrap items-center gap-1">
						{stages.map((s, i) => (
							<div key={s.code} className="flex items-center gap-1">
								<Badge variant="secondary" className="text-[10px]">
									{s.name}
								</Badge>
								{i < stages.length - 1 && (
									<span className="text-muted-foreground/60">→</span>
								)}
							</div>
						))}
					</div>
				</div>
			)}
		</div>
	);
}
