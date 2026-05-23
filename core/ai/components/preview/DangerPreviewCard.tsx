"use client";
/**
 * core/ai/components/preview/DangerPreviewCard.tsx
 *
 * Two-step preview for restore + (future) permanent-delete operations.
 *
 * Restore is technically non-destructive (it brings a record BACK from
 * the trash), but it touches RBAC and counters and tags, so we render
 * it with a soft-amber treatment and the "this will affect" copy.
 *
 * Hard-delete / cascade-delete actions can re-use this card later by
 * passing `severity="danger"` — the styling switches to red and the
 * confirmation copy gets stricter.
 */
import { AlertTriangle, RotateCcw, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { PreviewCardProps } from "./index";

interface ExtendedProps extends PreviewCardProps {
	/** Force the danger variant — defaults to "warning" for restore. */
	severity?: "warning" | "danger";
}

export function DangerPreviewCard({ args, severity = "warning" }: ExtendedProps) {
	// Tool name the model invoked; we don't always get it here, infer from args.
	const isRestore = !!args.entityType && !!args.entityId && !args.confirmDelete;
	const entityType = args.entityType ? String(args.entityType) : "record";
	const name = args.name ? String(args.name) : null;
	const entityId = args.entityId ? String(args.entityId) : null;

	const tone =
		severity === "danger"
			? "border-rose-300/60 bg-rose-50/60 text-rose-900 dark:border-rose-700/40 dark:bg-rose-950/20 dark:text-rose-100"
			: "border-amber-300/60 bg-amber-50/60 text-amber-900 dark:border-amber-700/40 dark:bg-amber-950/20 dark:text-amber-100";

	const Icon = isRestore ? RotateCcw : severity === "danger" ? Trash2 : AlertTriangle;

	return (
		<div className={cn("space-y-2 rounded-[var(--radius)] border p-3", tone)}>
			<div className="flex items-center gap-2">
				<Icon className="size-4" />
				<span className="font-semibold text-sm">
					{isRestore ? `Restore ${entityType}` : `Permanently delete ${entityType}`}
				</span>
				{entityId && (
					<Badge variant="outline" className="ms-auto font-mono text-[10px]">
						{entityId.slice(0, 12)}
					</Badge>
				)}
			</div>

			{name && (
				<div className="rounded-[var(--radius)] bg-background/40 px-2.5 py-1.5 text-xs font-medium">
					{name}
				</div>
			)}

			<p className="text-[11px] leading-relaxed opacity-80">
				{isRestore
					? "Brings the record back from trash. Counters and tags are re-applied; references in deals and notes will resolve again."
					: "This action is permanent and cannot be undone. The record and all linked notes, reminders and references will be erased."}
			</p>
		</div>
	);
}
