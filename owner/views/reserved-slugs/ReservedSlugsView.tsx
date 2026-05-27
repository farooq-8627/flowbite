"use client";

/**
 * Owner-panel reserved-slugs view (Stage 2).
 *
 * `platformReservedSlugs` is the SSOT for every reserved name across
 * the platform — org slugs, template keys, industry-group keys,
 * per-org entity-label slugs, and free-form route reservations. Owner
 * can add / edit reason / remove non-built-in entries from this view.
 *
 * Built-in entries (`isBuiltIn: true`, seeded by the static-file
 * migration) cannot be removed — the system still depends on them.
 * Their reason text is editable so operators can annotate why each
 * stays reserved.
 *
 * Spec: INDUSTRY-TEMPLATES-DB-MIGRATION.md §5.3 ReservedSlugsView, §7.
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
import { Textarea } from "@/components/ui/textarea";
import { api } from "@/convex/_generated/api";
import { normalizeError } from "@/lib/normalizeError";
import { OwnerSettingsCard } from "../../components/OwnerSettingsCard";

type Category = "org" | "template" | "industryGroup" | "entitySlug" | "route";

const CATEGORY_LABELS: Record<Category, string> = {
	org: "Org slug",
	template: "Template",
	industryGroup: "Industry group",
	entitySlug: "Entity slug",
	route: "Route",
};

const CATEGORY_ORDER: Category[] = ["org", "route", "template", "industryGroup", "entitySlug"];

export function ReservedSlugsView() {
	const [categoryFilter, setCategoryFilter] = useState<Category | "all">("all");
	const [search, setSearch] = useState("");
	const [editing, setEditing] = useState<{
		slug: string;
		category: Category;
		reason: string;
	} | null>(null);
	const [showAdd, setShowAdd] = useState(false);

	const rows = useQuery(api._platform.reservedSlugs.queries.listAllForAdmin, {
		category: categoryFilter === "all" ? undefined : categoryFilter,
	});
	const counts = useQuery(api._platform.reservedSlugs.queries.countsByCategory, {});

	const createSlug = useMutation(api._platform.reservedSlugs.mutations.createReservedSlug);
	const removeSlug = useMutation(api._platform.reservedSlugs.mutations.removeReservedSlug);
	const updateSlug = useMutation(api._platform.reservedSlugs.mutations.updateReservedSlug);

	const filtered = useMemo(() => {
		if (!rows) return [];
		if (!search.trim()) return rows;
		const q = search.trim().toLowerCase();
		return rows.filter((r) => r.slug.includes(q) || (r.reason ?? "").toLowerCase().includes(q));
	}, [rows, search]);

	if (rows === undefined || counts === undefined) {
		return (
			<div className="flex items-center gap-2 text-sm text-muted-foreground">
				<Loader2 className="h-4 w-4 animate-spin" /> Loading reserved slugs…
			</div>
		);
	}

	return (
		<div className="flex flex-col gap-4">
			<OwnerSettingsCard
				title="Reserved slugs"
				description="The platform-wide reservation list. Built-in entries (🔒) are seeded from `convex/_shared/reservedSlugs.ts` — those can have their reason edited but cannot be removed. Custom entries can be added/removed freely."
				footer={
					<div className="flex flex-wrap items-center justify-between gap-2 text-xs">
						<div className="flex items-center gap-2">
							<button
								type="button"
								onClick={() => setCategoryFilter("all")}
								className={[
									"rounded-[var(--radius)] px-2 py-1",
									categoryFilter === "all"
										? "bg-foreground text-background"
										: "text-muted-foreground hover:bg-muted",
								].join(" ")}
							>
								All ({rows.length})
							</button>
							{CATEGORY_ORDER.map((c) => (
								<button
									key={c}
									type="button"
									onClick={() => setCategoryFilter(c)}
									className={[
										"rounded-[var(--radius)] px-2 py-1",
										categoryFilter === c
											? "bg-foreground text-background"
											: "text-muted-foreground hover:bg-muted",
									].join(" ")}
								>
									{CATEGORY_LABELS[c]} ({counts[c] ?? 0})
								</button>
							))}
						</div>
						<Button
							type="button"
							size="sm"
							variant="outline"
							onClick={() => setShowAdd(true)}
						>
							<Plus className="me-1.5 h-3.5 w-3.5" /> New reserved slug
						</Button>
					</div>
				}
			>
				<div className="mb-3">
					<Input
						value={search}
						onChange={(e) => setSearch(e.target.value)}
						placeholder="Search slugs / reasons…"
						className="max-w-sm"
						autoComplete="off"
					/>
				</div>

				{showAdd ? (
					<div className="mb-3 rounded-[var(--radius)] border border-dashed border-border bg-muted/40 p-3">
						<NewSlugForm
							onSubmit={async (slug, category, reason) => {
								try {
									await createSlug({ slug, category, reason });
									toast.success(`Reserved "${slug}" in ${category}`);
									setShowAdd(false);
								} catch (err) {
									toast.error(normalizeError(err, "Failed to add"));
								}
							}}
							onCancel={() => setShowAdd(false)}
						/>
					</div>
				) : null}

				<div className="overflow-x-auto">
					<Table>
						<TableHeader>
							<TableRow>
								<TableHead className="w-[120px]">Category</TableHead>
								<TableHead>Slug</TableHead>
								<TableHead>Reason</TableHead>
								<TableHead className="text-end">Actions</TableHead>
							</TableRow>
						</TableHeader>
						<TableBody>
							{filtered.length === 0 ? (
								<TableRow>
									<TableCell
										colSpan={4}
										className="text-sm text-muted-foreground"
									>
										No reserved slugs match.
									</TableCell>
								</TableRow>
							) : (
								filtered.map((r) => (
									<TableRow key={r._id}>
										<TableCell>
											<span className="rounded-[var(--radius)] bg-muted px-1.5 py-0.5 font-mono text-[10px] uppercase">
												{CATEGORY_LABELS[r.category as Category]}
											</span>
										</TableCell>
										<TableCell className="font-mono text-xs">
											{r.slug}
											{r.isBuiltIn ? (
												<Lock
													className="ms-1.5 inline-block h-3 w-3 text-muted-foreground"
													aria-label="Built-in (cannot be deleted)"
												/>
											) : null}
										</TableCell>
										<TableCell className="text-xs">
											{editing &&
											editing.slug === r.slug &&
											editing.category === r.category ? (
												<Textarea
													rows={2}
													value={editing.reason}
													onChange={(e) =>
														setEditing({
															...editing,
															reason: e.target.value,
														})
													}
													className="text-xs"
												/>
											) : (
												<span className="text-muted-foreground">
													{r.reason ?? "—"}
												</span>
											)}
										</TableCell>
										<TableCell className="text-end">
											{editing &&
											editing.slug === r.slug &&
											editing.category === r.category ? (
												<div className="flex justify-end gap-1">
													<Button
														type="button"
														size="sm"
														variant="ghost"
														onClick={() => setEditing(null)}
													>
														Cancel
													</Button>
													<Button
														type="button"
														size="sm"
														onClick={async () => {
															try {
																await updateSlug({
																	slug: r.slug,
																	category:
																		r.category as Category,
																	patch: {
																		reason: editing.reason,
																	},
																});
																toast.success("Reason saved");
																setEditing(null);
															} catch (err) {
																toast.error(
																	normalizeError(
																		err,
																		"Failed to save",
																	),
																);
															}
														}}
													>
														Save
													</Button>
												</div>
											) : (
												<div className="flex justify-end gap-1">
													<Button
														type="button"
														size="sm"
														variant="ghost"
														onClick={() =>
															setEditing({
																slug: r.slug,
																category: r.category as Category,
																reason: r.reason ?? "",
															})
														}
													>
														Edit reason
													</Button>
													<Button
														type="button"
														size="sm"
														variant="ghost"
														className="text-destructive hover:text-destructive"
														disabled={r.isBuiltIn}
														title={
															r.isBuiltIn
																? "Built-in entries cannot be removed"
																: "Remove"
														}
														onClick={async () => {
															if (
																!window.confirm(
																	`Remove reserved slug "${r.slug}" (${CATEGORY_LABELS[r.category as Category]})?`,
																)
															)
																return;
															try {
																await removeSlug({
																	slug: r.slug,
																	category:
																		r.category as Category,
																});
																toast.success("Removed");
															} catch (err) {
																toast.error(
																	normalizeError(
																		err,
																		"Failed to remove",
																	),
																);
															}
														}}
													>
														<Trash2 className="h-3.5 w-3.5" />
													</Button>
												</div>
											)}
										</TableCell>
									</TableRow>
								))
							)}
						</TableBody>
					</Table>
				</div>
			</OwnerSettingsCard>
		</div>
	);
}

function NewSlugForm({
	onSubmit,
	onCancel,
}: {
	onSubmit: (slug: string, category: Category, reason: string | undefined) => Promise<void>;
	onCancel: () => void;
}) {
	const [slug, setSlug] = useState("");
	const [category, setCategory] = useState<Category>("org");
	const [reason, setReason] = useState("");
	const [busy, setBusy] = useState(false);

	return (
		<div className="grid gap-2 sm:grid-cols-[1fr_140px_2fr_auto]">
			<Input
				placeholder="slug-name"
				value={slug}
				onChange={(e) => setSlug(e.target.value)}
				className="font-mono text-xs"
				autoComplete="off"
			/>
			<select
				value={category}
				onChange={(e) => setCategory(e.target.value as Category)}
				className="h-9 rounded-[var(--radius)] border border-input bg-background px-3 text-xs outline-none focus:border-ring"
			>
				{CATEGORY_ORDER.map((c) => (
					<option key={c} value={c}>
						{CATEGORY_LABELS[c]}
					</option>
				))}
			</select>
			<Input
				placeholder="Reason (optional)"
				value={reason}
				onChange={(e) => setReason(e.target.value)}
				autoComplete="off"
			/>
			<div className="flex gap-1">
				<Button type="button" size="sm" variant="ghost" onClick={onCancel}>
					Cancel
				</Button>
				<Button
					type="button"
					size="sm"
					disabled={busy || !slug.trim()}
					onClick={async () => {
						setBusy(true);
						try {
							await onSubmit(slug.trim(), category, reason.trim() || undefined);
							setSlug("");
							setReason("");
						} finally {
							setBusy(false);
						}
					}}
				>
					{busy ? <Loader2 className="me-1.5 h-3.5 w-3.5 animate-spin" /> : null}
					Add
				</Button>
			</div>
		</div>
	);
}
