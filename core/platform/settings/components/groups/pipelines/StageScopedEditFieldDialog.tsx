"use client";

/**
 * StageScopedEditFieldDialog — drop-in replacement for `EditFieldDialog`
 * that adds a "Visible on stages" multi-select.
 *
 * Lets the admin pin / unpin the field across multiple stages of the
 * pipeline without leaving the editor. An empty selection means
 * "show on every stage" (matching `useEntityFields`'s filter rule).
 */

import { useMutation } from "convex/react";
import { useState } from "react";
import { toast } from "sonner";
import { z } from "zod/v4";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
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
import { MultiSelect, type MultiSelectOption } from "@/components/ui/multi-select";
import { Switch } from "@/components/ui/switch";
import { api } from "@/convex/_generated/api";
import type { Doc, Id } from "@/convex/_generated/dataModel";
import { FILE_CATEGORIES } from "@/core/data-io/files/file-categories";
import { normalizeError } from "@/lib/normalizeError";
import { useSettingsForm } from "../../../hooks/useSettingsForm";
import { parseOptions } from "../modules/CreateFieldDialog";

type FieldDef = Doc<"fieldDefinitions">;
type Pipeline = Doc<"pipelines">;

const editFieldSchema = z.object({
	label: z.string().min(1, "Label is required"),
	required: z.boolean(),
	optionsText: z.string().optional(),
	allowedFileTypes: z.array(z.string()).optional(),
});
type EditFieldInput = z.infer<typeof editFieldSchema>;

const FILE_TYPE_OPTIONS: MultiSelectOption[] = FILE_CATEGORIES.filter((c) => c.id !== "other").map(
	(c) => ({ value: c.id, label: c.label, subtitle: c.description }),
);

export function StageScopedEditFieldDialog({
	orgId,
	pipeline,
	field,
	open,
	onOpenChange,
}: {
	orgId: Id<"orgs">;
	pipeline: Pipeline;
	field: FieldDef;
	open: boolean;
	onOpenChange: (v: boolean) => void;
}) {
	const update = useMutation(api.crm.fields.fieldDefinitions.mutations.update);

	// Local state for the stage-pin checkboxes — kept separate from the form
	// so we can persist them via a single mutation alongside the rest.
	const [showInStages, setShowInStages] = useState<string[]>(field.showInStages ?? []);
	const stages = [...pipeline.stages].sort((a, b) => a.order - b.order);

	const isFileField = field.type === "file" || field.type === "files";

	const { form, isSubmitting, handleSubmit } = useSettingsForm({
		schema: editFieldSchema,
		values: {
			label: field.label,
			required: field.required ?? false,
			optionsText: (field.options ?? []).join(", "),
			allowedFileTypes: field.allowedFileTypes ?? [],
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
					required: data.required,
					options: needsOptions ? options : undefined,
					// Empty array clears the restriction (= show on every stage).
					showInStages,
					// For non-file types we don't pass this through at all
					// — the server ignores it anyway, but skipping keeps
					// the activity log clean.
					allowedFileTypes: isFileField ? (data.allowedFileTypes ?? []) : undefined,
				});
				toast.success("Field updated");
				onOpenChange(false);
			} catch (err) {
				toast.error(normalizeError(err, "Failed to update field"));
			}
		},
	});

	const needsOptions = field.type === "select" || field.type === "multiselect";

	// Locked rule (2026-05-20): empty `showInStages` means "not pinned
	// anywhere" — i.e. the field is invisible on every form. We surface
	// this in red so admins understand it's a misconfiguration, not a
	// "show everywhere" shortcut.
	const isUnpinned = showInStages.length === 0;

	// The Default stage rows in the multi-select are not freely
	// uncheckable when this is the ONLY default-pin keeping the field
	// in any pipeline's Defaults tab. We don't try to enforce that
	// invariant client-side beyond a hint — the server (or admin) can
	// always re-pin via the migration if needed.
	const togglePin = (stageId: string) => {
		setShowInStages((prev) => {
			if (prev.includes(stageId)) return prev.filter((id) => id !== stageId);
			return [...prev, stageId];
		});
	};

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
						{isFileField && (
							<FormField
								control={form.control}
								name="allowedFileTypes"
								render={({ field: f }) => (
									<FormItem>
										<FormLabel>Allowed file types</FormLabel>
										<FormControl>
											<MultiSelect
												value={f.value ?? []}
												onChange={f.onChange}
												options={FILE_TYPE_OPTIONS}
												placeholder="Any file type"
												searchPlaceholder="Search categories…"
												emptyText="No categories found."
											/>
										</FormControl>
										<p className="text-xs text-muted-foreground">
											Leave empty to accept any file. Pick categories to
											restrict (e.g. PDFs + images only).
										</p>
										<FormMessage />
									</FormItem>
								)}
							/>
						)}
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

						{/* Per-stage visibility — stays inside the dialog so admins
						    can move a field across stages from one place. */}
						<div className="grid gap-2 rounded-[var(--radius)] border px-3 py-2">
							<div>
								<Label className="text-sm">Visible on stages</Label>
								<p
									className={
										isUnpinned
											? "text-xs text-destructive"
											: "text-xs text-muted-foreground"
									}
								>
									{isUnpinned
										? "Not pinned to any stage — this field is invisible on every form. Pick at least one stage below."
										: `Pinned to ${showInStages.length} of ${stages.length} stages.`}
								</p>
							</div>
							<div className="flex max-h-44 flex-col gap-0.5 overflow-y-auto pe-1">
								{stages.map((s) => {
									const checked = showInStages.includes(s.id);
									const isDef = s.isDefaultStage === true;
									return (
										<button
											key={s.id}
											type="button"
											className="flex items-center gap-2 rounded-[var(--radius)] px-1.5 py-1 text-start text-xs hover:bg-muted/40"
											onClick={() => togglePin(s.id)}
										>
											<Checkbox
												checked={checked}
												onCheckedChange={() => togglePin(s.id)}
											/>
											<span className="flex flex-1 items-center gap-1.5">
												<span
													className="size-2.5 rounded-full"
													style={{
														backgroundColor: s.color ?? "#94a3b8",
													}}
												/>
												<span className="font-medium">{s.name}</span>
												{isDef && (
													<Badge
														variant="secondary"
														className="text-[9px] font-normal"
													>
														Default
													</Badge>
												)}
												<Badge
													variant="outline"
													className="font-mono text-[9px]"
												>
													{s.code}
												</Badge>
											</span>
										</button>
									);
								})}
							</div>
						</div>

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
