"use client";
/**
 * core/ai/components/preview/EntityDiffCard.tsx
 *
 * Two-step preview for the universal `update_entity` tool.
 *
 * The model proposes `{ entityType, code, patch: { field: newValue, … } }`.
 * We render a diff-style view: each patched key on its own row with the
 * new value rendered in a contrasting color. Old values aren't available
 * here — fetching them would require a tool round-trip — so we present
 * the patch as "incoming change" rather than red-strikethrough.
 *
 * If the patch happens to include a stage-id, we hint that the user
 * should use `move_deal_stage` instead (matches the tool's description).
 */
import { ArrowRight, Pencil } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { useEntityLabels } from "@/core/shell/shared/hooks/useEntityLabels";
import { cn } from "@/lib/utils";
import type { PreviewCardProps } from "./index";

const SLOT_LABEL: Record<string, "lead" | "contact" | "deal" | "company"> = {
	lead: "lead",
	contact: "contact",
	deal: "deal",
	company: "company",
};

function formatValue(v: unknown): string {
	if (v === null) return "null";
	if (v === undefined) return "—";
	if (typeof v === "string") return v;
	if (typeof v === "number" || typeof v === "boolean") return String(v);
	if (Array.isArray(v)) return v.length === 0 ? "[]" : `[${v.length} items]`;
	if (typeof v === "object") {
		try {
			return JSON.stringify(v);
		} catch {
			return "[object]";
		}
	}
	return String(v);
}

export function EntityDiffCard({ args }: PreviewCardProps) {
	const labels = useEntityLabels();
	const entityType = String(args.entityType ?? "lead");
	const code = String(args.code ?? "—");
	const patch = (args.patch ?? {}) as Record<string, unknown>;
	const entries = Object.entries(patch);
	const slotKey = SLOT_LABEL[entityType] ?? "lead";
	const labelSingular = labels[slotKey].singular ?? entityType;

	const hasStageKey = entries.some(
		(e) => e[0].toLowerCase().includes("stage") || e[0].toLowerCase() === "pipelineid",
	);

	return (
		<div className="space-y-2.5">
			<div className="flex items-center gap-2">
				<div className="flex size-7 shrink-0 items-center justify-center rounded-[var(--radius)] bg-primary/10 text-primary">
					<Pencil className="size-3.5" />
				</div>
				<span className="font-semibold text-sm">Update {labelSingular}</span>
				<Badge variant="outline" className="ms-auto font-mono text-[10px]">
					{code}
				</Badge>
			</div>

			{hasStageKey && entityType === "deal" && (
				<div className="rounded-[var(--radius)] border border-amber-300/60 bg-amber-50/60 px-3 py-1.5 text-[11px] text-amber-800 dark:border-amber-700/40 dark:bg-amber-950/20 dark:text-amber-200">
					⚠ Stage changes should use <code className="font-mono">move_deal_stage</code>.
					Approve at your own risk.
				</div>
			)}

			<dl
				className={cn(
					"divide-y divide-border/60 rounded-[var(--radius)] border border-border/60",
					"bg-muted/30",
				)}
			>
				{entries.length === 0 ? (
					<div className="px-3 py-2 text-[11px] italic text-muted-foreground">
						(no fields to update)
					</div>
				) : (
					entries.slice(0, 8).map(([key, value]) => (
						<div key={key} className="flex items-center gap-2 px-3 py-1.5 text-[11px]">
							<dt className="min-w-24 shrink-0 font-medium text-muted-foreground">
								{key}
							</dt>
							<ArrowRight className="size-3 shrink-0 text-muted-foreground/60" />
							<dd className="min-w-0 flex-1 truncate font-mono text-foreground">
								{formatValue(value)}
							</dd>
						</div>
					))
				)}
				{entries.length > 8 && (
					<div className="px-3 py-1.5 text-[10px] italic text-muted-foreground">
						+{entries.length - 8} more field{entries.length - 8 === 1 ? "" : "s"}
					</div>
				)}
			</dl>
		</div>
	);
}
