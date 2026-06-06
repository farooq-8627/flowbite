"use client";

/**
 * Owner-panel WhatsApp templates view (B.40).
 *
 * Lists every template visible to the platform owner — built-ins seeded
 * by `_migrations/2026_06_05_seedDefaultWhatsappTemplates` plus every
 * org override. Operators can create new built-ins, archive (active
 * toggle), edit body / variables / approval status, and soft-delete
 * org overrides. Built-ins refuse delete (the seed migration would
 * recreate them anyway) — archive instead.
 *
 * The capability `send_whatsapp` reads from this table at runtime, so
 * an edit here propagates to the next outbound send for every org with
 * no override + every org with an override that points to the same id.
 *
 * RBAC: every read + write here is gated server-side via
 * `requirePlatformOwner`; this view assumes the layout has already
 * authenticated the operator. The body never trusts client state for
 * authority — it just renders.
 *
 * Spec: `Future-Enhancements.md §B.40`.
 */

import { useMutation, useQuery } from "convex/react";
import { Loader2, Lock, Plus, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@/components/ui/table";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { normalizeError } from "@/lib/normalizeError";
import { OwnerSettingsCard } from "../../components/OwnerSettingsCard";
import { TemplateEditorDrawer } from "./TemplateEditorDrawer";

type ApprovalStatus = "draft" | "submitted" | "approved" | "rejected";
type Category = "utility" | "marketing" | "authentication";

const STATUS_LABEL: Record<ApprovalStatus, string> = {
	draft: "Draft",
	submitted: "Submitted",
	approved: "Approved",
	rejected: "Rejected",
};

const STATUS_TINT: Record<ApprovalStatus, string> = {
	draft: "bg-muted text-muted-foreground",
	submitted: "bg-amber-500/15 text-amber-700 dark:text-amber-300",
	approved: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
	rejected: "bg-rose-500/15 text-rose-700 dark:text-rose-300",
};

export function WhatsappTemplatesView() {
	const rows = useQuery(api._platform.whatsappTemplates.queries.listAllForOwner, {});
	const remove = useMutation(api._platform.whatsappTemplates.mutations.deleteTemplate);

	const [filter, setFilter] = useState<"all" | "built-in" | "overrides">("all");
	const [statusFilter, setStatusFilter] = useState<ApprovalStatus | "all">("all");
	const [search, setSearch] = useState("");
	const [editing, setEditing] = useState<{
		mode: "create" | "edit";
		id?: Id<"whatsappTemplates">;
	} | null>(null);
	const [busyId, setBusyId] = useState<Id<"whatsappTemplates"> | null>(null);

	const filtered = useMemo(() => {
		if (!rows) return [];
		return rows.filter((r) => {
			if (filter === "built-in" && !r.isBuiltIn) return false;
			if (filter === "overrides" && r.isBuiltIn) return false;
			if (statusFilter !== "all" && r.approvalStatus !== statusFilter) return false;
			if (search.trim()) {
				const q = search.trim().toLowerCase();
				if (
					!r.templateId.toLowerCase().includes(q) &&
					!r.label.toLowerCase().includes(q) &&
					!r.body.toLowerCase().includes(q)
				) {
					return false;
				}
			}
			return true;
		});
	}, [rows, filter, statusFilter, search]);

	if (rows === undefined) {
		return (
			<div className="flex items-center gap-2 text-sm text-muted-foreground">
				<Loader2 className="h-4 w-4 animate-spin" /> Loading templates…
			</div>
		);
	}

	async function handleDelete(id: Id<"whatsappTemplates">, templateId: string) {
		const confirmed =
			typeof window === "undefined"
				? true
				: window.confirm(`Delete template "${templateId}"? This cannot be undone.`);
		if (!confirmed) return;
		setBusyId(id);
		try {
			await remove({ templateRowId: id });
			toast.success(`Deleted "${templateId}"`);
		} catch (err) {
			toast.error(normalizeError(err, "Could not delete template"));
		} finally {
			setBusyId(null);
		}
	}

	const builtInCount = rows.filter((r) => r.isBuiltIn).length;
	const overrideCount = rows.filter((r) => !r.isBuiltIn).length;

	return (
		<div className="flex flex-col gap-4">
			<OwnerSettingsCard
				title="WhatsApp templates"
				description={`Live SSOT for the templates the AI can use to send out-of-window WhatsApp messages. Edits here apply to the next outbound send across every org. ${builtInCount} built-in${builtInCount === 1 ? "" : "s"} · ${overrideCount} org override${overrideCount === 1 ? "" : "s"}.`}
				footer={
					<div className="flex flex-wrap items-center justify-between gap-3">
						<div className="flex flex-wrap items-center gap-1 text-xs">
							<button
								type="button"
								onClick={() => setFilter("all")}
								className={pillClass(filter === "all")}
							>
								All ({rows.length})
							</button>
							<button
								type="button"
								onClick={() => setFilter("built-in")}
								className={pillClass(filter === "built-in")}
							>
								Built-ins ({builtInCount})
							</button>
							<button
								type="button"
								onClick={() => setFilter("overrides")}
								className={pillClass(filter === "overrides")}
							>
								Overrides ({overrideCount})
							</button>
						</div>
						<Button
							type="button"
							size="sm"
							variant="outline"
							onClick={() => setEditing({ mode: "create" })}
						>
							<Plus className="me-1.5 h-3.5 w-3.5" /> New template
						</Button>
					</div>
				}
			>
				<div className="mb-3 flex flex-wrap items-center gap-2">
					<Input
						value={search}
						onChange={(e) => setSearch(e.target.value)}
						placeholder="Search id / label / body…"
						className="max-w-sm"
						autoComplete="off"
					/>
					<select
						value={statusFilter}
						onChange={(e) => setStatusFilter(e.target.value as ApprovalStatus | "all")}
						className="h-9 rounded-[var(--radius)] border border-input bg-background px-3 text-sm outline-none focus:border-ring"
					>
						<option value="all">Any status</option>
						<option value="draft">Draft</option>
						<option value="submitted">Submitted</option>
						<option value="approved">Approved</option>
						<option value="rejected">Rejected</option>
					</select>
				</div>

				<div className="overflow-x-auto">
					<Table>
						<TableHeader>
							<TableRow>
								<TableHead className="w-[160px]">Template id</TableHead>
								<TableHead>Label</TableHead>
								<TableHead className="w-[110px]">Category</TableHead>
								<TableHead className="w-[110px]">Status</TableHead>
								<TableHead className="w-[110px]">Active</TableHead>
								<TableHead className="text-end">Actions</TableHead>
							</TableRow>
						</TableHeader>
						<TableBody>
							{filtered.length === 0 ? (
								<TableRow>
									<TableCell
										colSpan={6}
										className="text-sm text-muted-foreground"
									>
										No templates match.
									</TableCell>
								</TableRow>
							) : (
								filtered.map((r) => (
									<TableRow key={r._id}>
										<TableCell className="font-mono text-xs">
											{r.templateId}
											{r.isBuiltIn ? (
												<Lock
													className="ms-1.5 inline-block h-3 w-3 text-muted-foreground"
													aria-label="Built-in (cannot be deleted; archive instead)"
												/>
											) : null}
										</TableCell>
										<TableCell className="text-sm">
											<button
												type="button"
												onClick={() =>
													setEditing({ mode: "edit", id: r._id })
												}
												className="text-start hover:underline"
											>
												{r.label}
											</button>
											{r.description ? (
												<p className="mt-0.5 line-clamp-1 text-[11px] text-muted-foreground">
													{r.description}
												</p>
											) : null}
										</TableCell>
										<TableCell>
											<span className="rounded-[var(--radius)] bg-muted px-1.5 py-0.5 font-mono text-[10px] uppercase">
												{r.category}
											</span>
										</TableCell>
										<TableCell>
											<span
												className={[
													"rounded-[var(--radius)] px-1.5 py-0.5 text-[10px] font-medium",
													STATUS_TINT[r.approvalStatus as ApprovalStatus],
												].join(" ")}
											>
												{STATUS_LABEL[r.approvalStatus as ApprovalStatus]}
											</span>
										</TableCell>
										<TableCell className="text-xs">
											{r.active ? (
												<span className="rounded-[var(--radius)] bg-emerald-500/15 px-1.5 py-0.5 text-[10px] font-medium text-emerald-700 dark:text-emerald-300">
													Active
												</span>
											) : (
												<span className="rounded-[var(--radius)] bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
													Archived
												</span>
											)}
										</TableCell>
										<TableCell className="text-end">
											<div className="inline-flex items-center gap-1">
												<Button
													type="button"
													size="sm"
													variant="ghost"
													onClick={() =>
														setEditing({
															mode: "edit",
															id: r._id,
														})
													}
												>
													Edit
												</Button>
												{!r.isBuiltIn ? (
													<Button
														type="button"
														size="sm"
														variant="ghost"
														disabled={busyId === r._id}
														onClick={() =>
															handleDelete(r._id, r.templateId)
														}
														aria-label={`Delete ${r.templateId}`}
													>
														{busyId === r._id ? (
															<Loader2 className="h-3.5 w-3.5 animate-spin" />
														) : (
															<Trash2 className="h-3.5 w-3.5" />
														)}
													</Button>
												) : null}
											</div>
										</TableCell>
									</TableRow>
								))
							)}
						</TableBody>
					</Table>
				</div>
			</OwnerSettingsCard>

			{editing ? (
				<TemplateEditorDrawer
					mode={editing.mode}
					rowId={editing.id}
					onClose={() => setEditing(null)}
				/>
			) : null}
		</div>
	);
}

function pillClass(active: boolean): string {
	return [
		"rounded-[var(--radius)] px-2 py-1 transition-colors",
		active
			? "bg-foreground text-background"
			: "text-muted-foreground hover:bg-muted hover:text-foreground",
	].join(" ");
}

// `Category` is referenced in the row badge cast above only for typing.
// Keep this export available for the editor drawer (TemplateEditorDrawer
// imports it via the API row shape).
export type { Category };
