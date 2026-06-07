"use client";

/**
 * Owner-panel group editor (Stage 2).
 *
 * Edit a single `platformIndustryGroups` row: label, description, icon,
 * sortOrder, visible. Plus a sub-list of templates that live in this
 * group with quick on/off + reorder.
 *
 * Spec: INDUSTRY-TEMPLATES-DB-MIGRATION.md §5.3 GroupEditorView.
 */

import { useMutation, useQuery } from "convex/react";
import { ArrowLeft, Loader2 } from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo } from "react";
import { toast } from "sonner";
import { z } from "zod/v4";
import { Button } from "@/components/ui/button";
import { Form } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { api } from "@/convex/_generated/api";
import { useSettingsForm } from "@/core/platform/settings/hooks/useSettingsForm";
import { normalizeError } from "@/lib/normalizeError";
import { OwnerSettingsCard } from "../../components/OwnerSettingsCard";
import { useOwnerPublicPrefix } from "../../hooks/useOwnerPublicPrefix";

const formSchema = z.object({
	label: z.string().trim().min(1, "Required").max(60),
	description: z.string().trim().max(280).optional(),
	icon: z.string().trim().max(8).optional(),
	sortOrder: z.coerce.number().int().min(0),
	visible: z.boolean(),
});

type FormValues = z.infer<typeof formSchema>;

export function GroupEditorView({ groupKey }: { groupKey: string }) {
	const prefix = useOwnerPublicPrefix() ?? "";
	const group = useQuery(api._platform.industries.queries.getGroupForAdmin, { groupKey });
	const allTemplates = useQuery(api._platform.industries.queries.listAllForAdmin, {});

	const updateGroup = useMutation(api._platform.industries.mutations.updateGroup);
	const setGroupVisible = useMutation(api._platform.industries.mutations.setGroupVisible);
	const setTemplateVisible = useMutation(api._platform.industries.mutations.setTemplateVisible);
	const reorderTemplates = useMutation(api._platform.industries.mutations.reorderTemplates);

	const groupTemplates = useMemo(
		() => (allTemplates ?? []).filter((t) => t.groupKey === groupKey),
		[allTemplates, groupKey],
	);

	const initial = useMemo<FormValues | null>(() => {
		if (!group) return null;
		return {
			label: group.label,
			description: group.description ?? "",
			icon: group.icon ?? "",
			sortOrder: group.sortOrder,
			visible: group.visible,
		};
	}, [group]);

	if (group === undefined) {
		return (
			<div className="flex items-center gap-2 text-sm text-muted-foreground">
				<Loader2 className="h-4 w-4 animate-spin" /> Loading group…
			</div>
		);
	}
	if (group === null) {
		return (
			<OwnerSettingsCard
				title="Group not found"
				description={`No platformIndustryGroups row with groupKey "${groupKey}".`}
			>
				<Link
					href={`${prefix}/industries`}
					className="text-sm text-muted-foreground underline hover:text-foreground"
				>
					Back to industries
				</Link>
			</OwnerSettingsCard>
		);
	}

	return (
		<div className="flex flex-col gap-4">
			<div className="flex items-center justify-between">
				<Link
					href={`${prefix}/industries`}
					className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
				>
					<ArrowLeft className="h-3.5 w-3.5" /> All industries
				</Link>
				<span className="text-[11px] text-muted-foreground">
					Last updated{" "}
					{group.updatedAt ? new Date(group.updatedAt).toLocaleString() : "—"}
				</span>
			</div>

			{initial ? (
				<GroupForm
					initial={initial}
					title={`Group · ${group.label}`}
					description={`Stable key: ${groupKey}. Drives step 1 of the onboarding picker. Uniqueness key, cannot be renamed; remove + recreate to change.`}
					onSubmit={async (data) => {
						await updateGroup({
							groupKey,
							patch: {
								label: data.label,
								description: data.description || undefined,
								icon: data.icon || undefined,
								sortOrder: data.sortOrder,
							},
						});
						if (data.visible !== group.visible) {
							await setGroupVisible({ groupKey, visible: data.visible });
						}
					}}
				/>
			) : null}

			<OwnerSettingsCard
				title="Templates in this group"
				description="Toggle visibility per template, or reorder them inside the group. Use the main industries list for full edits."
			>
				{groupTemplates.length === 0 ? (
					<p className="text-sm text-muted-foreground">
						No templates in this group yet. Create one from the main industries list
						(coming Stage 3) or move an existing one here via its editor.
					</p>
				) : (
					<ul className="divide-y divide-border/60">
						{groupTemplates.map((t, idx) => (
							<li key={t._id} className="flex items-center gap-2 py-2 text-sm">
								<div className="flex w-12 flex-col items-center gap-0.5">
									<Button
										type="button"
										size="sm"
										variant="ghost"
										className="h-5 w-5 p-0"
										disabled={idx === 0}
										onClick={async () => {
											const ordered = groupTemplates.map(
												(x) => x.templateKey,
											);
											const [item] = ordered.splice(idx, 1);
											if (!item) return;
											ordered.splice(idx - 1, 0, item);
											try {
												await reorderTemplates({
													groupKey,
													ordered,
												});
											} catch (err) {
												toast.error(
													normalizeError(err, "Failed to reorder"),
												);
											}
										}}
									>
										↑
									</Button>
									<Button
										type="button"
										size="sm"
										variant="ghost"
										className="h-5 w-5 p-0"
										disabled={idx === groupTemplates.length - 1}
										onClick={async () => {
											const ordered = groupTemplates.map(
												(x) => x.templateKey,
											);
											const [item] = ordered.splice(idx, 1);
											if (!item) return;
											ordered.splice(idx + 1, 0, item);
											try {
												await reorderTemplates({
													groupKey,
													ordered,
												});
											} catch (err) {
												toast.error(
													normalizeError(err, "Failed to reorder"),
												);
											}
										}}
									>
										↓
									</Button>
								</div>
								<span className="flex-shrink-0 text-base">{t.icon ?? "🏷️"}</span>
								<div className="min-w-0 flex-1">
									<p className="truncate font-medium">{t.label}</p>
									<p className="truncate font-mono text-[11px] text-muted-foreground">
										{t.templateKey}
										{t.isArchived ? " · archived" : ""}
									</p>
								</div>
								<Switch
									checked={t.visible}
									onCheckedChange={async (v) => {
										try {
											await setTemplateVisible({
												templateKey: t.templateKey,
												visible: v,
											});
										} catch (err) {
											toast.error(normalizeError(err, "Failed to toggle"));
										}
									}}
								/>
								<Link
									href={`${prefix}/industries/${encodeURIComponent(t.templateKey)}`}
									className="rounded-[var(--radius)] px-2 py-1 text-xs text-muted-foreground hover:bg-muted hover:text-foreground"
								>
									Edit
								</Link>
							</li>
						))}
					</ul>
				)}
			</OwnerSettingsCard>
		</div>
	);
}

