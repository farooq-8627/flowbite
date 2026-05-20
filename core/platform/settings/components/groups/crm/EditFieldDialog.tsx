"use client";

import { useMutation } from "convex/react";
import { toast } from "sonner";
import { z } from "zod/v4";
import { Button } from "@/components/ui/button";
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
import { Switch } from "@/components/ui/switch";
import { api } from "@/convex/_generated/api";
import type { Doc, Id } from "@/convex/_generated/dataModel";
import { normalizeError } from "@/lib/normalizeError";
import { useSettingsForm } from "../../../hooks/useSettingsForm";
import { parseOptions } from "./CreateFieldDialog";

type FieldDef = Doc<"fieldDefinitions">;

const editFieldSchema = z.object({
	label: z.string().min(1, "Label is required"),
	groupName: z.string().optional(),
	required: z.boolean(),
	optionsText: z.string().optional(),
});
type EditFieldInput = z.infer<typeof editFieldSchema>;

export function EditFieldDialog({
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
				toast.error(normalizeError(err, "Failed to update field"));
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
