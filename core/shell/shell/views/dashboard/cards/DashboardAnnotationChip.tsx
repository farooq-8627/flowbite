"use client";

/**
 * core/shell/shell/views/dashboard/cards/DashboardAnnotationChip.tsx
 *
 * Stage 5 of /DASHBOARD-V2-PLAN.md (2026-05-29). Single annotation
 * chip + container surface that renders any `dashboardAnnotations`
 * rows for a given (orgId, widgetKey) pair (or unanchored chips when
 * widgetKey is omitted).
 *
 * Per the architectural rule: annotations are org-wide but
 * per-user-dismissable. The dismiss mutation appends the caller's
 * userId to the row's `dismissedByUserIds[]` — the row itself stays
 * visible to other members.
 *
 * Severity → colour:
 *   - info     → slate
 *   - warning  → amber
 *   - critical → red
 */

import { useMutation, useQuery } from "convex/react";
import { AlertTriangle, Info, ShieldAlert, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { api } from "@/convex/_generated/api";
import type { Doc, Id } from "@/convex/_generated/dataModel";
import { sendChatPrefill } from "@/core/ai/lib/chatPrefill";
import { cn } from "@/lib/utils";

interface DashboardAnnotationChipsProps {
	orgId: Id<"orgs">;
	widgetKey?: string; // empty/undefined = AI Pulse-only (unanchored) chips
	limit?: number;
	className?: string;
}

export function DashboardAnnotationChips({
	orgId,
	widgetKey,
	limit = 5,
	className,
}: DashboardAnnotationChipsProps) {
	const rows = useQuery(api.dashboard.annotations.queries.listForOrg, {
		orgId,
		widgetKey,
		limit,
	});

	if (!rows || rows.length === 0) return null;

	return (
		<div className={cn("flex flex-col gap-1.5", className)}>
			{rows.map((row) => (
				<AnnotationChip key={row._id} row={row} orgId={orgId} />
			))}
		</div>
	);
}

// ─── Single chip ─────────────────────────────────────────────────────────────

interface AnnotationChipProps {
	row: Doc<"dashboardAnnotations">;
	orgId: Id<"orgs">;
}

function AnnotationChip({ row, orgId }: AnnotationChipProps) {
	const dismiss = useMutation(api.dashboard.annotations.mutations.dismiss);
	const tone = severityToTone(row.severity);
	const Icon = severityToIcon(row.severity);

	return (
		<div
			className={cn(
				"flex items-start gap-2 rounded-[var(--radius)] border px-2.5 py-1.5 text-xs",
				tone,
			)}
			role="status"
		>
			<Icon className="h-3.5 w-3.5 mt-0.5 shrink-0" aria-hidden="true" />
			<div className="flex-1 min-w-0">
				<p className="font-medium leading-tight">{row.note}</p>
				{row.facts && row.facts.length > 0 && (
					<ul className="mt-0.5 space-y-0.5 text-muted-foreground">
						{row.facts.slice(0, 3).map((f) => (
							<li key={f} className="truncate">
								{f}
							</li>
						))}
					</ul>
				)}
				{row.suggestedIntent && (
					<button
						type="button"
						onClick={() => sendChatPrefill(row.suggestedIntent ?? "")}
						className="mt-1 text-primary underline-offset-2 hover:underline"
					>
						Investigate →
					</button>
				)}
			</div>
			<Button
				type="button"
				size="icon"
				variant="ghost"
				className="h-6 w-6 -my-0.5 -me-1"
				onClick={() => {
					void dismiss({ orgId, annotationId: row._id });
				}}
				aria-label="Dismiss"
			>
				<X className="h-3 w-3" aria-hidden="true" />
			</Button>
		</div>
	);
}

function severityToTone(s: "info" | "warning" | "critical"): string {
	if (s === "critical") return "border-red-500/40 bg-red-500/10 text-red-700 dark:text-red-300";
	if (s === "warning")
		return "border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300";
	return "border-slate-300/40 bg-muted/40 text-muted-foreground";
}

function severityToIcon(s: "info" | "warning" | "critical") {
	if (s === "critical") return ShieldAlert;
	if (s === "warning") return AlertTriangle;
	return Info;
}
