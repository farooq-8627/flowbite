"use client";

/**
 * core/ai/components/preview/CsvImportPreviewCard.tsx
 *
 * Two-step preview for `import_csv` (`PHASE-3-AI-AUDIT.md §6 Week 4 row
 * 4.3`). The propose() payload from the AI tool only carries
 * { csvImportId, targetEntity, rowCount } — this card hydrates the rich
 * preview rows from `convex/ai/csvImports.ts:get` so the user sees the
 * parser's per-row dedup decisions before approving.
 *
 * Layout:
 *   ┌────────────────────────────────────────────────────────┐
 *   │ 432 rows from contacts.csv                             │
 *   │  [ 401 insert ] [ 18 merge ] [ 11 skip ] [ 2 errors ]  │
 *   ├────────────────────────────────────────────────────────┤
 *   │ Sample (first 5 rows)                                  │
 *   │   ┌──────────────┬──────────────────┬──────────────┐  │
 *   │   │ Sarah Khan   │ sarah@acme.com   │ INSERT       │  │
 *   │   │ Ali Rashid   │ ali@gulf.ae      │ MERGE → P-04 │  │
 *   │   │ Maya Patel   │ maya@x.io        │ SKIP (dup)   │  │
 *   │   └──────────────┴──────────────────┴──────────────┘  │
 *   └────────────────────────────────────────────────────────┘
 *
 * Future: the per-row buttons that flip dedupDecision live in
 * `Future-Enhancements.md §B.x` (per-row override). Approving the
 * propose accepts the parser's decisions verbatim; the user can re-run
 * the import after editing the file if they disagree.
 */

import { useQuery } from "convex/react";
import { anyApi } from "convex/server";
import { AlertTriangle, FileText, Loader2, Merge, PlusCircle, SkipForward } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import type { Id } from "@/convex/_generated/dataModel";
import { useCurrentOrg } from "@/core/shell/shared/hooks/useCurrentOrg";
import type { PreviewCardProps } from "./index";

type CsvPreviewRow = {
	idemKey: string;
	fields: Record<string, string | null>;
	dedupDecision: "insert" | "merge" | "skip";
	dedupTargetCode?: string;
	validationError?: string;
};

type CsvImportRow = {
	status: string;
	rowCount: number;
	previewRows: CsvPreviewRow[];
	errors?: string[];
	parserModel?: string;
	sourceHeaders?: string[];
} | null;

const SAMPLE_ROWS = 5;

