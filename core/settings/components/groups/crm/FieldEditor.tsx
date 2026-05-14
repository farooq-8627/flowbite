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
import { useMutation, useQuery } from "convex/react";
import { Eye, EyeOff, GripVertical, Lock, Pencil, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { z } from "zod/v4";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
	DialogTrigger,
} from "@/components/ui/dialog";
import {
	Form,
	FormControl,
	FormField,
	FormItem,
	FormLabel,
	FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@/components/ui/table";
import { api } from "@/convex/_generated/api";
import type { Doc, Id } from "@/convex/_generated/dataModel";
import { useSettingsForm } from "../../../hooks/useSettingsForm";

type FieldDef = Doc<"fieldDefinitions">;

const FIELD_TYPES = [
	{ value: "text", label: "Text" },
	{ value: "number", label: "Number" },
	{ value: "date", label: "Date" },
	{ value: "boolean", label: "Yes / No" },
	{ value: "select", label: "Single select" },
	{ value: "multiselect", label: "Multi select" },
	{ value: "url", label: "URL" },
	{ value: "email", label: "Email" },
	{ value: "file", label: "File (single)" },
	{ value: "files", label: "Files (multiple)" },
] as const;

type FieldType = (typeof FIELD_TYPES)[number]["value"];

// ────────────────────────────────────────────────────────────────────────────
// Schemas
// ────────────────────────────────────────────────────────────────────────────

const createFieldSchema = z.object({
	label: z.string().min(1, "Label is required"),
	name: z
		.string()
		.min(1, "Key is required")
		.regex(/^[a-z][a-z0-9_]*$/, "Use lowercase letters, numbers, and underscores only"),
	type: z.union([
		z.literal("text"),
		z.literal("number"),
		z.literal("date"),
		z.literal("boolean"),
		z.literal("select"),
		z.literal("multiselect"),
		z.literal("url"),
		z.literal("email"),
		z.literal("file"),
		z.literal("files"),
	]),
	groupName: z.string().optional(),
	required: z.boolean(),
	optionsText: z.string().optional(),
});
type CreateFieldInput = z.infer<typeof createFieldSchema>;

const editFieldSchema = z.object({
	label: z.string().min(1, "Label is required"),
	groupName: z.string().optional(),
	required: z.boolean(),
	optionsText: z.string().optional(),
});
type EditFieldInput = z.infer<typeof editFieldSchema>;

// Helper: convert comma/newline-separated options into a trimmed string[]
function parseOptions(text?: string): string[] | undefined {
	if (!text) return undefined;
	const items = text
		.split(/[\n,]/)
		.map((s) => s.trim())
		.filter(Boolean);
	return items.length > 0 ? items : undefined;
}

// Helper: auto-generate a key from a label (e.g. "Contract value" -> "contract_value")
function labelToName(label: string): string {
	return label
		.trim()
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "_")
		.replace(/^_+|_+$/g, "")
		.replace(/^[0-9]/, "f_$&");
}

// ────────────────────────────────────────────────────────────────────────────
// Create dialog
// ────────────────────────────────────────────────────────────────────────────