function GroupForm({
	initial,
	title,
	description,
	onSubmit,
}: {
	initial: FormValues;
	title: string;
	description: string;
	onSubmit: (data: FormValues) => Promise<void>;
}) {
	// `useSettingsForm` re-syncs `values` on every render; we use a stable
	// identity for `values` via memoising the object.
	const memoInitial = useMemo(() => ({ ...initial }), [initial]);
	const { form, isSubmitting, isDirty, handleSubmit } = useSettingsForm<FormValues>({
		schema: formSchema,
		values: memoInitial,
		onSubmit,
	});

	// Re-sync when initial changes (e.g. after a save the server returns
	// a fresh `updatedAt`). React-hook-form's `useForm` would otherwise
	// keep stale values.
	useEffect(() => {
		form.reset(memoInitial);
	}, [memoInitial, form]);

	return (
		<OwnerSettingsCard title={title} description={description}>
			<Form {...form}>
				<form
					onSubmit={async (e) => {
						try {
							await handleSubmit(e);
							toast.success("Group saved");
						} catch (err) {
							toast.error(normalizeError(err, "Failed to save"));
						}
					}}
					className="space-y-4"
				>
					<div className="grid gap-4 sm:grid-cols-2">
						<LabelledField
							label="Label"
							error={form.formState.errors.label?.message?.toString()}
						>
							<Input {...form.register("label")} autoComplete="off" />
						</LabelledField>
						<LabelledField
							label="Icon (emoji)"
							hint="Single emoji shown on the onboarding card."
							error={form.formState.errors.icon?.message?.toString()}
						>
							<Input {...form.register("icon")} autoComplete="off" placeholder="🏠" />
						</LabelledField>
						<LabelledField
							label="Sort order"
							hint="Ascending: lower comes first."
							error={form.formState.errors.sortOrder?.message?.toString()}
						>
							<Input
								type="number"
								min={0}
								step="10"
								{...form.register("sortOrder")}
							/>
						</LabelledField>
						<LabelledField
							label="Visible in onboarding"
							hint="Hide the whole group without affecting existing customers."
						>
							<Switch
								checked={form.watch("visible")}
								onCheckedChange={(v) =>
									form.setValue("visible", v, {
										shouldDirty: true,
										shouldValidate: true,
									})
								}
							/>
						</LabelledField>
					</div>
					<LabelledField
						label="Description"
						hint="Short marketing line shown under the group card."
						error={form.formState.errors.description?.message?.toString()}
					>
						<Textarea rows={3} {...form.register("description")} />
					</LabelledField>

					<div className="flex justify-end gap-2 pt-1">
						<Button
							type="button"
							variant="outline"
							size="sm"
							disabled={isSubmitting || !isDirty}
							onClick={() => form.reset(memoInitial)}
						>
							Reset
						</Button>
						<Button type="submit" size="sm" disabled={isSubmitting || !isDirty}>
							{isSubmitting ? (
								<Loader2 className="me-2 h-4 w-4 animate-spin" />
							) : null}
							Save group
						</Button>
					</div>
				</form>
			</Form>
		</OwnerSettingsCard>
	);
}

function LabelledField({
	label,
	hint,
	error,
	children,
}: {
	label: string;
	hint?: string;
	error?: string;
	children: React.ReactNode;
}) {
	return (
		<div className="flex flex-col gap-1">
			<span className="text-xs font-medium text-foreground">{label}</span>
			{children}
			{hint ? <span className="text-[11px] text-muted-foreground">{hint}</span> : null}
			{error ? <span className="text-[11px] text-destructive">{error}</span> : null}
		</div>
	);
}
