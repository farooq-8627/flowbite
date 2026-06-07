"use client";

/**
 * Owner-panel industries list view (Stage 2).
 *
 * Two stacked cards:
 *   1. Groups — each group as a row with on/off, edit link, count of
 *      visible templates inside.
 *   2. Templates — flat list grouped by group; per row: visible toggle,
 *      archive toggle, edit link, "X orgs using" count, delete with
 *      typed-confirm dialog.
 *
 * Drag-reorder is intentionally out of scope here; per-row "Move up /
 * down" arrows are sufficient for the small (< 50) row counts the panel
 * sees in practice. A richer dnd-kit reorder lands when the team
 * dogfoods this view enough to need it.
 *
 * Spec: INDUSTRY-TEMPLATES-DB-MIGRATION.md §5.3 IndustriesListView, §7.
 */

import { useMutation, useQuery } from "convex/react";
import {
	ArrowDown,
	ArrowUp,
	Building2,
	Copy,
	Edit3,
	EyeOff,
	Loader2,
	Plus,
	Shield,
	ShieldOff,
	Trash2,
} from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { api } from "@/convex/_generated/api";
import { normalizeError } from "@/lib/normalizeError";
import { OwnerSettingsCard } from "../../components/OwnerSettingsCard";
import { useOwnerPublicPrefix } from "../../hooks/useOwnerPublicPrefix";
import { TypedDeleteDialog } from "./_components/TypedDeleteDialog";

type Region = "global" | "gcc" | "us" | "eu" | "apac" | undefined;

