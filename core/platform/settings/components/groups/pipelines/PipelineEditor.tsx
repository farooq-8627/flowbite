"use client";

import {
	closestCenter,
	DndContext,
	type DragEndEvent,
	PointerSensor,
	useSensor,
	useSensors,
} from "@dnd-kit/core";
import {
	arrayMove,
	SortableContext,
	useSortable,
	verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useMutation } from "convex/react";
import { Check, GripVertical, MoreHorizontal, Plus, Trash2, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { api } from "@/convex/_generated/api";
import type { Doc, Id } from "@/convex/_generated/dataModel";
import { usePersistedState } from "@/lib/hooks/use-persisted-state";
import { normalizeError } from "@/lib/normalizeError";
import { cn } from "@/lib/utils";
import { StageFieldsTable } from "./StageFieldsTable";

type Pipeline = Doc<"pipelines">;
type Stage = Pipeline["stages"][number];

const STAGE_COLORS = [
	"#94a3b8",
	"#ef4444",
	"#f97316",
	"#eab308",
	"#22c55e",
	"#14b8a6",
	"#06b6d4",
	"#3b82f6",
	"#8b5cf6",
	"#ec4899",
];

// Stage code regex must mirror the server-side validator in
// `convex/crm/fields/pipelines/helpers.ts::validateStageCode`. If you change
// either, update both.
const STAGE_CODE_REGEX = /^[A-Z0-9_-]{2,16}$/;

// ────────────────────────────────────────────────────────────────────────────
// Sortable stage row
// ────────────────────────────────────────────────────────────────────────────

function StageRow({
	stage,
	orgId,
	pipelineId,
}: {
	stage: Stage;
	orgId: Id<"orgs">;
	pipelineId: Id<"pipelines">;
}) {
	const updateStage = useMutation(api.crm.fields.pipelines.mutations.updateStage);
	const removeStage = useMutation(api.crm.fields.pipelines.mutations.removeStage);

	const [editing, setEditing] = useState(false);
	const [draftName, setDraftName] = useState(stage.name);
	const [draftCode, setDraftCode] = useState(stage.code);

	const isDefault = stage.isDefaultStage === true;

	const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
		id: stage.id,
		// The Default stage cannot be reordered — disable the dnd-kit
		// listeners so the grip handle won't engage at all.
		disabled: isDefault,
	});

	const style = {
		transform: CSS.Transform.toString(transform),
		transition,
	};

	const commitRename = async () => {
		const next = draftName.trim();
		if (!next || next === stage.name) {
			setEditing(false);
			setDraftName(stage.name);
			return;
		}
		try {
			await updateStage({ orgId, pipelineId, stageId: stage.id, name: next });
			setEditing(false);
		} catch (err) {
			toast.error(normalizeError(err, "Failed to rename stage"));
		}
	};

	const commitCode = async () => {
		const next = draftCode.trim().toUpperCase();
		if (!next || next === stage.code) {
			setDraftCode(stage.code);
			return;
		}
		if (!STAGE_CODE_REGEX.test(next)) {
			toast.error("Code must be 2–16 chars, uppercase letters, numbers, _ or -");
			setDraftCode(stage.code);
			return;
		}
		try {
			await updateStage({ orgId, pipelineId, stageId: stage.id, code: next });
		} catch (err) {
			toast.error(normalizeError(err, "Failed to update code"));
			setDraftCode(stage.code);
		}
	};

	const setColor = async (color: string) => {
		try {
			await updateStage({ orgId, pipelineId, stageId: stage.id, color });
		} catch (err) {
			toast.error(normalizeError(err, "Failed to update color"));
		}
	};

	const handleDelete = async () => {
		if (isDefault) {
			toast.error("The Default stage can't be removed — every pipeline must have one.");
			return;
		}
		if (!confirm(`Remove stage "${stage.name}"? This cannot be undone.`)) return;
		try {
			await removeStage({ orgId, pipelineId, stageId: stage.id });
		} catch (err) {
			toast.error(normalizeError(err, "Cannot remove stage — it may have active deals"));
		}
	};

	return (
		<div
			ref={setNodeRef}
			style={style}
			className={cn(
				"flex items-center gap-2 rounded-[var(--radius)] border bg-background px-2 py-1.5",
				isDragging && "opacity-60 shadow-sm",
			)}
		>
			<button
				type="button"
				className={cn(
					"flex size-6 shrink-0 items-center justify-center text-muted-foreground",
					isDefault
						? "cursor-not-allowed opacity-30"
						: "cursor-grab hover:text-foreground active:cursor-grabbing",
				)}
				aria-label={isDefault ? "Default stage — pinned" : "Drag to reorder"}
				disabled={isDefault}
				{...(isDefault ? {} : attributes)}
				{...(isDefault ? {} : listeners)}
			>
				<GripVertical className="size-4" />
			</button>

			<Popover>
				<PopoverTrigger asChild>
					<button
						type="button"
						className="size-4 shrink-0 rounded-full border"
						style={{ backgroundColor: stage.color ?? "#94a3b8" }}
						aria-label="Change color"
					/>
				</PopoverTrigger>
				<PopoverContent align="start" className="w-auto p-2">
					<div className="flex flex-wrap gap-1">
						{STAGE_COLORS.map((c) => (
							<button
								key={c}
								type="button"
								className="size-5 rounded-full ring-offset-1 transition-all hover:scale-110"
								style={{
									backgroundColor: c,
									outline:
										stage.color === c ? "2px solid var(--ring)" : undefined,
								}}
								onClick={() => setColor(c)}
								aria-label={`Color ${c}`}
							/>
						))}
					</div>
				</PopoverContent>
			</Popover>

			{/* Stage code — owner-typed, unique within pipeline. Mirrors server
			    validator: ^[A-Z0-9_-]{2,16}$. Auto-uppercases on input. */}
			<Tooltip>
				<TooltipTrigger asChild>
					<Input
						value={draftCode}
						onChange={(e) => setDraftCode(e.target.value.toUpperCase().slice(0, 16))}
						onBlur={commitCode}
						onKeyDown={(e) => {
							if (e.key === "Enter") {
								e.preventDefault();
								(e.target as HTMLInputElement).blur();
							}
							if (e.key === "Escape") {
								setDraftCode(stage.code);
								(e.target as HTMLInputElement).blur();
							}
						}}
						className="h-7 w-16 shrink-0 px-1.5 font-mono text-[11px] uppercase tracking-wider"
						aria-label="Stage code"
					/>
				</TooltipTrigger>
				<TooltipContent>
					Stage code — used by AI and saved views to identify this stage
				</TooltipContent>
			</Tooltip>

			{editing ? (
				<Input
					autoFocus
					value={draftName}
					onChange={(e) => setDraftName(e.target.value)}
					onKeyDown={(e) => {
						if (e.key === "Enter") {
							e.preventDefault();
							void commitRename();
						}
						if (e.key === "Escape") {
							setEditing(false);
							setDraftName(stage.name);
						}
					}}
					onBlur={commitRename}
					className="h-7 flex-1 text-sm"
				/>
			) : (
				<button
					type="button"
					className="flex-1 cursor-text rounded px-1 py-0.5 text-start text-sm hover:bg-muted/50"
					onClick={() => setEditing(true)}
				>
					{stage.name}
				</button>
			)}

			{isDefault && (
				<Badge variant="secondary" className="shrink-0 text-[10px]">
					Default
				</Badge>
			)}
			{stage.isFinal && (
				<Badge variant="outline" className="shrink-0 text-[10px]">
					Final
				</Badge>
			)}

			{editing ? (
				<div className="flex gap-0.5">
					<Button
						type="button"
						size="icon"
						variant="ghost"
						className="size-7"
						onMouseDown={(e) => e.preventDefault()}
						onClick={commitRename}
					>
						<Check className="size-3.5" />
					</Button>
					<Button
						type="button"
						size="icon"
						variant="ghost"
						className="size-7"
						onMouseDown={(e) => e.preventDefault()}
						onClick={() => {
							setEditing(false);
							setDraftName(stage.name);
						}}
					>
						<X className="size-3.5" />
					</Button>
				</div>
			) : (
				<DropdownMenu>
					<DropdownMenuTrigger asChild>
						<Button
							type="button"
							size="icon"
							variant="ghost"
							className="size-7 text-muted-foreground hover:text-foreground"
							aria-label="Stage actions"
						>
							<MoreHorizontal className="size-3.5" />
						</Button>
					</DropdownMenuTrigger>
					<DropdownMenuContent align="end" className="w-44">
						<DropdownMenuItem
							onSelect={handleDelete}
							disabled={isDefault}
							className={
								isDefault ? "opacity-50" : "text-destructive focus:text-destructive"
							}
						>
							<Trash2 className="me-2 size-3.5" />
							{isDefault ? "Default stage (pinned)" : "Remove stage"}
						</DropdownMenuItem>
					</DropdownMenuContent>
				</DropdownMenu>
			)}
		</div>
	);
}

