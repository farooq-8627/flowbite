"use client";

import { useMutation } from "convex/react";
import { Plus } from "lucide-react";
import { useState } from "react";
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
import { MultiSelect, type MultiSelectOption } from "@/components/ui/multi-select";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { FILE_CATEGORIES } from "@/core/data-io/files/file-categories";
import { normalizeError } from "@/lib/normalizeError";
import { useSettingsForm } from "../../../hooks/useSettingsForm";

export const FIELD_TYPES = [
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

export function parseOptions(text?: string): string[] | undefined {
	if (!text) return undefined;
	const items = text
		.split(/[\n,]/)
		.map((s) => s.trim())
		.filter(Boolean);
	return items.length > 0 ? items : undefined;
}

function labelToName(label: string): string {
	return label
		.trim()
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "_")
		.replace(/^_+|_+$/g, "")
		.replace(/^[0-9]/, "f_$&");
}

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
	allowedFileTypes: z.array(z.string()).optional(),
});
type CreateFieldInput = z.infer<typeof createFieldSchema>;

/**
 * Multi-select options for the per-field "allowed file types" picker.
 * Mirrors `core/data-io/files/file-categories.ts` minus the "other"
 * fallback (selecting it would be equivalent to leaving the picker
 * empty — confusing). Picker empty = any file allowed.
 */
const FILE_TYPE_OPTIONS: MultiSelectOption[] = FILE_CATEGORIES.filter((c) => c.id !== "other").map(
	(c) => ({
		value: c.id,
		label: c.label,
		subtitle: c.description,
	}),
);

export function CreateFieldDialog({
	orgId,
	entityType,
}: {
	orgId: Id<"orgs">;
	entityType: string;
}) {
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
			allowedFileTypes: [],
		},
		onSubmit: async (data: CreateFieldInput) => {
			const needsOptions = data.type === "select" || data.type === "multiselect";
			const isFileType = data.type === "file" || data.type === "files";
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
					allowedFileTypes:
						isFileType && data.allowedFileTypes && data.allowedFileTypes.length > 0
							? data.allowedFileTypes
							: undefined,
				});
				toast.success(`Added field "${data.label}"`);
				form.reset({
					label: "",
					name: "",
					type: "text",
					groupName: "",
					required: false,
					optionsText: "",
					allowedFileTypes: [],
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
						{(type === "file" || type === "files") && (
							<FormField
								control={form.control}
								name="allowedFileTypes"
								render={({ field }) => (
									<FormItem>
										<FormLabel>Allowed file types</FormLabel>
										<FormControl>
											<MultiSelect
												value={field.value ?? []}
												onChange={field.onChange}
												options={FILE_TYPE_OPTIONS}
												placeholder="Any file type"
												searchPlaceholder="Search categories…"
												emptyText="No categories found."
											/>
										</FormControl>
										<p className="text-xs text-muted-foreground">
											Leave empty to accept any file. Pick one or more
											categories to restrict (e.g. only PDFs + images).
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
