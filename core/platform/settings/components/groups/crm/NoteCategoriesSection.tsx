"use client";

/**
 * Settings → CRM → Note Categories.
 *
 * Owners and admins manage the org's sticky-note categories here. Notes
 * pick from these in the org-wide page and per-entity panels.
 *
 * Capabilities
 *   - Create a category (name + bg color + optional text-color override).
 *   - Rename / recolour an existing category.
 *   - Archive (soft-hide) — preserves notes, just removes from pickers.
 *   - Mark as default (one default per org).
 *   - Reorder via Up/Down chevrons (no drag yet — keep deps small for v1).
 *   - Hard delete only when no notes reference the category (server enforces).
 */

import { ArrowDown, ArrowUp, Check, Pencil, Plus, RotateCcw, Star, Trash2, X } from "lucide-react";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { Doc, Id } from "@/convex/_generated/dataModel";
import { getReadableTextColor, isValidHex } from "@/core/comms/notes/components/note-color-utils";
import {
	useArchiveNoteCategory,
	useCreateNoteCategory,
	useDeleteNoteCategory,
	useNoteCategories,
	useReorderNoteCategories,
	useSetDefaultNoteCategory,
	useUpdateNoteCategory,
} from "@/core/comms/notes/hooks";
import { toast } from "@/lib/toast";
import { cn } from "@/lib/utils";
import { SettingsSection } from "../../shared/SettingsSection";

const SUGGESTED_COLORS = [
	"#fde68a", // amber-200
	"#bae6fd", // sky-200
	"#a7f3d0", // emerald-200
	"#fbcfe8", // pink-200
	"#ddd6fe", // violet-200
	"#e2e8f0", // slate-200
	"#fecaca", // red-200
	"#fed7aa", // orange-200
	"#bbf7d0", // green-200
	"#c7d2fe", // indigo-200
];

interface NoteCategoriesSectionProps {
	orgId: Id<"orgs">;
	canManage: boolean;
}