export function IndustriesListView() {
	const groups = useQuery(api._platform.industries.queries.listGroupsForAdmin, {});
	const templates = useQuery(api._platform.industries.queries.listAllForAdmin, {});
	const usageCounts = useQuery(api._platform.industries.queries.usageCountByTemplate, {});

	const setGroupVisible = useMutation(api._platform.industries.mutations.setGroupVisible);
	const reorderGroups = useMutation(api._platform.industries.mutations.reorderGroups);
	const deleteGroup = useMutation(api._platform.industries.mutations.deleteGroup);
	const createGroup = useMutation(api._platform.industries.mutations.createGroup);

	const setTemplateVisible = useMutation(api._platform.industries.mutations.setTemplateVisible);
	const archiveTemplate = useMutation(api._platform.industries.mutations.archiveTemplate);
	const deleteTemplate = useMutation(api._platform.industries.mutations.deleteTemplate);
	const reorderTemplates = useMutation(api._platform.industries.mutations.reorderTemplates);

	const [groupFilter, setGroupFilter] = useState<string>("all");
	const [showAddGroup, setShowAddGroup] = useState(false);

	const grouped = useMemo(() => {
		if (!templates) return new Map<string, typeof templates>();
		const map = new Map<string, typeof templates>();
		for (const t of templates) {
			if (!map.has(t.groupKey)) map.set(t.groupKey, []);
			map.get(t.groupKey)!.push(t);
		}
		return map;
	}, [templates]);

	if (groups === undefined || templates === undefined) {
		return (
			<div className="flex items-center gap-2 text-sm text-muted-foreground">
				<Loader2 className="h-4 w-4 animate-spin" /> Loading industry templates…
			</div>
		);
	}

	const filteredTemplates =
		groupFilter === "all" ? templates : templates.filter((t) => t.groupKey === groupFilter);

	return (
		<div className="flex flex-col gap-4">
			<OwnerSettingsCard
				title="Industry groups"
				description={`${groups.length} groups · drives step 1 of the onboarding picker. Hide a group to remove it from new signups; existing customers are untouched.`}
				footer={
					showAddGroup ? (
						<NewGroupRow
							onCreate={async (key, label) => {
								try {
									await createGroup({ groupKey: key, label });
									toast.success(`Created group "${label}"`);
									setShowAddGroup(false);
								} catch (err) {
									toast.error(normalizeError(err, "Failed to create group"));
								}
							}}
							onCancel={() => setShowAddGroup(false)}
						/>
					) : (
						<div className="flex items-center justify-end">
							<Button
								type="button"
								size="sm"
								variant="outline"
								onClick={() => setShowAddGroup(true)}
							>
								<Plus className="me-1.5 h-3.5 w-3.5" /> New group
							</Button>
						</div>
					)
				}
			>
				<ul className="divide-y divide-border/60">
					{groups.map((g, idx) => {
						const visibleCount = (grouped.get(g.groupKey) ?? []).filter(
							(t) => t.visible && !t.isArchived,
						).length;
						const totalCount = (grouped.get(g.groupKey) ?? []).length;
						return (
							<li key={g._id} className="flex items-center gap-3 py-2.5">
								<div className="flex w-8 flex-col items-center gap-0.5">
									<Button
										type="button"
										size="sm"
										variant="ghost"
										className="h-5 w-5 p-0"
										disabled={idx === 0}
										onClick={async () => {
											const next = [...groups];
											const [item] = next.splice(idx, 1);
											if (!item) return;
											next.splice(idx - 1, 0, item);
											try {
												await reorderGroups({
													ordered: next.map((x) => x.groupKey),
												});
											} catch (err) {
												toast.error(
													normalizeError(err, "Failed to reorder"),
												);
											}
										}}
									>
										<ArrowUp className="h-3 w-3" />
									</Button>
									<Button
										type="button"
										size="sm"
										variant="ghost"
										className="h-5 w-5 p-0"
										disabled={idx === groups.length - 1}
										onClick={async () => {
											const next = [...groups];
											const [item] = next.splice(idx, 1);
											if (!item) return;
											next.splice(idx + 1, 0, item);
											try {
												await reorderGroups({
													ordered: next.map((x) => x.groupKey),
												});
											} catch (err) {
												toast.error(
													normalizeError(err, "Failed to reorder"),
												);
											}
										}}
									>
										<ArrowDown className="h-3 w-3" />
									</Button>
								</div>
								<span className="flex-shrink-0 text-base">{g.icon ?? "🏷️"}</span>
								<div className="min-w-0 flex-1">
									<p className="truncate text-sm font-medium">{g.label}</p>
									<p className="truncate font-mono text-[11px] text-muted-foreground">
										{g.groupKey} · {visibleCount}/{totalCount} visible
									</p>
								</div>
								<Switch
									checked={g.visible}
									onCheckedChange={async (v) => {
										try {
											await setGroupVisible({
												groupKey: g.groupKey,
												visible: v,
											});
										} catch (err) {
											toast.error(
												normalizeError(err, "Failed to toggle visibility"),
											);
										}
									}}
								/>
								<EditGroupLink groupKey={g.groupKey} />
								<Button
									type="button"
									size="sm"
									variant="ghost"
									className="text-destructive hover:text-destructive"
									disabled={totalCount > 0}
									title={
										totalCount > 0
											? "Move templates out of this group before deleting."
											: "Delete group"
									}
									onClick={async () => {
										if (
											!window.confirm(
												`Delete group "${g.label}"? This cannot be undone.`,
											)
										) {
											return;
										}
										try {
											await deleteGroup({ groupKey: g.groupKey });
											toast.success("Group deleted");
										} catch (err) {
											toast.error(normalizeError(err, "Failed to delete"));
										}
									}}
								>
									<Trash2 className="h-3.5 w-3.5" />
								</Button>
							</li>
						);
					})}
				</ul>
			</OwnerSettingsCard>

			<OwnerSettingsCard
				title="Industry templates"
				description={`${templates.length} templates · drives step 2 of the picker. "Hidden" templates skip onboarding for new orgs; archived rows are kept around for any org already on them. Edit a row to change every slot: pipelines, fields, AI persona, etc.`}
				footer={
					<div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
						<span>
							Filter:{" "}
							<select
								value={groupFilter}
								onChange={(e) => setGroupFilter(e.target.value)}
								className="ms-1 rounded-[var(--radius)] border border-input bg-background px-2 py-1 text-xs"
							>
								<option value="all">All groups</option>
								{groups.map((g) => (
									<option key={g.groupKey} value={g.groupKey}>
										{g.label}
									</option>
								))}
							</select>
						</span>
						<span className="flex items-center gap-3">
							<span>{filteredTemplates.length} shown</span>
							<NewTemplateLink />
						</span>
					</div>
				}
			>
				{filteredTemplates.length === 0 ? (
					<p className="text-sm text-muted-foreground">No templates in this filter.</p>
				) : (
					<ul className="divide-y divide-border/60">
						{filteredTemplates.map((t, _idx) => {
							const inGroupRows = (grouped.get(t.groupKey) ?? []).map(
								(x) => x.templateKey,
							);
							const localIdx = inGroupRows.indexOf(t.templateKey);
							const usage = usageCounts?.[t.templateKey] ?? 0;
							return (
								<li
									key={t._id}
									className="flex flex-col gap-2 py-2.5 sm:flex-row sm:items-center sm:gap-3"
								>
									<div className="flex w-8 flex-col items-center gap-0.5">
										<Button
											type="button"
											size="sm"
											variant="ghost"
											className="h-5 w-5 p-0"
											disabled={localIdx <= 0 || groupFilter === "all"}
											title={
												groupFilter === "all"
													? "Select a group filter to reorder"
													: "Move up"
											}
											onClick={async () => {
												const ordered = [...inGroupRows];
												const [item] = ordered.splice(localIdx, 1);
												if (!item) return;
												ordered.splice(localIdx - 1, 0, item);
												try {
													await reorderTemplates({
														groupKey: t.groupKey,
														ordered,
													});
												} catch (err) {
													toast.error(
														normalizeError(err, "Failed to reorder"),
													);
												}
											}}
										>
											<ArrowUp className="h-3 w-3" />
										</Button>
										<Button
											type="button"
											size="sm"
											variant="ghost"
											className="h-5 w-5 p-0"
											disabled={
												localIdx === inGroupRows.length - 1 ||
												groupFilter === "all"
											}
											title={
												groupFilter === "all"
													? "Select a group filter to reorder"
													: "Move down"
											}
											onClick={async () => {
												const ordered = [...inGroupRows];
												const [item] = ordered.splice(localIdx, 1);
												if (!item) return;
												ordered.splice(localIdx + 1, 0, item);
												try {
													await reorderTemplates({
														groupKey: t.groupKey,
														ordered,
													});
												} catch (err) {
													toast.error(
														normalizeError(err, "Failed to reorder"),
													);
												}
											}}
										>
											<ArrowDown className="h-3 w-3" />
										</Button>
									</div>
									<span className="flex-shrink-0 text-base">
										{t.icon ?? <Building2 className="h-4 w-4" />}
									</span>
									<div className="min-w-0 flex-1">
										<p className="truncate text-sm font-medium">
											{t.label}
											{t.isBuiltIn ? (
												<span className="ms-2 rounded-[var(--radius)] bg-amber-500/10 px-1.5 py-0.5 text-[10px] font-medium uppercase text-amber-700 dark:text-amber-400">
													built-in
												</span>
											) : null}
											{t.isArchived ? (
												<span className="ms-2 rounded-[var(--radius)] bg-muted px-1.5 py-0.5 text-[10px] font-medium uppercase text-muted-foreground">
													archived
												</span>
											) : null}
										</p>
										<p className="truncate font-mono text-[11px] text-muted-foreground">
											{t.templateKey} · in {t.groupKey}
											{regionLabel(t.region)
												? ` · ${regionLabel(t.region)}`
												: ""}
											{` · ${usage} org${usage === 1 ? "" : "s"} using`}
										</p>
									</div>
									<div className="flex items-center gap-2 sm:flex-shrink-0">
										<span
											className="flex items-center gap-1 text-[11px] text-muted-foreground"
											title="Visible in onboarding"
										>
											<EyeOff
												className={
													t.visible ? "h-3 w-3 opacity-30" : "h-3 w-3"
												}
											/>
											<Switch
												checked={t.visible}
												onCheckedChange={async (v) => {
													try {
														await setTemplateVisible({
															templateKey: t.templateKey,
															visible: v,
														});
													} catch (err) {
														toast.error(
															normalizeError(
																err,
																"Failed to toggle visibility",
															),
														);
													}
												}}
											/>
										</span>
										<Button
											type="button"
											size="sm"
											variant="ghost"
											title={
												t.isArchived
													? "Restore from archive"
													: "Archive (hides forever, keeps data)"
											}
											onClick={async () => {
												try {
													await archiveTemplate({
														templateKey: t.templateKey,
														archive: !t.isArchived,
													});
													toast.success(
														t.isArchived
															? "Restored from archive"
															: "Archived",
													);
												} catch (err) {
													toast.error(
														normalizeError(err, "Failed to archive"),
													);
												}
											}}
										>
											{t.isArchived ? (
												<ShieldOff className="h-3.5 w-3.5" />
											) : (
												<Shield className="h-3.5 w-3.5" />
											)}
										</Button>
										<CloneTemplateLink templateKey={t.templateKey} />
										<EditTemplateLink templateKey={t.templateKey} />
										<TypedDeleteDialog
											templateKey={t.templateKey}
											isBuiltIn={t.isBuiltIn}
											orgsInUse={usage}
											onConfirm={async (confirmKey) => {
												try {
													await deleteTemplate({
														templateKey: t.templateKey,
														confirmKey,
													});
													toast.success(`Deleted "${t.label}"`);
												} catch (err) {
													toast.error(
														normalizeError(err, "Failed to delete"),
													);
													throw err;
												}
											}}
										/>
									</div>
								</li>
							);
						})}
					</ul>
				)}
			</OwnerSettingsCard>
		</div>
	);
}

