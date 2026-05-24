"use client";

/**
 * StageFieldsTable — per-stage scoped wrapper around the existing FieldEditor
 * primitives (`SortableFieldsTable`, `CreateFieldDialog`, `EditFieldDialog`).
 *
 * Why this exists
 * ───────────────
 * The Modules → Lead/Contact/Company tab uses `<FieldEditor>` to manage
 * EVERY field for that entity type. Deals have an extra dimension: each
 * field can be pinned to one or more stages via
 * `fieldDefinitions.showInStages`. Owners want to manage fields *per
 * stage* — "what fields show up while a deal is in Negotiation?".
 *
 * Behaviour
 * ─────────
 *   - Lists only the deal fields whose `showInStages` includes `stageId`,
 *     OR (when `mode === "everywhere"`) whose `showInStages` is empty.
 *   - "Add field" creates a new fieldDefinition with `entityType: "deal"`
 *     and pins it to the current stage (or leaves `showInStages` empty in
 *     "everywhere" mode).
 *   - "Pin to other stages" inside the EditFieldDialog handles cross-stage
 *     visibility — uses the existing `fieldDefinitions.update` mutation
 *     with a `showInStages` payload.
 *   - Reorder, hide, delete, edit reuse the existing primitives.
 *
 * The pipeline is passed in (not just stageId) so the component can render
 * a "Pin to other stages" picker inside the edit dialog without re-querying.
 */

import { useMutation, useQuery } from "convex/react";
import { Plus } from "lucide-react";
import { useMemo, useState } from "react";
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
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { api } from "@/convex/_generated/api";
import type { Doc, Id } from "@/convex/_generated/dataModel";
import { normalizeError } from "@/lib/normalizeError";
import { useSettingsForm } from "../../../hooks/useSettingsForm";
import { FIELD_TYPES, parseOptions } from "../modules/CreateFieldDialog";
import { SortableFieldsTable } from "../modules/SortableFieldsTable";
import { StageScopedEditFieldDialog } from "./StageScopedEditFieldDialog";

type FieldDef = Doc<"fieldDefinitions">;
type Pipeline = Doc<"pipelines">;

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
	required: z.boolean(),
	optionsText: z.string().optional(),
});
type CreateFieldInput = z.infer<typeof createFieldSchema>;

function labelToName(label: string): string {
	return label
		.trim()
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "_")
		.replace(/^_+|_+$/g, "")
		.replace(/^[0-9]/, "f_$&");
}

interface StageFieldsTableProps {
	orgId: Id<"orgs">;
	pipeline: Pipeline;
	/**
	 * Stage to scope this editor instance to.
	 *
	 * Locked rule (2026-05-20): every editor instance is scoped to ONE
	 * concrete stage. The Default stage is no longer special-cased — it's
	 * a stage like any other, just with `isDefaultStage: true` on the
	 * stage row. Fields with empty `showInStages` are never shown in any
	 * editor (they are unpinned and effectively invisible).
	 */
	scope: { kind: "stage"; stageId: string };
}