// ────────────────────────────────────────────────────────────────────────────
// Pipeline card — stages list + add-stage input
// ────────────────────────────────────────────────────────────────────────────

export function PipelineEditor({ pipeline, orgId }: { pipeline: Pipeline; orgId: Id<"orgs"> }) {
	const reorderStages = useMutation(api.crm.fields.pipelines.mutations.reorderStages);
	const addStage = useMutation(api.crm.fields.pipelines.mutations.addStage);
	const updatePipeline = useMutation(api.crm.fields.pipelines.mutations.update);

	// Optimistic order — lets drag-reorder feel instant without waiting on the server.
	const [optimisticOrder, setOptimisticOrder] = useState<string[] | null>(null);
	const [newStageName, setNewStageName] = useState("");

	// Inline pipeline-name edit (rename in place, blur to commit, Esc to cancel).
	const [renameDraft, setRenameDraft] = useState<string | null>(null);

	// Active "stage tab" inside this pipeline editor — persisted per device
	// so opening the settings page returns the user to the stage they were
	// editing last (per pipeline). The Default stage's id is the
	// "Defaults" tab — there's no separate `__everywhere__` semantics
	// anymore; default fields ARE the Default stage's fields.
	const ACTIVE_TAB_KEY = `pipeline-editor:${pipeline._id}:activeStage:v2`;
	const [activeStageKey, setActiveStageKey] = usePersistedState<string | undefined>(
		ACTIVE_TAB_KEY,
		undefined,
	);

	const stages = useMemo(() => {
		const sorted = [...pipeline.stages].sort((a, b) => a.order - b.order);
		if (!optimisticOrder) return sorted;
		const byId = new Map(sorted.map((s) => [s.id, s]));
		return optimisticOrder.map((id) => byId.get(id)).filter((s): s is Stage => !!s);
	}, [pipeline.stages, optimisticOrder]);

	// Default stage = the auto-created stage with `isDefaultStage: true`.
	// Falls back to the first non-final stage by order for pre-migration data.
	const defaultStage = useMemo(
		() => stages.find((s) => s.isDefaultStage) ?? stages.find((s) => !s.isFinal),
		[stages],
	);

	// Stages OTHER than the default — these are the ones that get their
	// own "stage-aware fields" tab. The default stage owns the "Defaults"
	// tab instead.

	const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));

	const handleDragEnd = async (event: DragEndEvent) => {
		const { active, over } = event;
		if (!over || active.id === over.id) return;

		const oldIds = stages.map((s) => s.id);
		const from = oldIds.indexOf(String(active.id));
		const to = oldIds.indexOf(String(over.id));
		if (from === -1 || to === -1) return;

		const newIds = arrayMove(oldIds, from, to);
		setOptimisticOrder(newIds);

		try {
			await reorderStages({ orgId, pipelineId: pipeline._id, stageIds: newIds });
		} catch (err) {
			toast.error(normalizeError(err, "Failed to reorder stages"));
			setOptimisticOrder(null);
		} finally {
			// Let the server-sourced order take over once the query revalidates.
			setTimeout(() => setOptimisticOrder(null), 600);
		}
	};

	const handleAdd = async () => {
		const name = newStageName.trim();
		if (!name) return;
		try {
			await addStage({
				orgId,
				pipelineId: pipeline._id,
				stage: { name, color: STAGE_COLORS[stages.length % STAGE_COLORS.length] },
			});
			setNewStageName("");
		} catch (err) {
			toast.error(normalizeError(err, "Failed to add stage"));
		}
	};

	const policy = pipeline.stageTransitionPolicy ?? "warn";
	const handlePolicyChange = async (next: "block" | "warn" | "off") => {
		if (next === policy) return;
		try {
			await updatePipeline({ orgId, pipelineId: pipeline._id, stageTransitionPolicy: next });
		} catch (err) {
			toast.error(normalizeError(err, "Failed to update policy"));
		}
	};

	const allowSkip = pipeline.allowSkipStages === true;
	const handleAllowSkipChange = async (next: boolean) => {
		try {
			await updatePipeline({ orgId, pipelineId: pipeline._id, allowSkipStages: next });
		} catch (err) {
			toast.error(normalizeError(err, "Failed to update setting"));
		}
	};

	const markDoneRequiresAll = pipeline.markDoneRequiresAllFields !== false; // default true
	const handleMarkDoneChange = async (next: boolean) => {
		try {
			await updatePipeline({
				orgId,
				pipelineId: pipeline._id,
				markDoneRequiresAllFields: next,
			});
		} catch (err) {
			toast.error(normalizeError(err, "Failed to update setting"));
		}
	};

	const handleRename = async () => {
		if (renameDraft === null) return;
		const next = renameDraft.trim();
		if (!next || next === pipeline.name) {
			setRenameDraft(null);
			return;
		}
		try {
			await updatePipeline({ orgId, pipelineId: pipeline._id, name: next });
			setRenameDraft(null);
		} catch (err) {
			toast.error(normalizeError(err, "Failed to rename pipeline"));
			setRenameDraft(null);
		}
	};

	// Resolve the active stage. When no key persisted, default to the
	// pipeline's Default stage. When the persisted id no longer exists
	// (stage deleted), fall back to the Default stage too.
	const activeStage = useMemo(() => {
		if (activeStageKey) {
			const found = stages.find((s) => s.id === activeStageKey);
			if (found) return found;
		}
		return defaultStage ?? stages[0] ?? null;
	}, [stages, activeStageKey, defaultStage]);

	// Persist the resolved id back so the URL reflects what's shown.
	useEffect(() => {
		if (!activeStage) return;
		if (activeStageKey === activeStage.id) return;
		setActiveStageKey(activeStage.id);
	}, [activeStage, activeStageKey, setActiveStageKey]);

	return (
		<div className="flex flex-col gap-4 rounded-[var(--radius)] border p-3">
			{/* ── Header — rename only (settings live at the bottom) ─────── */}
			<div className="flex flex-wrap items-start justify-between gap-3">
				<div className="flex min-w-0 flex-1 flex-col gap-1">
					<div className="flex items-center gap-2">
						{renameDraft !== null ? (
							<Input
								autoFocus
								value={renameDraft}
								onChange={(e) => setRenameDraft(e.target.value)}
								onBlur={handleRename}
								onKeyDown={(e) => {
									if (e.key === "Enter") {
										e.preventDefault();
										void handleRename();
									}
									if (e.key === "Escape") setRenameDraft(null);
								}}
								className="h-7 max-w-xs text-sm font-medium"
							/>
						) : (
							<button
								type="button"
								className="rounded px-1 py-0.5 text-sm font-medium hover:bg-muted/50"
								onClick={() => setRenameDraft(pipeline.name)}
							>
								{pipeline.name}
							</button>
						)}
						{pipeline.isDefault && (
							<Badge variant="secondary" className="text-[10px]">
								Default
							</Badge>
						)}
						<span className="text-xs text-muted-foreground">
							· {pipeline.entityType} · {stages.length} stages
						</span>
					</div>
					<p className="text-[10px] leading-snug text-muted-foreground">
						Click the name to rename. Stages and fields are below; transition rules at
						the bottom apply only to this pipeline.
					</p>
				</div>
			</div>

			{/* ── Stages list (drag, rename, code, color, default, delete) ── */}
			<div className="flex flex-col gap-2 rounded-[var(--radius)] border bg-muted/10 p-2">
				<div className="flex items-center justify-between gap-2 px-1">
					<span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
						Stages
					</span>
					<span className="text-[10px] text-muted-foreground">
						Drag to reorder · click name / code to rename
					</span>
				</div>
				<DndContext
					sensors={sensors}
					collisionDetection={closestCenter}
					onDragEnd={handleDragEnd}
				>
					<SortableContext
						items={stages.map((s) => s.id)}
						strategy={verticalListSortingStrategy}
					>
						<div className="flex flex-col gap-1.5">
							{stages.map((s) => (
								<StageRow
									key={s.id}
									stage={s}
									orgId={orgId}
									pipelineId={pipeline._id}
								/>
							))}
						</div>
					</SortableContext>
				</DndContext>
				<div className="flex items-center gap-2 pt-1">
					<Input
						value={newStageName}
						onChange={(e) => setNewStageName(e.target.value)}
						onKeyDown={(e) => {
							if (e.key === "Enter") {
								e.preventDefault();
								void handleAdd();
							}
						}}
						placeholder="New stage name…"
						className="h-8 flex-1 text-sm"
					/>
					<Button size="sm" onClick={handleAdd} disabled={!newStageName.trim()}>
						<Plus className="size-4" /> Add stage
					</Button>
				</div>
			</div>

			{/* ── Stage fields — tab strip + editor scoped to active stage ── */}
			<div className="flex flex-col gap-2 rounded-[var(--radius)] border bg-muted/10 p-2">
				<div className="flex items-center justify-between gap-2 px-1">
					<span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
						Stage fields
					</span>
					<span className="text-[10px] text-muted-foreground">
						Pick which fields show on each stage. Required fields drive the policy
						above.
					</span>
				</div>

				{/* Stage tab strip — pill row, NOT shadcn TabsList (matches the
				    pipeline tabs above the deals kanban). The Default stage
				    is just the first pill with a "Default" badge — same UI
				    as any other stage. Each tab shows ONLY the fields
				    pinned to that stage.
				    
				    Mobile: the row scrolls horizontally inside its bounds
				    (no wrap to a second line) so a long pipeline (Default →
				    Discovery → Qualification → Proposal → Negotiation →
				    Won) stays readable on a phone. */}
				<div
					role="tablist"
					aria-label={`${pipeline.name} field tabs`}
					className="flex items-center gap-1 overflow-x-auto scrollbar-none border-b ps-1 pe-1 pb-2"
				>
					{stages.map((s) => {
						const active = activeStage?.id === s.id;
						const isDef = s.isDefaultStage === true;
						return (
							<button
								key={s.id}
								role="tab"
								type="button"
								aria-selected={active}
								onClick={() => setActiveStageKey(s.id)}
								className={cn(
									"flex h-7 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-[var(--radius)] border ps-2.5 pe-2.5 text-xs transition-colors",
									active
										? "border-primary/30 bg-primary/10 text-primary"
										: "border-transparent text-muted-foreground hover:bg-muted/60",
								)}
								title={
									isDef
										? "Fields every deal in this pipeline carries — always present, no matter the stage"
										: `Fields specific to the ${s.name} stage`
								}
							>
								<span
									className="size-2.5 rounded-full"
									style={{ backgroundColor: s.color ?? "#94a3b8" }}
								/>
								<span className="font-medium">{s.name}</span>
								{isDef && (
									<Badge variant="secondary" className="text-[9px] font-normal">
										Default
									</Badge>
								)}
								<Badge variant="outline" className="font-mono text-[9px]">
									{s.code}
								</Badge>
							</button>
						);
					})}
				</div>

				<div className="px-1 pb-1">
					{!activeStage ? (
						<div className="rounded-[var(--radius)] border border-dashed py-6 text-center text-xs text-muted-foreground">
							Add stages above first — fields are scoped to a stage.
						</div>
					) : (
						<StageFieldsTable
							key={activeStage.id}
							orgId={orgId}
							pipeline={pipeline}
							scope={{ kind: "stage", stageId: activeStage.id }}
						/>
					)}
				</div>
			</div>

			{/* ── Pipeline-level settings (last — set-once and forget) ────
			    Stages and stage-aware fields above are the bits owners
			    iterate on weekly; these rules below are usually configured
			    once when the pipeline is set up. Keeping them at the
			    bottom keeps the high-frequency editing surfaces visible
			    without scrolling. */}
			<div className="flex flex-col gap-3 rounded-[var(--radius)] border bg-muted/10 p-3">
				<div className="flex flex-col gap-1">
					<span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
						Stage move rules
					</span>
					<p className="text-[10px] leading-snug text-muted-foreground">
						How strict should this pipeline be when deals advance through stages?
					</p>
				</div>

				{/* "When required fields are missing" — laid out the same way
				    as the toggle rows below: description on the start side,
				    compact selector on the end side. The Select itself
				    pops downward on click; that's a Radix default — but
				    by sitting on the end of its row, on most viewports it
				    has room to expand without overlapping the next setting. */}
				<div className="flex flex-col gap-3 rounded-[var(--radius)] border bg-background px-3 py-2 sm:flex-row sm:items-start sm:justify-between">
					<div className="flex min-w-0 flex-1 flex-col gap-0.5">
						<span className="text-xs font-medium">
							When required fields are missing
						</span>
						<span className="text-[10px] leading-snug text-muted-foreground">
							Choose what happens if a deal moves into a stage before its required
							fields are filled — block the move, allow it with a warning, or skip the
							check entirely.
						</span>
					</div>
					<Select value={policy} onValueChange={handlePolicyChange}>
						<SelectTrigger className="h-8 w-full text-xs sm:w-44 sm:shrink-0">
							<SelectValue />
						</SelectTrigger>
						<SelectContent align="end">
							<SelectItem value="block" className="text-xs">
								<span className="flex flex-col gap-0.5">
									<span className="font-medium">Block the move</span>
									<span className="text-[10px] text-muted-foreground">
										Force fill before changing stage
									</span>
								</span>
							</SelectItem>
							<SelectItem value="warn" className="text-xs">
								<span className="flex flex-col gap-0.5">
									<span className="font-medium">Move and warn</span>
									<span className="text-[10px] text-muted-foreground">
										Yellow border, log it, but allow
									</span>
								</span>
							</SelectItem>
							<SelectItem value="off" className="text-xs">
								<span className="flex flex-col gap-0.5">
									<span className="font-medium">Don't check</span>
									<span className="text-[10px] text-muted-foreground">
										No validation at all
									</span>
								</span>
							</SelectItem>
						</SelectContent>
					</Select>
				</div>

				<div className="flex flex-col gap-3 rounded-[var(--radius)] border bg-background px-3 py-2 sm:flex-row sm:items-start sm:justify-between">
					<div className="flex flex-col gap-0.5">
						<span className="text-xs font-medium">Allow skipping stages</span>
						<span className="text-[10px] leading-snug text-muted-foreground">
							{policy === "block"
								? allowSkip
									? "Deals can jump straight to any stage."
									: "Deals must move one stage at a time forward."
								: "Only enforced when the policy above is \u201cBlock\u201d."}
						</span>
					</div>
					<Switch
						checked={allowSkip}
						onCheckedChange={handleAllowSkipChange}
						disabled={policy !== "block"}
						aria-label="Allow skipping stages"
						className="self-start sm:self-auto"
					/>
				</div>

				<div className="flex flex-col gap-3 rounded-[var(--radius)] border bg-background px-3 py-2 sm:flex-row sm:items-start sm:justify-between">
					<div className="flex flex-col gap-0.5">
						<span className="text-xs font-medium">
							Require all fields before mark as done
						</span>
						<span className="text-[10px] leading-snug text-muted-foreground">
							{markDoneRequiresAll
								? "Every required field across every non-final stage must be filled before a deal can be won."
								: "Owners can mark a deal as done at any time, even with missing fields."}
						</span>
					</div>
					<Switch
						checked={markDoneRequiresAll}
						onCheckedChange={handleMarkDoneChange}
						aria-label="Require all fields before mark as done"
						className="self-start sm:self-auto"
					/>
				</div>
			</div>
		</div>
	);
}
