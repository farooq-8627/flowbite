"use client";
/**
 * core/ai/components/preview/BulkPreviewCard.tsx
 *
 * Two-step preview for `bulk_update_entities` and `bulk_close_deals`.
 *
 * Shows an alarm-pitched count badge + 3-row sample + patch summary so
 * the user understands the blast radius before approving. Both tools
 * share this card; the variant is determined by the args shape:
 *
 *   bulk_update_entities → { entityType, entityIds[], patch }
 *   bulk_close_deals     → { dealIds[], outcome }
 */
import { CircleCheckBig, CircleX, Layers } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { PreviewCardProps } from "./index";

export function BulkPreviewCard({ args }: PreviewCardProps) {
	const isCloseVariant = typeof args.outcome === "string" && Array.isArray(args.dealIds);

	if (isCloseVariant) {
		const outcome = String(args.outcome) as "won" | "lost";
		const isWon = outcome === "won";
		const dealIds = (args.dealIds ?? []) as string[];

		return (
			<div className="space-y-2.5">
				<div
					className={cn(
						"flex items-center gap-2 rounded-[var(--radius)] border px-3 py-2",
						isWon
							? "border-emerald-300/60 bg-emerald-50/60 dark:border-emerald-700/40 dark:bg-emerald-950/20"
							: "border-rose-300/60 bg-rose-50/60 dark:border-rose-700/40 dark:bg-rose-950/20",
					)}
				>
					{isWon ? (
						<CircleCheckBig className="size-4 text-emerald-600 dark:text-emerald-400" />
					) : (
						<CircleX className="size-4 text-rose-600 dark:text-rose-400" />
					)}
					<span className="font-semibold text-sm">
						Closing {dealIds.length} deal{dealIds.length === 1 ? "" : "s"} as{" "}
						{outcome.toUpperCase()}
					</span>
				</div>

				<SampleRow ids={dealIds} idLabel="deal" />
			</div>
		);
	}

	const entityType = String(args.entityType ?? "record");
	const entityIds = (args.entityIds ?? []) as string[];
	const patch = (args.patch ?? {}) as Record<string, unknown>;
	const patchKeys = Object.keys(patch);

	return (
		<div className="space-y-2.5">
			<div className="flex items-center gap-2 rounded-[var(--radius)] border border-amber-300/60 bg-amber-50/60 px-3 py-2 dark:border-amber-700/40 dark:bg-amber-950/20">
				<Layers className="size-4 text-amber-700 dark:text-amber-300" />
				<span className="font-semibold text-sm">
					Bulk update {entityIds.length} {entityType}
					{entityIds.length === 1 ? "" : "s"}
				</span>
			</div>

			<SampleRow ids={entityIds} idLabel={entityType} />

			{patchKeys.length > 0 && (
				<div className="rounded-[var(--radius)] border border-border/60 bg-muted/30 px-3 py-2">
					<p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
						Setting these fields
					</p>
					<div className="flex flex-wrap gap-1">
						{patchKeys.slice(0, 8).map((k) => (
							<Badge key={k} variant="outline" className="font-mono text-[10px]">
								{k}
							</Badge>
						))}
						{patchKeys.length > 8 && (
							<Badge variant="outline" className="text-[10px]">
								+{patchKeys.length - 8} more
							</Badge>
						)}
					</div>
				</div>
			)}
		</div>
	);
}

function SampleRow({ ids, idLabel }: { ids: string[]; idLabel: string }) {
	const sample = ids.slice(0, 3);
	const more = ids.length - sample.length;
	return (
		<div className="rounded-[var(--radius)] border border-border/60 bg-muted/30 px-3 py-2">
			<p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
				{ids.length} {idLabel}
				{ids.length === 1 ? "" : "s"}
			</p>
			<div className="flex flex-wrap gap-1">
				{sample.map((id) => (
					<Badge key={id} variant="secondary" className="font-mono text-[10px]">
						{id}
					</Badge>
				))}
				{more > 0 && (
					<Badge variant="secondary" className="text-[10px]">
						+{more} more
					</Badge>
				)}
			</div>
		</div>
	);
}
