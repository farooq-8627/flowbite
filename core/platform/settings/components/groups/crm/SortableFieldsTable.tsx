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
import type { useMutation } from "convex/react";
import { Eye, EyeOff, GripVertical, Lock, Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@/components/ui/table";
import type { api } from "@/convex/_generated/api";
import type { Doc, Id } from "@/convex/_generated/dataModel";

type FieldDef = Doc<"fieldDefinitions">;

interface SortableFieldsTableProps {
	orgId: Id<"orgs">;
	fields: FieldDef[];
	setEditing: (f: FieldDef) => void;
	update: ReturnType<typeof useMutation<typeof api.crm.fields.fieldDefinitions.mutations.update>>;
	remove: ReturnType<typeof useMutation<typeof api.crm.fields.fieldDefinitions.mutations.remove>>;
	reorder: ReturnType<
		typeof useMutation<typeof api.crm.fields.fieldDefinitions.mutations.reorder>
	>;
}

export function SortableFieldsTable({
	orgId,
	fields,
	setEditing,
	update,
	remove,
	reorder,
}: SortableFieldsTableProps) {
	const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));

	const handleDragEnd = async (event: DragEndEvent) => {
		const { active, over } = event;
		if (!over || active.id === over.id) return;
		const oldIndex = fields.findIndex((f) => f._id === active.id);
		const newIndex = fields.findIndex((f) => f._id === over.id);
		if (oldIndex < 0 || newIndex < 0) return;
		const next = arrayMove(fields, oldIndex, newIndex);
		try {
			await reorder({ orgId, fieldIds: next.map((f) => f._id) });
		} catch (err) {
			toast.error(err instanceof Error ? err.message : "Couldn't reorder");
		}
	};

	return (
		<DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
			<Table>
				<TableHeader>
					<TableRow>
						<TableHead className="w-8" />
						<TableHead>Label</TableHead>
						<TableHead>Key</TableHead>
						<TableHead>Type</TableHead>
						<TableHead>Group</TableHead>
						<TableHead className="text-end">Required</TableHead>
						<TableHead className="w-24" />
					</TableRow>
				</TableHeader>
				<SortableContext
					items={fields.map((f) => f._id)}
					strategy={verticalListSortingStrategy}
				>
					<TableBody>
						{fields.map((f) => (
							<SortableFieldRow
								key={f._id}
								orgId={orgId}
								field={f}
								setEditing={setEditing}
								update={update}
								remove={remove}
							/>
						))}
					</TableBody>
				</SortableContext>
			</Table>
		</DndContext>
	);
}

interface SortableFieldRowProps {
	orgId: Id<"orgs">;
	field: FieldDef;
	setEditing: (f: FieldDef) => void;
	update: ReturnType<typeof useMutation<typeof api.crm.fields.fieldDefinitions.mutations.update>>;
	remove: ReturnType<typeof useMutation<typeof api.crm.fields.fieldDefinitions.mutations.remove>>;
}

function SortableFieldRow({ orgId, field: f, setEditing, update, remove }: SortableFieldRowProps) {
	const isSystem = f.system === true;
	const isProtected = f.protected === true;
	const isHidden = f.hidden === true;

	const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
		id: f._id,
	});

	const style = {
		transform: CSS.Transform.toString(transform),
		transition,
		opacity: isDragging ? 0.5 : 1,
	};

	return (
		<TableRow ref={setNodeRef} style={style} className={isHidden ? "opacity-60" : ""}>
			<TableCell className="w-8 px-1">
				<button
					type="button"
					className="cursor-grab text-muted-foreground hover:text-foreground active:cursor-grabbing"
					aria-label="Drag to reorder"
					{...attributes}
					{...listeners}
				>
					<GripVertical className="size-4" />
				</button>
			</TableCell>
			<TableCell className="font-medium text-sm">
				<span className="inline-flex items-center gap-1.5">
					{f.label}
					{isProtected && (
						<Lock
							className="size-3 text-muted-foreground"
							aria-label="Protected — cannot be deleted or hidden"
						/>
					)}
				</span>
			</TableCell>
			<TableCell className="font-mono text-xs text-muted-foreground">{f.name}</TableCell>
			<TableCell>
				<div className="flex flex-wrap items-center gap-1">
					<Badge variant="secondary" className="capitalize">
						{f.type}
					</Badge>
					{isSystem && (
						<Badge variant="outline" className="text-[10px] uppercase tracking-wider">
							System
						</Badge>
					)}
				</div>
			</TableCell>
			<TableCell className="text-xs text-muted-foreground">{f.groupName ?? "—"}</TableCell>
			<TableCell className="text-end text-xs">
				{f.required ? "Required" : "Optional"}
			</TableCell>
			<TableCell>
				<div className="flex gap-0.5">
					<Button
						variant="ghost"
						size="icon"
						className="size-7"
						onClick={() => setEditing(f)}
						aria-label="Edit field"
					>
						<Pencil className="size-3.5" />
					</Button>
					<Button
						variant="ghost"
						size="icon"
						className="size-7 text-muted-foreground"
						disabled={isProtected}
						onClick={async () => {
							try {
								await update({ orgId, fieldId: f._id, hidden: !isHidden });
								toast.success(
									isHidden ? `Showing "${f.label}"` : `Hidden "${f.label}"`,
								);
							} catch (err) {
								toast.error(
									err instanceof Error
										? err.message
										: "Failed to toggle visibility",
								);
							}
						}}
						aria-label={isHidden ? "Show field" : "Hide field"}
						title={
							isProtected
								? "This field is required by the system"
								: isHidden
									? "Show this field"
									: "Hide this field"
						}
					>
						{isHidden ? <EyeOff className="size-3.5" /> : <Eye className="size-3.5" />}
					</Button>
					<Button
						variant="ghost"
						size="icon"
						className="size-7 text-muted-foreground hover:text-destructive"
						disabled={isProtected}
						onClick={async () => {
							if (isProtected) return;
							if (
								!confirm(
									`Delete field "${f.label}"? All existing values will be removed.`,
								)
							)
								return;
							try {
								await remove({ orgId, fieldId: f._id });
								toast.success(`Deleted "${f.label}"`);
							} catch (err) {
								toast.error(
									err instanceof Error ? err.message : "Failed to delete field",
								);
							}
						}}
						aria-label="Delete field"
						title={isProtected ? "Protected fields cannot be deleted" : "Delete field"}
					>
						<Trash2 className="size-3.5" />
					</Button>
				</div>
			</TableCell>
		</TableRow>
	);
}