function CreateFieldDialog({ orgId, entityType }: { orgId: Id<"orgs">; entityType: string }) {
	const [open, setOpen] = useState(false);
	const create = useMutation(api.crm.fields.fieldDefinitions.mutations.create);

	const { form, isSubmitting, handleSubmit } = useSettingsForm({
		schema: createFieldSchema,
		values: {
			label: "",
			name: "",
			type: "text" as FieldType,
			groupName: "",
			required: false,
			optionsText: "",
		},
		onSubmit: async (data: CreateFieldInput) => {
			const needsOptions = data.type === "select" || data.type === "multiselect";
			const options = parseOptions(data.optionsText);
			if (needsOptions && !options?.length) {
				toast.error("Enter at least one option (comma- or newline-separated).");
				return;
			}
			try {
				await create({
					orgId,
					entityType,
					name: data.name,
					label: data.label,
					type: data.type,
					groupName: data.groupName || undefined,
					required: data.required,
					options: needsOptions ? options : undefined,
				});
				toast.success(`Added field "${data.label}"`);
				form.reset({
					label: "",
					name: "",
					type: "text",
					groupName: "",
					required: false,
					optionsText: "",
				});
				setOpen(false);
			} catch (err) {
				toast.error(err instanceof Error ? err.message : "Failed to create field");
			}
		},
	});

	const type = form.watch("type");
	const label = form.watch("label");

	// Auto-fill the key as the user types the label, unless the user has edited the key manually.
	const [manualKey, setManualKey] = useState(false);
	const autoName = labelToName(label || "");
	if (!manualKey && form.getValues("name") !== autoName) {
		form.setValue("name", autoName, { shouldValidate: false });
	}

	return (
		<Dialog open={open} onOpenChange={setOpen}>
			<DialogTrigger asChild>
				<Button size="sm">
					<Plus className="size-4" /> Add field
				</Button>
			</DialogTrigger>
			<DialogContent className="sm:max-w-md">
				<DialogHeader>
					<DialogTitle>Add custom field</DialogTitle>
					<DialogDescription>
						Custom fields appear on the record form and table for <b>{entityType}</b>.
					</DialogDescription>
				</DialogHeader>
				<Form {...form}>
					<form onSubmit={handleSubmit} className="grid gap-4">
						<FormField
							control={form.control}
							name="label"
							render={({ field }) => (
								<FormItem>
									<FormLabel>Label</FormLabel>
									<FormControl>
										<Input placeholder="e.g. Contract value" {...field} />
									</FormControl>
									<FormMessage />
								</FormItem>
							)}
						/>
						<FormField
							control={form.control}
							name="name"
							render={({ field }) => (
								<FormItem>
									<FormLabel>Key</FormLabel>
									<FormControl>
										<Input
											className="font-mono text-xs"
											placeholder="contract_value"
											{...field}
											onChange={(e) => {
												setManualKey(true);
												field.onChange(e);
											}}
										/>
									</FormControl>
									<FormMessage />
								</FormItem>
							)}
						/>
						<FormField
							control={form.control}
							name="type"
							render={({ field }) => (
								<FormItem>
									<FormLabel>Type</FormLabel>
									<Select onValueChange={field.onChange} value={field.value}>
										<FormControl>
											<SelectTrigger className="w-full">
												<SelectValue />
											</SelectTrigger>
										</FormControl>
										<SelectContent>
											{FIELD_TYPES.map((t) => (
												<SelectItem key={t.value} value={t.value}>
													{t.label}
												</SelectItem>
											))}
										</SelectContent>
									</Select>
									<FormMessage />
								</FormItem>
							)}
						/>
						{(type === "select" || type === "multiselect") && (
							<FormField
								control={form.control}
								name="optionsText"
								render={({ field }) => (
									<FormItem>
										<FormLabel>Options</FormLabel>
										<FormControl>
											<Input
												placeholder="Option 1, Option 2, Option 3"
												{...field}
											/>
										</FormControl>
										<p className="text-xs text-muted-foreground">
											Comma- or newline-separated.
										</p>
										<FormMessage />
									</FormItem>
								)}
							/>
						)}
						<FormField
							control={form.control}
							name="groupName"
							render={({ field }) => (
								<FormItem>
									<FormLabel>Group (optional)</FormLabel>
									<FormControl>
										<Input placeholder="e.g. Commercial" {...field} />
									</FormControl>
								</FormItem>
							)}
						/>
						<FormField
							control={form.control}
							name="required"
							render={({ field }) => (
								<FormItem className="flex items-center justify-between rounded-[var(--radius)] border px-3 py-2">
									<div>
										<FormLabel className="text-sm">Required</FormLabel>
										<p className="text-xs text-muted-foreground">
											Enforce a value when creating records.
										</p>
									</div>
									<FormControl>
										<Switch
											checked={field.value}
											onCheckedChange={field.onChange}
										/>
									</FormControl>
								</FormItem>
							)}
						/>
						<DialogFooter>
							<Button
								type="button"
								variant="outline"
								size="sm"
								onClick={() => setOpen(false)}
							>
								Cancel
							</Button>
							<Button type="submit" size="sm" disabled={isSubmitting}>
								Add field
							</Button>
						</DialogFooter>
					</form>
				</Form>
			</DialogContent>
		</Dialog>
	);
}

// ────────────────────────────────────────────────────────────────────────────
// Edit dialog
// ────────────────────────────────────────────────────────────────────────────