export function CsvImportPreviewCard({ args }: PreviewCardProps) {
	const csvImportId = (args.csvImportId ?? null) as string | null;
	const targetEntity = String(args.targetEntity ?? "lead");
	const proposedRowCount = typeof args.rowCount === "number" ? args.rowCount : null;

	const { orgId } = useCurrentOrg();

	// Fetch the rich preview from the DB. The propose() payload only
	// carries the id; the real per-row data is too big to round-trip
	// through the model's context.
	const importRow = useQuery(
		anyApi.ai.csvImports.get,
		csvImportId
			? { orgId: orgId as Id<"orgs">, csvImportId: csvImportId as Id<"csvImports"> }
			: "skip",
	) as CsvImportRow | undefined;

	if (!csvImportId) {
		return (
			<div className="rounded-[var(--radius)] border border-dashed bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
				CSV import id missing — re-run the import.
			</div>
		);
	}

	if (importRow === undefined) {
		return (
			<div className="flex items-center gap-2 rounded-[var(--radius)] border bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
				<Loader2 className="size-3.5 animate-spin" />
				Loading preview…
			</div>
		);
	}

	if (importRow === null) {
		return (
			<div className="rounded-[var(--radius)] border border-rose-300/60 bg-rose-50/40 px-3 py-2 text-xs text-rose-900 dark:border-rose-700/40 dark:bg-rose-950/20 dark:text-rose-100">
				CSV import not found — it may have expired or been cancelled.
			</div>
		);
	}

	if (importRow.status === "parsing") {
		return (
			<div className="flex items-center gap-2 rounded-[var(--radius)] border bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
				<Loader2 className="size-3.5 animate-spin" />
				Parsing rows… {proposedRowCount ? `(${proposedRowCount} expected)` : ""}
			</div>
		);
	}

	if (importRow.status === "failed") {
		return (
			<div className="space-y-2 rounded-[var(--radius)] border border-rose-300/60 bg-rose-50/40 px-3 py-2 text-rose-900 dark:border-rose-700/40 dark:bg-rose-950/20 dark:text-rose-100">
				<div className="flex items-center gap-2">
					<AlertTriangle className="size-4" />
					<span className="text-xs font-semibold">CSV parse failed</span>
				</div>
				{importRow.errors?.map((e) => (
					<p key={e} className="text-[11px]">
						{e}
					</p>
				))}
			</div>
		);
	}

	if (importRow.status === "completed") {
		return (
			<div className="rounded-[var(--radius)] border border-emerald-300/60 bg-emerald-50/40 px-3 py-2 text-xs text-emerald-900 dark:border-emerald-700/40 dark:bg-emerald-950/20 dark:text-emerald-100">
				CSV import already committed.
			</div>
		);
	}

	// Tally per-decision counts.
	const tally = { insert: 0, merge: 0, skip: 0, error: 0 };
	for (const r of importRow.previewRows) {
		if (r.validationError) tally.error++;
		else tally[r.dedupDecision]++;
	}

	const sample = importRow.previewRows.slice(0, SAMPLE_ROWS);

	return (
		<div className="space-y-2.5 min-w-0">
			{/* Header banner */}
			<div className="flex items-center gap-2 rounded-[var(--radius)] border border-amber-300/60 bg-amber-50/60 px-3 py-2 dark:border-amber-700/40 dark:bg-amber-950/20">
				<FileText className="size-4 text-amber-700 dark:text-amber-300 shrink-0" />
				<span className="text-sm font-semibold truncate">
					Import {importRow.rowCount} {targetEntity}
					{importRow.rowCount === 1 ? "" : "s"} from CSV
				</span>
			</div>

			{/* Decision badges */}
			<div className="flex flex-wrap gap-1.5">
				<DecisionBadge tone="emerald" Icon={PlusCircle} label={`${tally.insert} insert`} />
				<DecisionBadge tone="sky" Icon={Merge} label={`${tally.merge} merge`} />
				<DecisionBadge tone="slate" Icon={SkipForward} label={`${tally.skip} skip`} />
				{tally.error > 0 && (
					<DecisionBadge
						tone="rose"
						Icon={AlertTriangle}
						label={`${tally.error} error${tally.error === 1 ? "" : "s"}`}
					/>
				)}
			</div>

			{/* Sample rows table */}
			{sample.length > 0 && (
				<div className="rounded-[var(--radius)] border border-border/60 bg-muted/30 overflow-hidden">
					<div className="px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground border-b border-border/60">
						Sample (first {sample.length} of {importRow.rowCount})
					</div>
					<div className="max-h-[14rem] overflow-y-auto">
						<table className="w-full text-[11px]">
							<thead className="bg-background/50 sticky top-0">
								<tr className="text-start">
									<th className="px-3 py-1.5 text-start font-medium text-muted-foreground">
										Name
									</th>
									<th className="px-3 py-1.5 text-start font-medium text-muted-foreground">
										Email
									</th>
									<th className="px-3 py-1.5 text-end font-medium text-muted-foreground">
										Decision
									</th>
								</tr>
							</thead>
							<tbody>
								{sample.map((r) => (
									<tr
										key={r.idemKey}
										className="border-t border-border/60 align-top"
									>
										<td className="px-3 py-1.5 truncate max-w-[10rem]">
											{r.fields.displayName ?? (
												<span className="italic text-muted-foreground">
													missing
												</span>
											)}
										</td>
										<td className="px-3 py-1.5 truncate max-w-[12rem] font-mono">
											{r.fields.email ?? (
												<span className="italic text-muted-foreground">
													—
												</span>
											)}
										</td>
										<td className="px-3 py-1.5 text-end">
											<DecisionInlineLabel row={r} />
										</td>
									</tr>
								))}
							</tbody>
						</table>
					</div>
				</div>
			)}

			{/* Quarantined parser model footer */}
			{importRow.parserModel && (
				<p className="text-[10px] italic text-muted-foreground">
					Parsed by quarantined {importRow.parserModel}. Cells were treated as data, not
					instructions.
				</p>
			)}
		</div>
	);
}

function DecisionBadge({
	tone,
	Icon,
	label,
}: {
	tone: "emerald" | "sky" | "slate" | "rose";
	Icon: typeof PlusCircle;
	label: string;
}) {
	const cls = {
		emerald:
			"border-emerald-300/60 bg-emerald-50/60 text-emerald-900 dark:border-emerald-700/40 dark:bg-emerald-950/20 dark:text-emerald-100",
		sky: "border-sky-300/60 bg-sky-50/60 text-sky-900 dark:border-sky-700/40 dark:bg-sky-950/20 dark:text-sky-100",
		slate: "border-slate-300/60 bg-slate-50/60 text-slate-900 dark:border-slate-700/40 dark:bg-slate-950/20 dark:text-slate-100",
		rose: "border-rose-300/60 bg-rose-50/60 text-rose-900 dark:border-rose-700/40 dark:bg-rose-950/20 dark:text-rose-100",
	}[tone];
	return (
		<Badge variant="outline" className={`gap-1 text-[10px] font-medium ${cls}`}>
			<Icon className="size-3" />
			{label}
		</Badge>
	);
}

function DecisionInlineLabel({ row }: { row: CsvPreviewRow }) {
	if (row.validationError) {
		return (
			<span className="inline-flex items-center gap-1 text-[10px] font-medium text-rose-700 dark:text-rose-300">
				<AlertTriangle className="size-3" />
				Error
			</span>
		);
	}
	if (row.dedupDecision === "insert") {
		return (
			<span className="inline-flex items-center gap-1 text-[10px] font-medium text-emerald-700 dark:text-emerald-300">
				<PlusCircle className="size-3" />
				Insert
			</span>
		);
	}
	if (row.dedupDecision === "merge") {
		return (
			<span className="inline-flex items-center gap-1 text-[10px] font-medium text-sky-700 dark:text-sky-300">
				<Merge className="size-3" />
				Merge {row.dedupTargetCode ? `→ ${row.dedupTargetCode}` : ""}
			</span>
		);
	}
	return (
		<span className="inline-flex items-center gap-1 text-[10px] font-medium text-slate-700 dark:text-slate-300">
			<SkipForward className="size-3" />
			Skip
		</span>
	);
}