export function StageFieldsTable({ orgId, pipeline, scope }: StageFieldsTableProps) {
	const allFields = useQuery(api.crm.fields.fieldDefinitions.queries.listByEntity, {
		orgId,
		entityType: "deal",
	});
	const update = useMutation(api.crm.fields.fieldDefinitions.mutations.update);
	const remove = useMutation(api.crm.fields.fieldDefinitions.mutations.remove);
	const reorder = useMutation(api.crm.fields.fieldDefinitions.mutations.reorder);

	const [editing, setEditing] = useState<FieldDef | null>(null);

	// Strict filter — only show fields that are explicitly pinned to this
	// stage. Empty / missing `showInStages` is "not pinned anywhere" and
	// never appears in any editor.
	const scopedFields = useMemo<FieldDef[]>(() => {
		if (!allFields) return [];
		const stageId = scope.stageId;
		return allFields.filter((f) => f.showInStages?.includes(stageId));
	}, [allFields, scope]);

	// Active stage row (used for copy + the "Default" badge).
	const activeStage = useMemo(
		() => pipeline.stages.find((s) => s.id === scope.stageId),
		[pipeline.stages, scope.stageId],
	);
	const isDefaultStage = activeStage?.isDefaultStage === true;

	return (
		<div className="flex flex-col gap-3">
			<div className="flex flex-wrap items-center justify-between gap-2">
				<div className="flex items-center gap-2">
					<span className="text-xs text-muted-foreground">
						{scopedFields.length} field{scopedFields.length === 1 ? "" : "s"}
						{isDefaultStage && (
							<>
								{" · "}
								<Badge variant="secondary" className="text-[10px] font-normal">
									Always-on across every {pipeline.name} deal
								</Badge>
							</>
						)}
					</span>
				</div>
				<CreateScopedFieldDialog orgId={orgId} pipeline={pipeline} scope={scope} />
			</div>

			{allFields === undefined ? (
				<div className="rounded-[var(--radius)] border border-dashed py-6 text-center text-xs text-muted-foreground">
					Loading fields…
				</div>
			) : scopedFields.length === 0 ? (
				<div className="rounded-[var(--radius)] border border-dashed py-6 text-center text-xs text-muted-foreground">
					{isDefaultStage
						? "No default fields yet — click \u201CAdd field\u201D to add one. These are the fields every deal in this pipeline carries (always present, no matter the stage)."
						: "No fields pinned to this stage yet — click \u201CAdd field\u201D to add a stage-specific one."}
				</div>
			) : (
				<SortableFieldsTable
					orgId={orgId}
					fields={scopedFields}
					setEditing={setEditing}
					update={update}
					remove={remove}
					reorder={reorder}
				/>
			)}

			{editing && (
				<StageScopedEditFieldDialog
					orgId={orgId}
					pipeline={pipeline}
					field={editing}
					open={!!editing}
					onOpenChange={(v) => !v && setEditing(null)}
				/>
			)}
		</div>
	);
}

// ─── Inline Add-field dialog (auto-pins to the active stage) ───────────────

function CreateScopedFieldDialog({
	orgId,
	pipeline,
	scope,
}: {
	orgId: Id<"orgs">;
	pipeline: Pipeline;
	scope: { kind: "stage"; stageId: string };
}) {
	const [open, setOpen] = useState(false);
	const create = useMutation(api.crm.fields.fieldDefinitions.mutations.create);
	const updateField = useMutation(api.crm.fields.fieldDefinitions.mutations.update);

	const stage = pipeline.stages.find((s) => s.id === scope.stageId);
	const isDefaultStage = stage?.isDefaultStage === true;
	const ctxLabel = isDefaultStage
		? `every ${pipeline.name} deal (Default stage)`
		: `stage "${stage?.name ?? "?"}"`;

	const { form, isSubmitting, handleSubmit } = useSettingsForm({
		schema: createFieldSchema,
		values: {
			label: "",
			name: "",
			type: "text",
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
				const fieldId = await create({
					orgId,
					entityType: "deal",
					name: data.name,
					label: data.label,
					type: data.type,
					required: data.required,
					options: needsOptions ? options : undefined,
				});

				// Always pin newly-created fields to the active stage.
				// Empty `showInStages` means "not pinned anywhere" and would
				// hide the field from every form, so we never leave it that
				// way after the create flow.
				if (fieldId) {
					await updateField({
						orgId,
						fieldId,
						showInStages: [scope.stageId],
					});
				}

				toast.success(`Added field "${data.label}"`);
				form.reset({
					label: "",
					name: "",
					type: "text",
					required: false,
					optionsText: "",
				});
				setOpen(false);
			} catch (err) {
				toast.error(normalizeError(err, "Failed to create field"));
			}
		},
	});

	const type = form.watch("type");
	const label = form.watch("label");
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
						This field will appear when a deal is in {ctxLabel}.
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
										<Input placeholder="e.g. Ejari Number" {...field} />
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
											placeholder="ejari_number"
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
											<Input placeholder="Option 1, Option 2" {...field} />
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
							name="required"
							render={({ field }) => (
								<FormItem className="flex items-center justify-between rounded-[var(--radius)] border px-3 py-2">
									<div>
										<FormLabel className="text-sm">
											Required{" "}
											{isDefaultStage ? "on every deal" : "at this stage"}
										</FormLabel>
										<p className="text-xs text-muted-foreground">
											{isDefaultStage
												? "When required, every new deal must have this filled before it can be created."
												: "When required + the pipeline policy is \u201Cblock\u201D, deals can't enter this stage without a value."}
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