function EditFieldDialog({
	orgId,
	field,
	open,
	onOpenChange,
}: {
	orgId: Id<"orgs">;
	field: FieldDef;
	open: boolean;
	onOpenChange: (v: boolean) => void;
}) {
	const update = useMutation(api.crm.fields.fieldDefinitions.mutations.update);

	const { form, isSubmitting, handleSubmit } = useSettingsForm({
		schema: editFieldSchema,
		values: {
			label: field.label,
			groupName: field.groupName ?? "",
			required: field.required ?? false,
			optionsText: (field.options ?? []).join(", "),
		},
		onSubmit: async (data: EditFieldInput) => {
			const needsOptions = field.type === "select" || field.type === "multiselect";
			const options = parseOptions(data.optionsText);
			if (needsOptions && !options?.length) {
				toast.error("Enter at least one option.");
				return;
			}
			try {
				await update({
					orgId,
					fieldId: field._id,
					label: data.label,
					groupName: data.groupName || undefined,
					required: data.required,
					options: needsOptions ? options : undefined,
				});
				toast.success("Field updated");
				onOpenChange(false);
			} catch (err) {
				toast.error(err instanceof Error ? err.message : "Failed to update field");
			}
		},
	});

	const needsOptions = field.type === "select" || field.type === "multiselect";

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="sm:max-w-md">
				<DialogHeader>
					<DialogTitle>Edit field</DialogTitle>
					<DialogDescription>
						Field type and key can't be changed once created.
					</DialogDescription>
				</DialogHeader>
				<Form {...form}>
					<form onSubmit={handleSubmit} className="grid gap-4">
						<div className="grid gap-1">
							<Label className="text-xs text-muted-foreground">Key (read-only)</Label>
							<Input value={field.name} disabled className="font-mono text-xs" />
						</div>
						<div className="grid gap-1">
							<Label className="text-xs text-muted-foreground">
								Type (read-only)
							</Label>
							<Input value={field.type} disabled className="capitalize" />
						</div>
						<FormField
							control={form.control}
							name="label"
							render={({ field: f }) => (
								<FormItem>
									<FormLabel>Label</FormLabel>
									<FormControl>
										<Input {...f} />
									</FormControl>
									<FormMessage />
								</FormItem>
							)}
						/>
						{needsOptions && (
							<FormField
								control={form.control}
								name="optionsText"
								render={({ field: f }) => (
									<FormItem>
										<FormLabel>Options</FormLabel>
										<FormControl>
											<Input {...f} />
										</FormControl>
										<p className="text-xs text-muted-foreground">
											Comma- or newline-separated.
										</p>
										<FormMessage />
									</FormItem>
								)}
							/>
						)}
						<FormField
							control={form.control}
							name="groupName"
							render={({ field: f }) => (
								<FormItem>
									<FormLabel>Group</FormLabel>
									<FormControl>
										<Input {...f} />
									</FormControl>
								</FormItem>
							)}
						/>
						<FormField
							control={form.control}
							name="required"
							render={({ field: f }) => (
								<FormItem className="flex items-center justify-between rounded-[var(--radius)] border px-3 py-2">
									<FormLabel className="text-sm">Required</FormLabel>
									<FormControl>
										<Switch checked={f.value} onCheckedChange={f.onChange} />
									</FormControl>
								</FormItem>
							)}
						/>
						<DialogFooter>
							<Button
								type="button"
								variant="outline"
								size="sm"
								onClick={() => onOpenChange(false)}
							>
								Cancel
							</Button>
							<Button type="submit" size="sm" disabled={isSubmitting}>
								Save changes
							</Button>
						</DialogFooter>
					</form>
				</Form>
			</DialogContent>
		</Dialog>
	);
}

// ────────────────────────────────────────────────────────────────────────────
// Fields table (with edit + delete)
// ────────────────────────────────────────────────────────────────────────────

export function FieldEditor({ orgId, entityType }: { orgId: Id<"orgs">; entityType: string }) {
	const fields = useQuery(api.crm.fields.fieldDefinitions.queries.listByEntity, {
		orgId,
		entityType,
	});
	const remove = useMutation(api.crm.fields.fieldDefinitions.mutations.remove);
	const update = useMutation(api.crm.fields.fieldDefinitions.mutations.update);
	const reorder = useMutation(api.crm.fields.fieldDefinitions.mutations.reorder);

	const [editing, setEditing] = useState<FieldDef | null>(null);

	return (
		<div className="flex flex-col gap-3">
			<div className="flex justify-end">
				<CreateFieldDialog orgId={orgId} entityType={entityType} />
			</div>

			{fields === undefined ? null : fields.length === 0 ? (
				<div className="rounded-[var(--radius)] border border-dashed py-8 text-center text-sm text-muted-foreground">
					No custom fields yet — click <b>Add field</b> to create one.
				</div>
			) : (
				<SortableFieldsTable
					orgId={orgId}
					fields={fields}
					setEditing={setEditing}
					update={update}
					remove={remove}
					reorder={reorder}
				/>
			)}

			{editing && (
				<EditFieldDialog
					orgId={orgId}
					field={editing}
					open={!!editing}
					onOpenChange={(v) => !v && setEditing(null)}
				/>
			)}
		</div>
	);
}

// ────────────────────────────────────────────────────────────────────────────
// Sortable table — drag rows to reorder field sequence (form, table, profile)
// ────────────────────────────────────────────────────────────────────────────

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

function SortableFieldsTable({
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
