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
import { Check, GripVertical, Plus, Trash2, X } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { api } from "@/convex/_generated/api";
import type { Doc, Id } from "@/convex/_generated/dataModel";
import { cn } from "@/lib/utils";

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
	const [draft, setDraft] = useState(stage.name);

	const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
		id: stage.id,
	});

	const style = {
		transform: CSS.Transform.toString(transform),
		transition,
	};

	const commitRename = async () => {
		const next = draft.trim();
		if (!next || next === stage.name) {
			setEditing(false);
			setDraft(stage.name);
			return;
		}
		try {
			await updateStage({ orgId, pipelineId, stageId: stage.id, name: next });
			setEditing(false);
		} catch (err) {
			toast.error(err instanceof Error ? err.message : "Failed to rename stage");
		}
	};

	const setColor = async (color: string) => {
		try {
			await updateStage({ orgId, pipelineId, stageId: stage.id, color });
		} catch (err) {
			toast.error(err instanceof Error ? err.message : "Failed to update color");
		}
	};

	const handleDelete = async () => {
		if (!confirm(`Remove stage "${stage.name}"? This cannot be undone.`)) return;
		try {
			await removeStage({ orgId, pipelineId, stageId: stage.id });
		} catch (err) {
			toast.error(
				err instanceof Error
					? err.message
					: "Cannot remove stage — it may have active deals",
			);
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
				className="flex size-6 shrink-0 cursor-grab items-center justify-center text-muted-foreground hover:text-foreground active:cursor-grabbing"
				aria-label="Drag to reorder"
				{...attributes}
				{...listeners}
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

			{editing ? (
				<Input
					autoFocus
					value={draft}
					onChange={(e) => setDraft(e.target.value)}
					onKeyDown={(e) => {
						if (e.key === "Enter") {
							e.preventDefault();
							void commitRename();
						}
						if (e.key === "Escape") {
							setEditing(false);
							setDraft(stage.name);
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

			{stage.isFinal && (
				<Badge variant="secondary" className="shrink-0 text-[10px]">
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
							setDraft(stage.name);
						}}
					>
						<X className="size-3.5" />
					</Button>
				</div>
			) : (
				<Button
					type="button"
					size="icon"
					variant="ghost"
					className="size-7 text-muted-foreground hover:text-destructive"
					onClick={handleDelete}
					aria-label="Delete stage"
				>
					<Trash2 className="size-3.5" />
				</Button>
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

	const [newStageName, setNewStageName] = useState("");
	// Optimistic order — lets drag-reorder feel instant without waiting on the server.
	const [optimisticOrder, setOptimisticOrder] = useState<string[] | null>(null);

	const stages = useMemo(() => {
		const sorted = [...pipeline.stages].sort((a, b) => a.order - b.order);
		if (!optimisticOrder) return sorted;
		const byId = new Map(sorted.map((s) => [s.id, s]));
		return optimisticOrder.map((id) => byId.get(id)).filter((s): s is Stage => !!s);
	}, [pipeline.stages, optimisticOrder]);

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
			toast.error(err instanceof Error ? err.message : "Failed to reorder stages");
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
			toast.error(err instanceof Error ? err.message : "Failed to add stage");
		}
	};

	return (
		<div className="flex flex-col gap-3 rounded-[var(--radius)] border p-3">
			<div className="flex items-center justify-between">
				<div className="flex items-center gap-2">
					<span className="text-sm font-medium">{pipeline.name}</span>
					{pipeline.isDefault && (
						<Badge variant="secondary" className="text-[10px]">
							Default
						</Badge>
					)}
					<span className="text-xs text-muted-foreground">· {pipeline.entityType}</span>
				</div>
				<span className="text-xs text-muted-foreground tabular-nums">
					{stages.length} stages
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

			<div className="flex items-center gap-2">
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
	);
}