function regionLabel(region: Region | string | undefined): string | undefined {
	switch (region) {
		case "global":
			return "Global";
		case "gcc":
			return "GCC";
		case "us":
			return "US";
		case "eu":
			return "EU";
		case "apac":
			return "APAC";
		default:
			return undefined;
	}
}

function EditTemplateLink({ templateKey }: { templateKey: string }) {
	const prefix = useOwnerPublicPrefix() ?? "";
	const href = `${prefix}/industries/${encodeURIComponent(templateKey)}`;
	return (
		<Link
			href={href}
			className="inline-flex items-center gap-1 rounded-[var(--radius)] px-2 py-1 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
			aria-label="Edit template"
		>
			<Edit3 className="h-3.5 w-3.5" />
		</Link>
	);
}

function CloneTemplateLink({ templateKey }: { templateKey: string }) {
	const prefix = useOwnerPublicPrefix() ?? "";
	const href = `${prefix}/industries/new?source=${encodeURIComponent(templateKey)}`;
	return (
		<Link
			href={href}
			className="inline-flex items-center gap-1 rounded-[var(--radius)] px-2 py-1 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
			aria-label="Clone template into a new one"
			title="Clone: copies all slots into a new editable row"
		>
			<Copy className="h-3.5 w-3.5" />
		</Link>
	);
}