export function NoteCategoriesSection({ orgId, canManage }: NoteCategoriesSectionProps) {
	const categories = useNoteCategories({ orgId, includeArchived: true });
	const create = useCreateNoteCategory();
	const update = useUpdateNoteCategory();
	const archive = useArchiveNoteCategory();
	const remove = useDeleteNoteCategory();
	const reorder = useReorderNoteCategories();
	const setDefault = useSetDefaultNoteCategory();

	const [draftName, setDraftName] = useState("");
	const [draftBg, setDraftBg] = useState(SUGGESTED_COLORS[0]);
	const [draftTextColor, setDraftTextColor] = useState<string>("");

	async function handleCreate() {
		const name = draftName.trim();
		if (!name) {
			toast.warning("Give the category a name first.");
			return;
		}
		if (!isValidHex(draftBg)) {
			toast.warning("Pick a valid background color.");
			return;
		}
		try {
			await create({
				orgId,
				name,
				bgColor: draftBg,
				textColor: draftTextColor.trim() || undefined,
			});
			toast.success(`Created "${name}".`);
			setDraftName("");
			setDraftTextColor("");
			setDraftBg(SUGGESTED_COLORS[0]);
		} catch (err) {
			toast.mutationError(err, "Couldn't create category.");
		}
	}

	const sorted = (categories ?? []).slice().sort((a, b) => a.position - b.position);
	const visible = sorted.filter((c) => !c.isArchived);
	const archived = sorted.filter((c) => c.isArchived);

	async function move(idx: number, delta: -1 | 1) {
		const next = visible.slice();
		const target = idx + delta;
		if (target < 0 || target >= next.length) return;
		[next[idx], next[target]] = [next[target], next[idx]];
		try {
			await reorder({
				orgId,
				categoryIds: next.map((c) => c._id),
			});
		} catch (err) {
			toast.mutationError(err, "Couldn't reorder.");
		}
	}

	return (
		<SettingsSection
			id="crm.noteCategories"
			title="Note Categories"
			description="The colored buckets sticky-notes group into. Create your own to match how your team works (Urgent, Today, Demo Scheduled, …)."
		>
			<div className="flex flex-col gap-5 py-2">
				{/* Existing categories */}
				<div className="flex flex-col gap-2">
					{categories === undefined && (
						<div className="text-xs text-muted-foreground">Loading…</div>
					)}
					{visible.length === 0 && categories !== undefined && (
						<div className="rounded-[var(--radius)] border border-dashed bg-muted/30 px-3 py-3 text-xs text-muted-foreground">
							No categories yet — add one below.
						</div>
					)}
					{visible.map((cat, idx) => (
						<CategoryRow
							key={cat._id}
							category={cat}
							canManage={canManage}
							canMoveUp={idx > 0}
							canMoveDown={idx < visible.length - 1}
							onMoveUp={() => move(idx, -1)}
							onMoveDown={() => move(idx, +1)}
							onSave={(patch) => update({ orgId, categoryId: cat._id, ...patch })}
							onArchive={() =>
								archive({ orgId, categoryId: cat._id, isArchived: true })
							}
							onSetDefault={() => setDefault({ orgId, categoryId: cat._id })}
							onDelete={() => remove({ orgId, categoryId: cat._id })}
						/>
					))}
				</div>

				{/* Archived */}
				{archived.length > 0 && (
					<div className="flex flex-col gap-2">
						<div className="text-[11px] uppercase tracking-wide text-muted-foreground">
							Archived
						</div>
						{archived.map((cat) => (
							<div
								key={cat._id}
								className="flex items-center gap-2 rounded-[var(--radius)] border bg-muted/30 px-3 py-2 text-sm"
							>
								<span
									className="size-3 shrink-0 rounded-full opacity-50"
									style={{ backgroundColor: cat.bgColor }}
								/>
								<span className="flex-1 truncate text-muted-foreground line-through">
									{cat.name}
								</span>
								{canManage && (
									<Button
										type="button"
										variant="ghost"
										size="sm"
										onClick={() =>
											archive({
												orgId,
												categoryId: cat._id,
												isArchived: false,
											}).catch((err) =>
												toast.mutationError(err, "Couldn't restore."),
											)
										}
									>
										<RotateCcw className="me-1 size-3.5" />
										Restore
									</Button>
								)}
							</div>
						))}
					</div>
				)}

				{/* Create new */}
				{canManage && (
					<div className="flex flex-col gap-3 rounded-[var(--radius)] border bg-background p-3">
						<div className="text-[11px] uppercase tracking-wide text-muted-foreground">
							Add category
						</div>
						<div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:flex-wrap">
							<div className="flex flex-col gap-1">
								<Label className="text-xs" htmlFor="new-cat-name">
									Name
								</Label>
								<Input
									id="new-cat-name"
									value={draftName}
									onChange={(e) => setDraftName(e.target.value)}
									placeholder="e.g. Urgent"
									className="sm:w-48"
									onKeyDown={(e) => {
										if (e.key === "Enter") {
											e.preventDefault();
											handleCreate();
										}
									}}
								/>
							</div>
							<ColorSwatchRow
								label="Background"
								value={draftBg}
								onChange={setDraftBg}
							/>
							<TextColorOverride
								bgColor={draftBg}
								value={draftTextColor}
								onChange={setDraftTextColor}
							/>
							<Button
								type="button"
								size="sm"
								onClick={handleCreate}
								disabled={!draftName.trim()}
							>
								<Plus className="size-3.5" />
								Add
							</Button>
						</div>
					</div>
				)}
			</div>
		</SettingsSection>
	);
}

// ─── Row component ───────────────────────────────────────────────────────────

