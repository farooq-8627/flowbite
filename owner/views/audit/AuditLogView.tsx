"use client";

/**
 * Owner-panel audit log view (Stage 4 — real implementation).
 *
 * Cursor-paginated table over `platformAuditLogs`. Click a row to open a
 * drawer with the full before/after JSON diff. The list never `.collect()`s
 * — pagination is mandatory because the table grows monotonically (S10
 * in PLATFORM-OWNER-PANEL.md §13).
 *
 * Spec: PLATFORM-OWNER-PANEL.md §5 row 7, §10 stage 4.
 */
import { usePaginatedQuery } from "convex/react";
import { Loader2 } from "lucide-react";
import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import {
	Sheet,
	SheetContent,
	SheetDescription,
	SheetHeader,
	SheetTitle,
} from "@/components/ui/sheet";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@/components/ui/table";
import { api } from "@/convex/_generated/api";
import type { Doc } from "@/convex/_generated/dataModel";
import { OwnerSettingsCard } from "../../components/OwnerSettingsCard";

type AuditRow = Doc<"platformAuditLogs">;

const PAGE_SIZE = 25;

export function AuditLogView() {
	const { results, status, loadMore } = usePaginatedQuery(
		api._platform.audit.queries.listAuditLogs,
		{},
		{ initialNumItems: PAGE_SIZE },
	);

	const [open, setOpen] = useState<AuditRow | null>(null);

	return (
		<>
			<OwnerSettingsCard
				title="Audit log"
				description="Append-only record of every owner-panel mutation. Click a row to inspect the before/after diff."
			>
				{status === "LoadingFirstPage" ? (
					<div className="flex items-center gap-2 text-sm text-muted-foreground">
						<Loader2 className="h-4 w-4 animate-spin" /> Loading…
					</div>
				) : results.length === 0 ? (
					<p className="text-sm text-muted-foreground">
						No actions recorded yet. Owner mutations will appear here.
					</p>
				) : (
					<div className="overflow-x-auto">
						<Table>
							<TableHeader>
								<TableRow>
									<TableHead>When</TableHead>
									<TableHead>Action</TableHead>
									<TableHead>Actor</TableHead>
									<TableHead>Target</TableHead>
									<TableHead className="text-end">Detail</TableHead>
								</TableRow>
							</TableHeader>
							<TableBody>
								{results.map((row) => (
									<TableRow key={row._id} className="cursor-pointer">
										<TableCell className="whitespace-nowrap text-xs text-muted-foreground">
											{new Date(row.createdAt).toLocaleString()}
										</TableCell>
										<TableCell className="font-mono text-xs">
											{row.action}
										</TableCell>
										<TableCell className="text-xs">{row.actorEmail}</TableCell>
										<TableCell className="text-xs">
											{row.targetType ? (
												<span>
													<span className="text-muted-foreground">
														{row.targetType}:
													</span>{" "}
													<span className="font-mono">
														{row.targetId ?? "—"}
													</span>
												</span>
											) : (
												"—"
											)}
										</TableCell>
										<TableCell className="text-end">
											<Button
												type="button"
												variant="ghost"
												size="sm"
												onClick={() => setOpen(row)}
											>
												View diff
											</Button>
										</TableCell>
									</TableRow>
								))}
							</TableBody>
						</Table>
					</div>
				)}

				<div className="mt-4 flex items-center justify-between text-xs text-muted-foreground">
					<span>
						{results.length} loaded · {status}
					</span>
					{status === "CanLoadMore" || status === "LoadingMore" ? (
						<Button
							type="button"
							variant="outline"
							size="sm"
							onClick={() => loadMore(PAGE_SIZE)}
							disabled={status !== "CanLoadMore"}
						>
							{status === "LoadingMore" ? (
								<>
									<Loader2 className="me-2 h-4 w-4 animate-spin" />
									Loading…
								</>
							) : (
								"Load more"
							)}
						</Button>
					) : null}
				</div>
			</OwnerSettingsCard>

			<AuditDiffDrawer row={open} onClose={() => setOpen(null)} />
		</>
	);
}

function AuditDiffDrawer({ row, onClose }: { row: AuditRow | null; onClose: () => void }) {
	const before = useMemo(() => safeStringify(row?.before), [row]);
	const after = useMemo(() => safeStringify(row?.after), [row]);
	return (
		<Sheet open={row !== null} onOpenChange={(v) => (v ? null : onClose())}>
			<SheetContent side="end" className="w-full max-w-2xl overflow-y-auto sm:max-w-3xl">
				<SheetHeader>
					<SheetTitle className="font-mono text-base">
						{row?.action ?? "Audit entry"}
					</SheetTitle>
					<SheetDescription>
						{row
							? `${new Date(row.createdAt).toLocaleString()} · by ${row.actorEmail}`
							: ""}
					</SheetDescription>
				</SheetHeader>
				{row ? (
					<div className="mt-4 space-y-4 px-4 pb-6 text-sm">
						<DiffPanel label="Before" content={before} tone="muted" />
						<DiffPanel label="After" content={after} tone="primary" />
						{row.reason ? (
							<div className="space-y-1">
								<h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
									Reason
								</h4>
								<p className="rounded-[var(--radius)] bg-muted/50 p-3 text-sm">
									{row.reason}
								</p>
							</div>
						) : null}
						<dl className="grid grid-cols-3 gap-2 text-xs">
							<dt className="text-muted-foreground">Target</dt>
							<dd className="col-span-2 font-mono">
								{row.targetType ?? "—"}:{row.targetId ?? "—"}
							</dd>
							<dt className="text-muted-foreground">IP</dt>
							<dd className="col-span-2 font-mono">{row.ip ?? "—"}</dd>
							<dt className="text-muted-foreground">UA</dt>
							<dd className="col-span-2 break-all font-mono">
								{row.userAgent ?? "—"}
							</dd>
						</dl>
					</div>
				) : null}
			</SheetContent>
		</Sheet>
	);
}

function DiffPanel({
	label,
	content,
	tone,
}: {
	label: string;
	content: string;
	tone: "muted" | "primary";
}) {
	return (
		<div className="space-y-1">
			<h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
				{label}
			</h4>
			<pre
				className={`max-h-64 overflow-auto whitespace-pre-wrap break-all rounded-[var(--radius)] p-3 font-mono text-xs ${
					tone === "primary"
						? "bg-primary/5 text-foreground"
						: "bg-muted/40 text-muted-foreground"
				}`}
			>
				{content}
			</pre>
		</div>
	);
}

function safeStringify(value: unknown): string {
	if (value === undefined || value === null) return "—";
	try {
		return JSON.stringify(value, null, 2);
	} catch {
		return String(value);
	}
}