function NewTemplateLink() {
	const prefix = useOwnerPublicPrefix() ?? "";
	const href = `${prefix}/industries/new`;
	return (
		<Button asChild type="button" size="sm" variant="outline">
			<Link href={href}>
				<Plus className="me-1.5 h-3.5 w-3.5" /> New template
			</Link>
		</Button>
	);
}

function EditGroupLink({ groupKey }: { groupKey: string }) {
	const prefix = useOwnerPublicPrefix() ?? "";
	const href = `${prefix}/industries/groups/${encodeURIComponent(groupKey)}`;
	return (
		<Link
			href={href}
			className="inline-flex items-center gap-1 rounded-[var(--radius)] px-2 py-1 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
			aria-label="Edit group"
		>
			<Edit3 className="h-3.5 w-3.5" />
		</Link>
	);
}

function NewGroupRow({
	onCreate,
	onCancel,
}: {
	onCreate: (key: string, label: string) => Promise<void>;
	onCancel: () => void;
}) {
	const [key, setKey] = useState("");
	const [label, setLabel] = useState("");
	const [busy, setBusy] = useState(false);
	return (
		<div className="grid gap-2 sm:grid-cols-[1fr_2fr_auto_auto]">
			<Input
				placeholder="group-key"
				value={key}
				onChange={(e) => setKey(e.target.value)}
				className="font-mono"
				autoComplete="off"
			/>
			<Input
				placeholder="Display label"
				value={label}
				onChange={(e) => setLabel(e.target.value)}
				autoComplete="off"
			/>
			<Button type="button" size="sm" variant="ghost" onClick={onCancel}>
				Cancel
			</Button>
			<Button
				type="button"
				size="sm"
				disabled={busy || !key.trim() || !label.trim()}
				onClick={async () => {
					setBusy(true);
					try {
						await onCreate(key.trim(), label.trim());
						setKey("");
						setLabel("");
					} finally {
						setBusy(false);
					}
				}}
			>
				{busy ? <Loader2 className="me-1.5 h-3.5 w-3.5 animate-spin" /> : null}
				Create
			</Button>
		</div>
	);
}