interface CategoryRowProps {
	category: Doc<"noteCategories">;
	canManage: boolean;
	canMoveUp: boolean;
	canMoveDown: boolean;
	onMoveUp: () => void;
	onMoveDown: () => void;
	onSave: (patch: { name?: string; bgColor?: string; textColor?: string }) => Promise<unknown>;
	onArchive: () => Promise<unknown>;
	onSetDefault: () => Promise<unknown>;
	onDelete: () => Promise<unknown>;
}

function CategoryRow({
	category,
	canManage,
	canMoveUp,
	canMoveDown,
	onMoveUp,
	onMoveDown,
	onSave,
	onArchive,
	onSetDefault,
	onDelete,
}: CategoryRowProps) {
	const [editing, setEditing] = useState(false);
	const [name, setName] = useState(category.name);
	const [bg, setBg] = useState(category.bgColor);
	const [text, setText] = useState(category.textColor ?? "");

	async function commit() {
		try {
			await onSave({
				name: name !== category.name ? name : undefined,
				bgColor: bg !== category.bgColor ? bg : undefined,
				textColor:
					text !== (category.textColor ?? "") ? (text === "" ? "" : text) : undefined,
			});
			setEditing(false);
		} catch (err) {
			toast.mutationError(err, "Couldn't save category.");
		}
	}

	if (!editing) {
		return (
			<div className="flex items-center gap-2 rounded-[var(--radius)] border bg-background px-3 py-2 text-sm">
				<span
					className="size-3 shrink-0 rounded-full"
					style={{ backgroundColor: category.bgColor }}
				/>
				<span className="flex-1 truncate font-medium">{category.name}</span>
				{category.isDefault && (
					<Badge variant="outline" className="gap-1 px-1.5 text-[10px]">
						<Star className="size-3" />
						Default
					</Badge>
				)}
				{canManage && (
					<>
						<Button
							type="button"
							variant="ghost"
							size="icon"
							className="size-7"
							aria-label="Move up"
							disabled={!canMoveUp}
							onClick={onMoveUp}
						>
							<ArrowUp className="size-3.5" />
						</Button>
						<Button
							type="button"
							variant="ghost"
							size="icon"
							className="size-7"
							aria-label="Move down"
							disabled={!canMoveDown}
							onClick={onMoveDown}
						>
							<ArrowDown className="size-3.5" />
						</Button>
						{!category.isDefault && (
							<Button
								type="button"
								variant="ghost"
								size="sm"
								className="h-7 gap-1 text-xs"
								onClick={() =>
									onSetDefault().catch((err) =>
										toast.mutationError(err, "Couldn't set default."),
									)
								}
							>
								<Star className="size-3.5" />
								Make default
							</Button>
						)}
						<Button
							type="button"
							variant="ghost"
							size="icon"
							className="size-7"
							aria-label="Edit"
							onClick={() => setEditing(true)}
						>
							<Pencil className="size-3.5" />
						</Button>
						<Button
							type="button"
							variant="ghost"
							size="icon"
							className="size-7"
							aria-label="Archive"
							onClick={() =>
								onArchive().catch((err) =>
									toast.mutationError(err, "Couldn't archive category."),
								)
							}
						>
							<Trash2 className="size-3.5" />
						</Button>
					</>
				)}
			</div>
		);
	}

	return (
		<div className="flex flex-col gap-2 rounded-[var(--radius)] border bg-background p-3">
			<div className="flex flex-wrap items-end gap-3">
				<div className="flex flex-col gap-1">
					<Label className="text-xs" htmlFor={`edit-name-${category._id}`}>
						Name
					</Label>
					<Input
						id={`edit-name-${category._id}`}
						value={name}
						onChange={(e) => setName(e.target.value)}
						className="w-48"
					/>
				</div>
				<ColorSwatchRow label="Background" value={bg} onChange={setBg} />
				<TextColorOverride bgColor={bg} value={text} onChange={setText} />
			</div>
			<div className="flex items-center gap-2">
				<Button type="button" size="sm" onClick={commit}>
					<Check className="me-1 size-3.5" />
					Save
				</Button>
				<Button
					type="button"
					size="sm"
					variant="ghost"
					onClick={() => {
						setEditing(false);
						setName(category.name);
						setBg(category.bgColor);
						setText(category.textColor ?? "");
					}}
				>
					<X className="me-1 size-3.5" />
					Cancel
				</Button>
				{!category.isDefault && (
					<Button
						type="button"
						size="sm"
						variant="ghost"
						className="ms-auto text-destructive"
						onClick={() =>
							onDelete().catch((err) =>
								toast.mutationError(err, "Couldn't delete category."),
							)
						}
					>
						<Trash2 className="me-1 size-3.5" />
						Delete permanently
					</Button>
				)}
			</div>
		</div>
	);
}

// ─── Reusable bits ───────────────────────────────────────────────────────────

function ColorSwatchRow({
	label,
	value,
	onChange,
}: {
	label: string;
	value: string;
	onChange: (next: string) => void;
}) {
	return (
		<div className="flex flex-col gap-1">
			<Label className="text-xs">{label}</Label>
			<div className="flex flex-wrap items-center gap-1">
				{SUGGESTED_COLORS.map((c) => (
					<button
						key={c}
						type="button"
						aria-label={`Use color ${c}`}
						onClick={() => onChange(c)}
						className={cn(
							"size-5 rounded-full border-2 transition-transform hover:scale-110",
							value.toLowerCase() === c.toLowerCase()
								? "border-foreground"
								: "border-transparent",
						)}
						style={{ backgroundColor: c }}
					/>
				))}
				<label
					className="relative ms-1 grid size-6 cursor-pointer place-items-center rounded-full border border-dashed text-[10px] text-muted-foreground hover:text-foreground"
					title="Custom color"
				>
					<span aria-hidden>+</span>
					<input
						type="color"
						value={isValidHex(value) ? value : "#cccccc"}
						onChange={(e) => onChange(e.target.value)}
						className="absolute inset-0 size-full cursor-pointer opacity-0"
					/>
				</label>
				<code className="ms-1 rounded bg-muted px-1.5 py-0.5 text-[10px] uppercase tracking-wide">
					{value}
				</code>
			</div>
		</div>
	);
}

function TextColorOverride({
	bgColor,
	value,
	onChange,
}: {
	bgColor: string;
	value: string;
	onChange: (next: string) => void;
}) {
	const derived = isValidHex(bgColor) ? getReadableTextColor(bgColor) : "#000000";
	const explicit = value !== "";
	return (
		<div className="flex flex-col gap-1">
			<Label className="text-xs">Text color</Label>
			<div className="flex items-center gap-2">
				<button
					type="button"
					onClick={() => onChange(explicit ? "" : derived)}
					className={cn(
						"flex h-7 items-center gap-1.5 rounded-[var(--radius)] border px-2 text-xs",
						!explicit && "bg-muted",
					)}
					title="Auto: derived from background luminance"
				>
					<span
						className="size-3 rounded-full ring-1 ring-foreground/10"
						style={{ backgroundColor: derived }}
					/>
					Auto
				</button>
				<label className="relative inline-flex h-7 cursor-pointer items-center gap-1.5 rounded-[var(--radius)] border bg-background px-2 text-xs">
					<span
						className="size-3 rounded-full ring-1 ring-foreground/10"
						style={{ backgroundColor: explicit ? value : "#94a3b8" }}
					/>
					Override
					<input
						type="color"
						value={explicit && isValidHex(value) ? value : "#000000"}
						onChange={(e) => onChange(e.target.value)}
						className="absolute inset-0 size-full cursor-pointer opacity-0"
					/>
				</label>
				{explicit && (
					<button
						type="button"
						onClick={() => onChange("")}
						className="text-[11px] text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
					>
						Clear
					</button>
				)}
			</div>
		</div>
	);
}
